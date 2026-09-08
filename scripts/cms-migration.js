#!/usr/bin/env node
/**
 * UHS CMS migration audit / safe migration tool.
 *
 * Default: READ-ONLY audit. Nothing is changed.
 * --migrate: copy legacy editable_content into the Phase 2 CMS.
 * --create-draft-page: with --migrate, group migrated blocks under a new
 *                       draft page/sections. The page is never published.
 *
 * Source rows are NEVER deleted or modified by this tool.
 */
import 'dotenv/config';
import pg from 'pg';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const args = new Set(process.argv.slice(2));
const migrate = args.has('--migrate');
const createDraftPage = args.has('--create-draft-page');
const promote = args.has('--promote');

if (promote && migrate) {
  console.error('--promote is a cutover operation and cannot be combined with --migrate');
  process.exit(2);
}
if (promote && process.env.CMS_CUTOVER_CONFIRM !== 'YES') {
  console.error('Refusing cutover: set CMS_CUTOVER_CONFIRM=YES and run with --promote.');
  process.exit(2);
}
if (createDraftPage && !migrate) {
  console.error('--create-draft-page requires --migrate');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(2);
}

const TYPE_TO_BLOCK = {
  medication: 'medication',
  procedure: 'procedure',
  equipment: 'equipment',
  emergency: 'emergency',
  question: 'tts',
  surgery: 'document',
  'rp-action': 'rp',
  scene: 'document',
  'section-text': 'text',
  theme: 'document',
  generic: 'document'
};

const NAV_TYPE = 'nav';
const CATEGORY_TYPE = {
  'rp-action': 'rp_action',
  question: 'tts_action',
  'section-text': 'document',
  surgery: 'document',
  scene: 'document',
  theme: 'generic',
  generic: 'generic'
};

function slugify(value) {
  return String(value || '')
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'uncategorized';
}

function safeName(row) {
  return row.item_name || row.content?.name || row.content?.title ||
    row.content?.label || row.content?.text || row.content_key;
}

async function tableExists(client, name) {
  const q = await client.query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${name}`]
  );
  return q.rows[0].exists;
}

export async function audit(client) {
  const tables = [
    'editable_content',
    'cms_pages',
    'cms_page_sections',
    'cms_content_blocks',
    'cms_navigation',
    'cms_categories',
    'cms_content_versions'
  ];
  const availability = {};
  for (const t of tables) availability[t] = await tableExists(client, t);

  if (!availability.editable_content) {
    throw new Error('editable_content does not exist; run the application once to initialise the schema.');
  }

  const rows = (await client.query(`
    SELECT content_key, content_type, content, item_name, is_published,
           order_index, slug, category, visibility, status,
           created_at, updated_at
    FROM editable_content
    ORDER BY content_type, order_index, content_key
  `)).rows;

  const byType = {};
  const categories = {};
  let unnamed = 0;
  let emptyContent = 0;

  for (const row of rows) {
    byType[row.content_type] ??= { count: 0, published: 0, hidden: 0, named: 0, empty: 0, sample: [] };
    const x = byType[row.content_type];
    x.count++;
    if (row.is_published) x.published++; else x.hidden++;
    if (row.item_name) x.named++; else unnamed++;
    if (row.content && typeof row.content === 'object' &&
        !Array.isArray(row.content) && Object.keys(row.content).length) {
      // non-empty
    } else {
      x.empty++;
      emptyContent++;
    }
    if (x.sample.length < 5) x.sample.push({
      key: row.content_key,
      name: safeName(row),
      category: row.category || row.content?.category || null
    });

    const category = row.category || row.content?.category;
    if (category) {
      const ckey = `${row.content_type}:${String(category).trim().toLowerCase()}`;
      categories[ckey] ??= { content_type: row.content_type, name: String(category).trim(), count: 0 };
      categories[ckey].count++;
    }
  }

  const structuredCounts = {};
  for (const t of ['cms_pages','cms_page_sections','cms_content_blocks','cms_navigation','cms_categories','cms_content_versions']) {
    if (!availability[t]) structuredCounts[t] = null;
    else structuredCounts[t] = Number((await client.query(`SELECT COUNT(*)::int AS n FROM ${t}`)).rows[0].n);
  }

  const legacyByType = Object.entries(byType).map(([type, info]) => ({
    type, ...info, proposed_destination:
      type === NAV_TYPE ? 'cms_navigation' : (TYPE_TO_BLOCK[type] ? 'cms_content_blocks' : 'manual-review')
  }));

  return {
    generated_at: new Date().toISOString(),
    mode: migrate ? 'migration' : 'audit-only',
    source: {
      table: 'editable_content',
      total_rows: rows.length,
      unnamed_rows: unnamed,
      empty_content_rows: emptyContent
    },
    structured_tables: availability,
    structured_counts: structuredCounts,
    legacy_by_type: legacyByType,
    categories: Object.values(categories).sort((a,b) => b.count - a.count),
    migration_rules: {
      content_types_to_blocks: TYPE_TO_BLOCK,
      nav_type_to_navigation: NAV_TYPE,
      theme_and_generic: 'copied as document blocks; no deletion',
      source_preserved: true
    }
  };
}

export async function migrateRows(client, report, { createDraftPage: shouldCreateDraftPage = true } = {}) {
  const rows = (await client.query(`
    SELECT content_key, content_type, content, item_name, is_published,
           order_index, category
    FROM editable_content
    ORDER BY content_type, order_index, content_key
  `)).rows;

  for (const required of ['cms_content_blocks', 'cms_navigation', 'cms_categories', 'cms_content_versions']) {
    if (!await tableExists(client, required)) {
      throw new Error(`${required} does not exist. Start the application once before migrating.`);
    }
  }

  let draftPageId = null;
  const sectionByType = new Map();
  if (shouldCreateDraftPage) {
    const existingPage = await client.query(
      `SELECT id FROM cms_pages
       WHERE slug='legacy-content-migration'
       ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,
                created_at ASC LIMIT 1`
    );
    if (existingPage.rows.length) {
      draftPageId = existingPage.rows[0].id;
      await client.query(
        `UPDATE cms_pages
         SET name='Legacy Content Migration',
             description='Draft container for content migrated from editable_content. Review before publishing.',
             status='draft', visibility='admin', deleted_at=NULL, updated_at=NOW()
         WHERE id=$1`,
        [draftPageId]
      );
    } else {
      draftPageId = crypto.randomUUID();
      await client.query(
        `INSERT INTO cms_pages
         (id,name,slug,description,icon,order_index,status,visibility,template,created_by)
         VALUES ($1,$2,'legacy-content-migration',$3,$4,
                 COALESCE((SELECT MAX(order_index)+1 FROM cms_pages),0),
                 'draft','admin','standard',NULL)`,
        [draftPageId, 'Legacy Content Migration',
         'Draft container for content migrated from editable_content. Review before publishing.', '🗃️']
      );
    }
  }

  const result = { blocks: 0, navigation: 0, categories: 0, versions: 0, sections: 0 };

  // Use one deterministic key per source row so the migration is idempotent.
  for (const row of rows) {
    const sourceKey = `legacy-${slugify(row.content_type)}-${slugify(row.content_key)}`;
    const blockType = TYPE_TO_BLOCK[row.content_type] || 'document';
    const title = safeName(row);
    const category = row.category || row.content?.category || null;
    const content = {
      ...(row.content && typeof row.content === 'object' && !Array.isArray(row.content) ? row.content : { value: row.content }),
      _migration: { source_table: 'editable_content', source_key: row.content_key, source_type: row.content_type, source_published: row.is_published === true }
    };

    if (row.content_type === NAV_TYPE) {
      const label = row.content?.label || title;
      const url = row.content?.url || (row.content?.section ? `/${row.content.section}` : null);
      const existing = await client.query(
        `SELECT id FROM cms_navigation
         WHERE deleted_at IS NULL
           AND metadata->>'source_table'='editable_content'
           AND metadata->>'source_key'=$1
         LIMIT 1`,
        [row.content_key]
      );
      if (!existing.rows.length) {
        await client.query(
          `INSERT INTO cms_navigation
           (id,label,url,icon,order_index,target,is_external,status,visibility,metadata)
           VALUES ($1,$2,$3,$4,$5,'_self',false,'draft','admin',$6)`,
          [crypto.randomUUID(), label, url, row.content?.icon || null, Number(row.content?.order ?? row.order_index ?? 0),
           JSON.stringify({ source_table: 'editable_content', source_key: row.content_key, source_type: row.content_type, source_published: row.is_published === true })]
        );
        result.navigation++;
      }
    } else {
      let sectionId = null;
      if (draftPageId) {
        if (!sectionByType.has(row.content_type)) {
          const existingSection = await client.query(
            `SELECT id FROM cms_page_sections
             WHERE page_id=$1 AND title=$2 AND deleted_at IS NULL
             ORDER BY order_index ASC, created_at ASC LIMIT 1`,
            [draftPageId, row.content_type]
          );
          if (existingSection.rows.length) {
            sectionId = existingSection.rows[0].id;
            await client.query(
              `UPDATE cms_page_sections
               SET status='draft', visibility='admin', updated_at=NOW()
               WHERE id=$1`,
              [sectionId]
            );
          } else {
            sectionId = crypto.randomUUID();
            await client.query(
              `INSERT INTO cms_page_sections
               (id,page_id,title,description,content,section_type,order_index,status,visibility)
               VALUES ($1,$2,$3,$4,$5,'content',$6,'draft','admin')`,
              [sectionId, draftPageId, row.content_type, `Migrated ${row.content_type} content`,
               JSON.stringify({ source_type: row.content_type, source_published: row.is_published === true }),
               sectionByType.size]
            );
            result.sections++;
          }
          sectionByType.set(row.content_type, sectionId);
        } else {
          sectionId = sectionByType.get(row.content_type);
        }
      }

      const existing = await client.query(
        `SELECT id FROM cms_content_blocks
         WHERE block_key=$1 AND block_type=$2
         ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,
                  created_at ASC LIMIT 1`,
        [sourceKey, blockType]
      );
      if (existing.rows.length) {
        await client.query(
          `UPDATE cms_content_blocks
           SET title=$1, content=$2, category=$3, section_id=$4, page_id=$5,
               status='draft', visibility='admin', deleted_at=NULL, updated_at=NOW()
           WHERE id=$6`,
          [title, JSON.stringify(content), category, sectionId, draftPageId, existing.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO cms_content_blocks
           (id,block_key,block_type,title,content,section_id,page_id,category,order_index,status,visibility)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft','admin')`,
          [crypto.randomUUID(), sourceKey, blockType, title, JSON.stringify(content),
           sectionId, draftPageId, category, Number(row.order_index || 0)]
        );
        result.blocks++;
      }
    }

    // Preserve a version snapshot under a namespaced key. This never touches the
    // original editable_content row.
    const versionKey = `legacy:${row.content_type}:${row.content_key}`;
    await client.query(
      `INSERT INTO cms_content_versions (content_key,content_type,version,content)
       VALUES ($1,$2,1,$3)
       ON CONFLICT (content_key,version) DO UPDATE SET content=$3`,
      [versionKey, row.content_type, JSON.stringify(row.content)]
    );
    result.versions++;

    if (category) {
      const catName = String(category).trim();
      const catSlug = slugify(catName);
      const categoryType = CATEGORY_TYPE[row.content_type] || row.content_type;
      const existingCat = await client.query(
        `SELECT id, metadata
         FROM cms_categories
         WHERE slug=$1
           AND content_type=$2
         ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,
                  created_at ASC LIMIT 1`,
        [catSlug, categoryType]
      );
      const migrationMeta = {
        source_table: 'editable_content',
        source_type: row.content_type,
        source_keys: [row.content_key],
        source_published: row.is_published === true
      };

      if (existingCat.rows.length) {
        const existingMeta = existingCat.rows[0].metadata || {};
        const existingKeys = Array.isArray(existingMeta.source_keys)
          ? existingMeta.source_keys
          : (existingMeta.source_key ? [existingMeta.source_key] : []);
        const sourceKeys = [...new Set([...existingKeys, row.content_key])];
        const mergedMeta = {
          ...existingMeta,
          source_table: 'editable_content',
          source_type: existingMeta.source_type || row.content_type,
          source_keys: sourceKeys,
          source_published: existingMeta.source_published === true || row.is_published === true
        };
        await client.query(
          `UPDATE cms_categories
           SET name=$1,
               description=COALESCE(description,'Migrated from editable_content'),
               metadata=$2,
               status='draft', visibility='admin', deleted_at=NULL,
               updated_at=NOW()
           WHERE id=$3`,
          [catName, JSON.stringify(mergedMeta), existingCat.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO cms_categories
           (id,name,slug,description,content_type,order_index,status,visibility,metadata)
           VALUES ($1,$2,$3,$4,$5,0,'draft','admin',$6)`,
          [crypto.randomUUID(), catName, catSlug, 'Migrated from editable_content', categoryType,
           JSON.stringify(migrationMeta)]
        );
        result.categories++;
      }
    }
  }

  return { ...report, migration_result: result, draft_page_id: draftPageId };
}



export async function runLegacyMigration({ pool, createDraftPage = true } = {}) {
  const ownPool = !pool;
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const report = await audit(client);
    const result = await migrateRows(client, report, { createDraftPage });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    if (ownPool) await pool.end();
  }
}

export async function runLegacyPromotion({ pool } = {}) {
  const ownPool = !pool;
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await promoteMigrated(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    if (ownPool) await pool.end();
  }
}

async function promoteMigrated(client) {
  const blocks = await client.query(`
    SELECT id, content
    FROM cms_content_blocks
    WHERE deleted_at IS NULL
      AND content ? '_migration'
      AND content->'_migration'->>'source_table' = 'editable_content'
  `);
  const nav = await client.query(`
    SELECT id, label, url
    FROM cms_navigation
    WHERE deleted_at IS NULL
      AND status <> 'published'
      AND (label ILIKE 'Migrated%' OR url ILIKE '/%')
  `);

  // Only promote blocks explicitly marked as published in the legacy source.
  // The migration stores this flag so drafts/hidden legacy rows never leak.
  let publishedBlocks = 0;
  for (const row of blocks.rows) {
    const meta = row.content?._migration;
    if (meta?.source_published === true) {
      await client.query(`
        UPDATE cms_content_blocks
        SET status='published', visibility='public', updated_at=NOW()
        WHERE id=$1
      `, [row.id]);
      publishedBlocks++;
    }
  }

  // Navigation is intentionally NOT auto-published. Navigation affects the site's
  // primary information architecture and should be approved separately in the CMS.
  const report = {
    mode: 'promote',
    candidate_blocks: blocks.rows.length,
    published_blocks: publishedBlocks,
    navigation_candidates: nav.rows.length,
    navigation_published: 0,
    note: 'Migrated navigation remains unchanged and must be approved manually.'
  };
  return report;
}


const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
  path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    process.exit(2);
  }
  const cliPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  try {
    if (migrate) {
      const report = await runLegacyMigration({ pool: cliPool, createDraftPage });
      console.log(JSON.stringify(report, null, 2));
    } else if (promote) {
      const report = await runLegacyPromotion({ pool: cliPool });
      console.log(JSON.stringify(report, null, 2));
    } else {
      const client = await cliPool.connect();
      try {
        const report = await audit(client);
        console.log(JSON.stringify(report, null, 2));
      } finally {
        client.release();
      }
    }
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  } finally {
    await cliPool.end();
  }
}
