#!/usr/bin/env node
/**
 * UHS CMS Phase 5 retirement gate.
 *
 * Read-only by default. This is intentionally a gate, not a destructive
 * migration. It verifies that legacy rows have structured equivalents and
 * that the public frontend no longer depends on editable_content.
 *
 * Exit 0 = safe to proceed with a future destructive retirement.
 * Exit 1 = conditions still require review.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = fs.readFileSync(path.join(root, 'public', 'script.js'), 'utf8');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
});

async function exists(client, table) {
  const q = await client.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${table}`]);
  return q.rows[0].ok;
}

const client = await pool.connect();
try {
  const required = [
    'editable_content',
    'cms_pages',
    'cms_page_sections',
    'cms_content_blocks',
    'cms_navigation',
    'cms_categories',
    'cms_content_versions'
  ];
  const tables = {};
  for (const table of required) tables[table] = await exists(client, table);

  const failures = [];
  if (!tables.editable_content) failures.push('editable_content is missing; legacy inventory cannot be verified.');
  for (const table of required.slice(1)) {
    if (!tables[table]) failures.push(`${table} is missing.`);
  }

  let legacy = [];
  if (tables.editable_content) {
    legacy = (await client.query(`
      SELECT content_key, content_type, is_published
      FROM editable_content
      ORDER BY content_type, content_key
    `)).rows;
  }

  let migratedBlocks = new Set();
  let migratedNav = new Set();
  if (tables.cms_content_blocks) {
    const q = await client.query(`
      SELECT content->'_migration'->>'source_type' AS source_type,
             content->'_migration'->>'source_key' AS source_key
      FROM cms_content_blocks
      WHERE deleted_at IS NULL
        AND content ? '_migration'
        AND content->'_migration'->>'source_table' = 'editable_content'
    `);
    migratedBlocks = new Set(q.rows.map(r => `${r.source_type}:${r.source_key}`));
  }
  if (tables.cms_navigation) {
    const q = await client.query(`
      SELECT metadata->>'source_type' AS source_type,
             metadata->>'source_key' AS source_key
      FROM cms_navigation
      WHERE deleted_at IS NULL
        AND metadata->>'source_table' = 'editable_content'
    `);
    migratedNav = new Set(q.rows.map(r => `${r.source_type}:${r.source_key}`));
  }

  const missing = legacy.filter(row => {
    const k = `${row.content_type}:${row.content_key}`;
    return row.content_type === 'nav' ? !migratedNav.has(k) : !migratedBlocks.has(k);
  });

  const structuredPublished = {};
  for (const table of ['cms_pages', 'cms_page_sections', 'cms_content_blocks', 'cms_navigation', 'cms_categories']) {
    if (!tables[table]) continue;
    structuredPublished[table] = Number((await client.query(
      `SELECT COUNT(*)::int AS n FROM ${table}
       WHERE deleted_at IS NULL AND status='published' AND visibility='public'`
    )).rows[0].n);
  }

  const fallbackDisabled = frontend.includes('var CMS_LEGACY_FALLBACK = false;');
  const fallbackGuarded = frontend.includes('if (CMS_LEGACY_FALLBACK)');
  const publicLegacyDependency = !fallbackDisabled || !fallbackGuarded;
  if (publicLegacyDependency) {
    failures.push('public/script.js does not have the legacy runtime fallback explicitly disabled and guarded.');
  }

  const report = {
    phase: 5,
    generated_at: new Date().toISOString(),
    safe_to_retire_legacy_table: failures.length === 0 && missing.length === 0,
    tables,
    legacy: {
      total: legacy.length,
      published: legacy.filter(r => r.is_published).length,
      missing_structured_equivalent: missing
    },
    structured_published: structuredPublished,
    checks: {
      public_runtime_legacy_dependency: publicLegacyDependency,
      legacy_write_gate_default: String(process.env.CMS_LEGACY_WRITE_ENABLED || '').toLowerCase() !== 'true',
      frontend_legacy_fallback_default_disabled: frontend.includes('var CMS_LEGACY_FALLBACK = false;')
    },
    blockers: failures
  };

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.safe_to_retire_legacy_table ? 0 : 1;
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 2;
} finally {
  client.release();
  await pool.end();
}
