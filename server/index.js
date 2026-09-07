import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const { Pool } = pg;

/*
  By default, pg parses SQL DATE columns into JavaScript Date
  objects. When those get sent back as JSON, Date.toJSON()
  turns them into a full timestamp like
  "1998-08-19T00:00:00.000Z" instead of a plain "1998-08-19".
  That breaks <input type="date"> (which silently rejects
  anything that isn't exactly YYYY-MM-DD) and then fails the
  server's own z.string().date() validation on save.
  OID 1082 is Postgres's "date" type — this tells the driver
  to hand back the raw string as-is instead of parsing it.
*/
pg.types.setTypeParser(1082, val => val);

const isLocalDatabase =
  /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false }
});

const PgSession = connectPgSimple(session);

/* =========================================================
   CORE SCHEMA

   Ensures the core application tables exist: users,
   audit_log, staff_development, journal_entries. This must
   run before ensureBodycamSchema() below, since
   bodycam_submissions has foreign keys referencing users(id)
   — Postgres refuses to create a table that references a
   table which doesn't exist yet. Safe to run on every
   startup: CREATE TABLE IF NOT EXISTS is a no-op once the
   tables already exist.

   (user_sessions is handled separately by connect-pg-simple's
   own createTableIfMissing option, configured further down.)
========================================================= */

async function ensureCoreSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      dob DATE,
      role TEXT NOT NULL DEFAULT 'member',
      rank TEXT,
      callsign TEXT,
      picture_url TEXT,
      specialty TEXT,
      discord_username TEXT,
      training JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /*
    Migration for the existing (already-created) users table —
    CREATE TABLE above is a no-op once the table exists, so
    this ADD COLUMN IF NOT EXISTS is what actually adds the
    column on the live database.
  */
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_username TEXT
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGSERIAL PRIMARY KEY,
      actor_id UUID REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_development (
      user_id UUID PRIMARY KEY REFERENCES users(id),
      checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
      strengths TEXT NOT NULL DEFAULT '',
      development TEXT NOT NULL DEFAULT '',
      admin_notes TEXT NOT NULL DEFAULT '',
      updated_by UUID REFERENCES users(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      sent_to UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* =========================================================
     ROLES & PERMISSIONS

     Purely additive: users.role stays exactly as it is today
     (a free-text column, no foreign key), so nothing existing
     changes. This table gives each role name a permissions
     JSONB object that requirePermission() below can check.
     The existing admin() middleware is completely untouched —
     a user with role='admin' keeps working exactly as before
     whether or not this table exists.

     Seeded with ON CONFLICT DO NOTHING so a future admin UI
     that edits a role's permissions is never silently reset
     by the next server restart.
  ========================================================= */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_system BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const systemRoles = [
    ['super_admin', 'Super Admin', 'Full access to everything.',
      { everything: true }],
    ['admin', 'Admin', 'Full CMS and content management — matches the existing admin role exactly.',
      { 'content.edit': true, 'documents.edit': true, 'usergenerated.moderate': true, 'users.manage': true, 'site.manage': true }],
    ['content_admin', 'Content Admin', 'Procedures, medications, EMS content, /me and /tts.',
      { 'content.edit': true }],
    ['document_admin', 'Document Admin', 'Documents and templates.',
      { 'documents.edit': true }],
    ['moderator', 'Moderator', 'User-generated content.',
      { 'usergenerated.moderate': true }],
    ['member', 'Member', 'Normal website access, plus permitted personal content.',
      {}]
  ];

  for (const [id, name, description, permissions] of systemRoles) {
    await pool.query(
      `INSERT INTO roles (id, name, description, permissions, is_system)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (id) DO NOTHING`,
      [id, name, description, JSON.stringify(permissions)]
    );
  }
}

/* =========================================================
   BODYCAM SCHEMA (LINK-BASED SUBMISSIONS)

   Ensures the bodycam_submissions table exists and has a
   video_url column, so link-based bodycam submissions work
   even if the table was created earlier without one. This
   runs once at startup and is safe to run every time the
   server starts (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF
   NOT EXISTS are both no-ops when already applied).
========================================================= */

async function ensureBodycamSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bodycam_submissions (
      id UUID PRIMARY KEY,
      sender_id UUID NOT NULL REFERENCES users(id),
      recipient_id UUID NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      incident_at TIMESTAMPTZ,
      video_url TEXT,
      object_key TEXT,
      original_filename TEXT,
      content_type TEXT,
      size_bytes BIGINT,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'submitted',
      reviewed_by UUID,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE bodycam_submissions
    ADD COLUMN IF NOT EXISTS video_url TEXT
  `);

  /* =========================================================
     DOCUMENTS TABLE (multi-file per section)
     Stores uploaded documents with a section key so each
     section (hart, hems, training, staff-handbook) can hold
     multiple files. Auto-incrementing ID per document.

     The old singular "documents" table is dropped defensively
     in its own try/catch — if a leftover foreign key from an
     earlier schema iteration ever blocks this drop, that
     failure must not prevent document_files/document_folders
     below from being created. Every /api/documents/:section
     request depends on those two tables existing.
  ========================================================= */
  try {
    await pool.query(`DROP TABLE IF EXISTS documents`);
  } catch (error) {
    console.error(
      'Non-fatal: could not drop legacy documents table:',
      error.message
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS document_files (
      id BIGSERIAL PRIMARY KEY,
      section TEXT NOT NULL,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      folder_id INT,
      description TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      uploaded_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /*
    Migration for an existing document_files table that
    predates one or more of these columns — CREATE TABLE
    above is a no-op once the table exists, so these ADD
    COLUMN IF NOT EXISTS statements are what actually add
    them on a live database that already has the table.
  */
  await pool.query(`
    ALTER TABLE document_files ADD COLUMN IF NOT EXISTS folder_id INT
  `);
  await pool.query(`
    ALTER TABLE document_files ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''
  `);
  await pool.query(`
    ALTER TABLE document_files ADD COLUMN IF NOT EXISTS tags TEXT DEFAULT ''
  `);
  await pool.query(`
    ALTER TABLE document_files ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id)
  `);

  /*
    R2 migration: new uploads store the file in Cloudflare R2
    and keep only this reference here, instead of the base64
    text in "data". Existing rows keep working exactly as
    before — the serve/delete routes check object_key first
    and fall back to "data" when it's null, so nothing already
    uploaded needs to change.
  */
  await pool.query(`
    ALTER TABLE document_files ADD COLUMN IF NOT EXISTS object_key TEXT
  `);
  await pool.query(`
    ALTER TABLE document_files ALTER COLUMN data DROP NOT NULL
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_document_files_section
    ON document_files(section)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS document_folders (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id INT REFERENCES document_folders(id),
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /*
    Same defensive migration for document_folders, in case
    it too predates one of these columns on a live database.
  */
  await pool.query(`
    ALTER TABLE document_folders ADD COLUMN IF NOT EXISTS parent_id INT REFERENCES document_folders(id)
  `);
  await pool.query(`
    ALTER TABLE document_folders ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0
  `);

  /* =========================================================
     EDITABLE RP CONTENT TABLE
     Stores admin-editable RP actions, checklists, and
     questions for every section (scenes, procedures,
     trauma, cardiac, etc.). Each entry is a key-value
     pair where the key identifies the section + content type.
  ========================================================= */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS editable_content (
      content_key TEXT PRIMARY KEY,
      content JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_by UUID REFERENCES users(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* Safe CMS migrations - additive only, never destructive */
  await pool.query(`
    ALTER TABLE editable_content
    ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'generic',
    ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS order_index INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS item_name TEXT
  `);

  /* =========================================================
     USER CONTENT TABLE

     Replaces four previously localStorage-only content types
     (custom /me actions, custom /tts questions, /me
     favourites, and user-saved custom scenes) with real,
     server-persisted, per-user rows. Column naming
     (content_type, order_index, is_published) intentionally
     matches editable_content's naming above, since these two
     tables cover the same conceptual idea — user-authored
     content vs admin-managed content — and should be easy to
     unify further later without a rename.

     content_type distinguishes the four kinds:
       'rp_action' | 'tts_action' | 'rp_favourite' | 'scene'
     data holds the actual item payload as JSON, since each
     content_type has a different shape (an rp_action has
     name/command/category; a scene has a full scene object).
  ========================================================= */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_content (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_type TEXT NOT NULL,
      data JSONB NOT NULL,
      order_index INT NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_content_user_type
    ON user_content(user_id, content_type, order_index)
  `);
}

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    },

    /*
      The front-end (public/index.html) relies on inline
      onclick="..." attributes and one inline <script> block
      for the auth modal. Helmet's default Content-Security-Policy
      sets script-src-attr 'none' and script-src 'self' with no
      'unsafe-inline', which silently blocks every onclick handler
      and the inline auth-fix script in the browser. This override
      keeps every other Helmet default (HSTS, frame protection,
      etc.) and only relaxes the two directives needed for the
      existing HTML to actually run.
    */
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-inline'"],
        'script-src-attr': ["'unsafe-inline'"],
        'default-src': ["'self'", 'blob:'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'object-src': ["'self'", 'blob:'],
        'frame-src': ["'self'", 'blob:']
      }
    }
  })
);

app.use(cookieParser());

app.use(
  express.json({
    limit: '50mb'
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '50mb'
  })
);

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: true
    }),

    secret: process.env.SESSION_SECRET,

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  })
);

/* =========================================================
   CLOUDFLARE R2
========================================================= */

const s3 = process.env.R2_ENDPOINT
  ? new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      forcePathStyle: process.env.R2_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    })
  : null;

const R2_BUCKET = process.env.R2_BUCKET;

/* =========================================================
   HELPERS
========================================================= */

function id() {
  return crypto.randomUUID();
}

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Missing environment variable: ${name}`);
  }
}

function userView(u) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    dob: u.dob,
    role: u.role,
    rank: u.rank,
    callsign: u.callsign,
    pictureUrl: u.picture_url,
    specialty: u.specialty,
    discordUsername: u.discord_username,
    training: u.training
  };
}

function auth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  next();
}

async function current(req) {
  if (!req.session.userId) {
    return null;
  }

  const { rows } = await pool.query(
    'SELECT * FROM users WHERE id=$1',
    [req.session.userId]
  );

  return rows[0] || null;
}

async function admin(req, res, next) {
  const u = await current(req);

  if (!u || u.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required'
    });
  }

  req.user = u;

  next();
}

/* =========================================================
   PERMISSIONS

   Sits alongside admin() rather than replacing it — existing
   routes using admin() are completely unaffected. New routes
   can opt into requirePermission('content.edit') etc. for
   finer-grained checks against the roles table above.

   Backward compatibility: role='admin' always passes every
   permission check, exactly matching what admin() already
   grants today, regardless of whether a matching row exists
   in the roles table.
========================================================= */

async function getRolePermissions(roleId) {
  if (!roleId) return {};

  const { rows } = await pool.query(
    'SELECT permissions FROM roles WHERE id = $1',
    [roleId]
  );

  return rows[0]?.permissions || {};
}

function hasPermission(permissions, key) {
  if (!permissions) return false;
  if (permissions.everything === true) return true;
  return permissions[key] === true;
}

function requirePermission(permissionKey) {
  return async (req, res, next) => {
    const u = await current(req);

    if (!u) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    if (u.role === 'admin') {
      req.user = u;
      return next();
    }

    const permissions = await getRolePermissions(u.role);

    if (!hasPermission(permissions, permissionKey)) {
      return res.status(403).json({
        error: 'Insufficient permissions'
      });
    }

    req.user = u;
    next();
  };
}

/* =========================================================
   AUDIT LOG

   Writes into the audit_log table that already existed but
   had nothing writing to it. Deliberately fire-and-forget —
   a logging failure must never break the real operation it's
   describing, so errors here are caught and logged to the
   console, never thrown back to the caller.
========================================================= */

async function logAction(actorId, action, targetType, targetId, metadata) {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        actorId || null,
        action,
        targetType || null,
        targetId != null ? String(targetId) : null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
  } catch (error) {
    console.error('Audit log error (non-fatal):', error);
  }
}

function safeFileName(name) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-180);
}

function assertVideoType(type, name) {
  const ok =
    [
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime'
    ].includes(type) ||
    /\.(mp4|webm|ogg|mov)$/i.test(name);

  if (!ok) {
    throw new Error('Unsupported video type');
  }
}

/* =========================================================
   HEALTH
========================================================= */

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      ok: true
    });
  } catch (error) {
    console.error(error);

    res.status(503).json({
      ok: false
    });
  }
});

/* =========================================================
   CURRENT USER
========================================================= */

app.get('/api/me', async (req, res) => {
  try {
    const u = await current(req);

    res.json({
      user: u ? userView(u) : null
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/* =========================================================
   ADMINS
========================================================= */

app.get('/api/admins', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT id, display_name, rank
      FROM users
      WHERE role='admin'
      ORDER BY display_name
      `
    );

    res.json({
      admins: rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/* =========================================================
   SIGN UP
========================================================= */

app.post('/api/auth/signup', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email().max(200),

      password: z
        .string()
        .min(10)
        .max(200),

      displayName: z
        .string()
        .min(2)
        .max(100),

      dob: z
        .string()
        .date(),

      discordUsername: z
        .string()
        .max(100)
        .optional()
    });

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error:
          'Please enter a valid email, password, display name and date of birth.'
      });
    }

    const email = parsed.data.email.toLowerCase();

    const exists = await pool.query(
      'SELECT 1 FROM users WHERE email=$1',
      [email]
    );

    if (exists.rowCount) {
      return res.status(409).json({
        error: 'Email already registered'
      });
    }

    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM users'
    );

    /*
      First registered user becomes admin.
      Everyone after that becomes member.
    */

    const role =
      count.rows[0].n === 0
        ? 'admin'
        : 'member';

    const hash = await bcrypt.hash(
      parsed.data.password,
      12
    );

    const uid = id();

    await pool.query(
      `
      INSERT INTO users
      (
        id,
        email,
        password_hash,
        display_name,
        dob,
        role,
        discord_username
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        uid,
        email,
        hash,
        parsed.data.displayName,
        parsed.data.dob,
        role,
        parsed.data.discordUsername || null
      ]
    );

    req.session.userId = uid;

    const user = await current(req);

    res.status(201).json({
      user: user ? userView(user) : null
    });
  } catch (error) {
    console.error('SIGNUP ERROR:', error);

    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/* =========================================================
   LOGIN
========================================================= */

app.post('/api/auth/login', async (req, res) => {
  try {
    const parsed = z
      .object({
        email: z.string().email(),
        password: z.string().min(1)
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid login details'
      });
    }

    const email = parsed.data.email.toLowerCase();

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email=$1',
      [email]
    );

    const u = rows[0];

    if (
      !u ||
      !(await bcrypt.compare(
        parsed.data.password,
        u.password_hash
      ))
    ) {
      return res.status(401).json({
        error: 'Email or password is incorrect'
      });
    }

    req.session.userId = u.id;

    res.json({
      user: userView(u)
    });
  } catch (error) {
    console.error('LOGIN ERROR:', error);

    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/* =========================================================
   LOGOUT
========================================================= */

app.post('/api/auth/logout', auth, (req, res) => {
  req.session.destroy(() => {
    res.json({
      ok: true
    });
  });
});

/* =========================================================
   STAFF
========================================================= */

/* GET /api/roles — list available roles, for a future role-picker UI */
app.get('/api/roles', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, permissions FROM roles ORDER BY name`
    );
    res.json({ ok: true, roles: rows });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

/* GET /api/audit-log — admin only, since this shows who did what.
   Supports optional ?target_type=, ?actor_id=, and ?limit=/?offset=
   for basic pagination ahead of a fuller UI. */
app.get('/api/audit-log', admin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const conditions = [];
    const params = [];

    if (req.query.target_type) {
      params.push(req.query.target_type);
      conditions.push(`al.target_type = $${params.length}`);
    }
    if (req.query.actor_id) {
      params.push(req.query.actor_id);
      conditions.push(`al.actor_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const { rows } = await pool.query(
      `SELECT
         al.id, al.action, al.target_type, al.target_id, al.metadata, al.created_at,
         al.actor_id, u.display_name AS actor_name
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.actor_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );

    res.json({ ok: true, entries: rows });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

app.get('/api/staff', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        display_name,
        rank,
        callsign,
        picture_url,
        specialty,
        training
      FROM users
      ORDER BY display_name
      `
    );

    res.json({
      staff: rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/* =========================================================
   UPDATE STAFF
========================================================= */

app.patch('/api/staff/:id', requirePermission('users.manage'), async (req, res) => {
  try {
    const parsed = z
      .object({
        displayName: z.string().min(2).max(100),

        email: z.string().email(),

        dob: z.string().date(),

        rank: z.string().max(100),

        callsign: z.string().max(50),

        pictureUrl: z
          .string()
          .url()
          .nullable()
          .optional(),

        specialty: z.string().max(120),

        discordUsername: z
          .string()
          .max(100)
          .nullable()
          .optional(),

        training: z.array(
          z.string().max(200)
        ),

        role: z.enum([
          'member',
          'admin',
          'super_admin',
          'content_admin',
          'document_admin',
          'moderator'
        ])
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid profile'
      });
    }

    const x = parsed.data;

    const beforeQ = await pool.query(
      'SELECT display_name, role, rank, callsign FROM users WHERE id=$1',
      [req.params.id]
    );
    const before = beforeQ.rows[0] || {};

    await pool.query(
      `
      UPDATE users
      SET
        display_name=$1,
        email=$2,
        dob=$3,
        rank=$4,
        callsign=$5,
        picture_url=$6,
        specialty=$7,
        training=$8,
        role=$9,
        discord_username=$10,
        updated_at=NOW()
      WHERE id=$11
      `,
      [
        x.displayName,
        x.email.toLowerCase(),
        x.dob,
        x.rank,
        x.callsign,
        x.pictureUrl || null,
        x.specialty,
        JSON.stringify(x.training),
        x.role,
        x.discordUsername || null,
        req.params.id
      ]
    );

    await logAction(
      req.user.id,
      'staff.profile.update',
      'user',
      req.params.id,
      {
        displayName: x.displayName,
        roleChanged: before.role !== x.role,
        role: { before: before.role, after: x.role },
        rank: { before: before.rank, after: x.rank },
        callsign: { before: before.callsign, after: x.callsign }
      }
    );

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE id=$1',
      [req.params.id]
    );

    res.json({
      user: userView(rows[0])
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/* =========================================================
   STAFF DEVELOPMENT
========================================================= */

app.get(
  '/api/staff/:id/development',
  auth,
  async (req, res) => {
    try {
      const me = await current(req);

      if (
        me.id !== req.params.id &&
        me.role !== 'admin'
      ) {
        return res.status(403).json({
          error: 'Not authorised'
        });
      }

      const { rows } = await pool.query(
        'SELECT * FROM staff_development WHERE user_id=$1',
        [req.params.id]
      );

      res.json({
        development:
          rows[0] || {
            user_id: req.params.id,
            checklist: [],
            strengths: '',
            development: '',
            admin_notes: ''
          }
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

app.put(
  '/api/staff/:id/development',
  auth,
  async (req, res) => {
    try {
      const me = await current(req);

      if (
        !me ||
        (
          me.id !== req.params.id &&
          me.role !== 'admin'
        )
      ) {
        return res.status(403).json({
          error: 'Not authorised'
        });
      }

      const parsed = z
        .object({
          checklist: z.array(
            z.object({
              text: z.string().max(200),
              done: z.boolean()
            })
          ),

          strengths: z.string().max(5000),

          development: z.string().max(5000),

          adminNotes: z.string().max(5000)
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid development record'
        });
      }

      const x = parsed.data;

      const isSelf =
        me.id === req.params.id &&
        me.role !== 'admin';

      let strengths = x.strengths;
      let development = x.development;
      let adminNotes = x.adminNotes;

      if (isSelf) {
        /*
          Students can tick their own checklist, but the
          strengths/development/admin-notes fields are
          supervisor feedback about them — preserve whatever
          is already on file rather than letting a student
          overwrite their own review.
        */
        const existing = await pool.query(
          'SELECT strengths, development, admin_notes FROM staff_development WHERE user_id=$1',
          [req.params.id]
        );

        if (existing.rowCount) {
          strengths = existing.rows[0].strengths;
          development = existing.rows[0].development;
          adminNotes = existing.rows[0].admin_notes;
        } else {
          strengths = '';
          development = '';
          adminNotes = '';
        }
      }

      await pool.query(
        `
        INSERT INTO staff_development
        (
          user_id,
          checklist,
          strengths,
          development,
          admin_notes,
          updated_by,
          updated_at
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,NOW())

        ON CONFLICT(user_id)
        DO UPDATE SET
          checklist=$2,
          strengths=$3,
          development=$4,
          admin_notes=$5,
          updated_by=$6,
          updated_at=NOW()
        `,
        [
          req.params.id,
          JSON.stringify(x.checklist),
          strengths,
          development,
          adminNotes,
          me.id
        ]
      );

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

/* =========================================================
   JOURNAL
========================================================= */

app.get('/api/journal', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        body,
        sent_to,
        created_at
      FROM journal_entries
      WHERE user_id=$1
      ORDER BY created_at DESC
      `,
      [req.session.userId]
    );

    res.json({
      entries: rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

app.post('/api/journal', auth, async (req, res) => {
  try {
    const parsed = z
      .object({
        body: z.string().min(1).max(20000),

        sendTo: z
          .string()
          .uuid()
          .nullable()
          .optional()
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid journal entry'
      });
    }

    if (parsed.data.sendTo) {
      const r = await pool.query(
        `
        SELECT 1
        FROM users
        WHERE id=$1
        AND role='admin'
        `,
        [parsed.data.sendTo]
      );

      if (!r.rowCount) {
        return res.status(400).json({
          error: 'Invalid admin recipient'
        });
      }
    }

    await pool.query(
      `
      INSERT INTO journal_entries
      (
        id,
        user_id,
        body,
        sent_to
      )
      VALUES($1,$2,$3,$4)
      `,
      [
        id(),
        req.session.userId,
        parsed.data.body,
        parsed.data.sendTo || null
      ]
    );

    res.status(201).json({
      ok: true
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/* =========================================================
   BODYCAM
========================================================= */

app.get('/api/bodycam', auth, async (req, res) => {
  try {
    const me = await current(req);

    const { rows } = await pool.query(
      `
      SELECT
        b.*,
        s.display_name AS sender_name,
        r.display_name AS recipient_name

      FROM bodycam_submissions b

      JOIN users s
        ON s.id=b.sender_id

      JOIN users r
        ON r.id=b.recipient_id

      WHERE
        b.sender_id=$1
        OR b.recipient_id=$1
        OR $2='admin'

      ORDER BY b.created_at DESC
      `,
      [me.id, me.role]
    );

    res.json({
      submissions: rows.map(x => ({
        ...x,
        object_key: undefined
      }))
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/* =========================================================
   BODYCAM • SUBMIT A LINK

   Simple link-based bodycam submission, matching the
   "Video link" field in public/index.html. This does not
   use Cloudflare R2 / multipart upload — it just stores the
   link the officer pastes in (YouTube, Vimeo, direct file
   link, etc.) alongside the title, incident time and a
   summary of what happened.
========================================================= */

app.post('/api/bodycam/link', auth, async (req, res) => {
  try {
    const parsed = z
      .object({
        recipientId: z.string().uuid(),

        title: z
          .string()
          .min(2)
          .max(200),

        incidentAt: z
          .string()
          .datetime()
          .nullable()
          .optional(),

        videoUrl: z
          .string()
          .url()
          .max(2000),

        notes: z
          .string()
          .max(5000)
          .optional()
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error:
          'Please choose a recipient, enter a title and a valid video link.'
      });
    }

    const rec = await pool.query(
      `
      SELECT id
      FROM users
      WHERE id=$1
      AND role='admin'
      `,
      [parsed.data.recipientId]
    );

    if (!rec.rowCount) {
      return res.status(400).json({
        error: 'Invalid recipient'
      });
    }

    const submissionId = id();

    await pool.query(
      `
      INSERT INTO bodycam_submissions
      (
        id,
        sender_id,
        recipient_id,
        title,
        incident_at,
        video_url,
        notes
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        submissionId,
        req.session.userId,
        parsed.data.recipientId,
        parsed.data.title,
        parsed.data.incidentAt || null,
        parsed.data.videoUrl,
        parsed.data.notes || ''
      ]
    );

    res.status(201).json({
      ok: true,
      submissionId
    });
  } catch (error) {
    console.error('BODYCAM LINK SUBMIT ERROR:', error);

    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/* =========================================================
   BODYCAM MULTIPART START
========================================================= */

app.post(
  '/api/bodycam/multipart/start',
  auth,
  async (req, res) => {
    try {
      requireEnv('R2_ENDPOINT');
      requireEnv('R2_BUCKET');

      if (!s3) {
        throw new Error('R2 is not configured');
      }

      const parsed = z
        .object({
          recipientId: z.string().uuid(),

          title: z
            .string()
            .min(2)
            .max(200),

          incidentAt: z
            .string()
            .datetime()
            .nullable()
            .optional(),

          filename: z
            .string()
            .min(1)
            .max(255),

          contentType: z.string().min(1),

          sizeBytes: z
            .number()
            .int()
            .positive()
            .max(2147483648),

          notes: z
            .string()
            .max(5000)
            .optional()
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid upload details'
        });
      }

      assertVideoType(
        parsed.data.contentType,
        parsed.data.filename
      );

      const rec = await pool.query(
        `
        SELECT id
        FROM users
        WHERE id=$1
        AND role='admin'
        `,
        [parsed.data.recipientId]
      );

      if (!rec.rowCount) {
        return res.status(400).json({
          error: 'Invalid recipient'
        });
      }

      const submissionId = id();

      const key =
        `bodycam/${new Date().toISOString().slice(0, 10)}/` +
        `${submissionId}-${safeFileName(parsed.data.filename)}`;

      const create = await s3.send(
        new CreateMultipartUploadCommand({
          Bucket: R2_BUCKET,
          Key: key,
          ContentType: parsed.data.contentType,

          Metadata: {
            submissionId
          }
        })
      );

      await pool.query(
        `
        INSERT INTO bodycam_submissions
        (
          id,
          sender_id,
          recipient_id,
          title,
          incident_at,
          object_key,
          original_filename,
          content_type,
          size_bytes,
          notes
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `,
        [
          submissionId,
          req.session.userId,
          parsed.data.recipientId,
          parsed.data.title,
          parsed.data.incidentAt || null,
          key,
          parsed.data.filename,
          parsed.data.contentType,
          parsed.data.sizeBytes,
          parsed.data.notes || ''
        ]
      );

      const partSize = 10 * 1024 * 1024;

      const parts = Math.ceil(
        parsed.data.sizeBytes / partSize
      );

      res.json({
        submissionId,
        uploadId: create.UploadId,
        key,
        partSize,
        parts
      });
    } catch (error) {
      console.error('BODYCAM START ERROR:', error);

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

/* =========================================================
   BODYCAM PART URL
========================================================= */

app.post(
  '/api/bodycam/multipart/part-url',
  auth,
  async (req, res) => {
    try {
      requireEnv('R2_ENDPOINT');
      requireEnv('R2_BUCKET');

      if (!s3) {
        throw new Error('R2 is not configured');
      }

      const parsed = z
        .object({
          key: z.string(),

          uploadId: z.string(),

          partNumber: z
            .number()
            .int()
            .min(1)
            .max(10000)
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid part'
        });
      }

      const signed = await getSignedUrl(
        s3,

        new UploadPartCommand({
          Bucket: R2_BUCKET,
          Key: parsed.data.key,
          UploadId: parsed.data.uploadId,
          PartNumber: parsed.data.partNumber
        }),

        {
          expiresIn: 900
        }
      );

      res.json({
        url: signed
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

/* =========================================================
   BODYCAM COMPLETE
========================================================= */

app.post(
  '/api/bodycam/multipart/complete',
  auth,
  async (req, res) => {
    try {
      requireEnv('R2_ENDPOINT');
      requireEnv('R2_BUCKET');

      if (!s3) {
        throw new Error('R2 is not configured');
      }

      const parsed = z
        .object({
          submissionId: z.string().uuid(),

          key: z.string(),

          uploadId: z.string(),

          parts: z.array(
            z.object({
              PartNumber: z.number().int(),
              ETag: z.string()
            })
          )
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid completion request'
        });
      }

      const own = await pool.query(
        `
        SELECT 1
        FROM bodycam_submissions
        WHERE id=$1
        AND sender_id=$2
        `,
        [
          parsed.data.submissionId,
          req.session.userId
        ]
      );

      if (!own.rowCount) {
        return res.status(403).json({
          error: 'Not authorised'
        });
      }

      await s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: R2_BUCKET,

          Key: parsed.data.key,

          UploadId: parsed.data.uploadId,

          MultipartUpload: {
            Parts: parsed.data.parts.sort(
              (a, b) =>
                a.PartNumber - b.PartNumber
            )
          }
        })
      );

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

/* =========================================================
   BODYCAM REVIEW
========================================================= */

app.post(
  '/api/bodycam/:id/review',
  auth,
  async (req, res) => {
    try {
      const me = await current(req);

      const q = await pool.query(
        `
        SELECT *
        FROM bodycam_submissions
        WHERE id=$1
        `,
        [req.params.id]
      );

      const b = q.rows[0];

      if (
        !b ||
        (
          b.recipient_id !== me.id &&
          me.role !== 'admin'
        )
      ) {
        return res.status(403).json({
          error: 'Not authorised'
        });
      }

      await pool.query(
        `
        UPDATE bodycam_submissions

        SET
          status=$1,
          reviewed_by=$2,
          reviewed_at=NOW()

        WHERE id=$3
        `,
        [
          'reviewed',
          me.id,
          b.id
        ]
      );

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

/* =========================================================
   BODYCAM STREAM URL
========================================================= */

app.get(
  '/api/bodycam/:id/stream-url',
  auth,
  async (req, res) => {
    try {
      requireEnv('R2_ENDPOINT');
      requireEnv('R2_BUCKET');

      if (!s3) {
        throw new Error('R2 is not configured');
      }

      const me = await current(req);

      const q = await pool.query(
        `
        SELECT *
        FROM bodycam_submissions
        WHERE id=$1
        `,
        [req.params.id]
      );

      const b = q.rows[0];

      if (
        !b ||
        (
          b.sender_id !== me.id &&
          b.recipient_id !== me.id &&
          me.role !== 'admin'
        )
      ) {
        return res.status(403).json({
          error: 'Not authorised'
        });
      }

      const url = await getSignedUrl(
        s3,

        new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: b.object_key,

          ResponseContentType:
            b.content_type
        }),

        {
          expiresIn: 600
        }
      );

      res.json({
        url
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
);

/* =========================================================
   EDITABLE CONTENT API
   Admins can edit RP actions, checklists, and questions
   directly in the UI. Content is stored per content_key.
========================================================= */

/* GET /api/content/:key — fetch editable content */
app.get('/api/content/:key', async (req, res) => {
  try {
    const key = req.params.key;
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      return res.status(400).json({ error: 'Invalid key' });
    }
    const q = await pool.query(
      'SELECT content FROM editable_content WHERE content_key = $1',
      [key]
    );
    const data = q.rows[0]?.content || [];
    res.json({ ok: true, content: data });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

/* PUT /api/content/:key — save editable content (admin only) */
app.put('/api/content/:key', requirePermission('content.edit'), async (req, res) => {
  try {
    const key = req.params.key;
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      return res.status(400).json({ error: 'Invalid key' });
    }
    const { content } = req.body;
    if (!Array.isArray(content)) {
      return res.status(400).json({ error: 'Content must be an array' });
    }

    const beforeQ = await pool.query(
      'SELECT content FROM editable_content WHERE content_key = $1',
      [key]
    );
    const beforeCount = Array.isArray(beforeQ.rows[0]?.content) ? beforeQ.rows[0].content.length : 0;

    await pool.query(
      `INSERT INTO editable_content (content_key, content, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (content_key)
       DO UPDATE SET content = $2, updated_by = $3, updated_at = NOW()`,
      [key, JSON.stringify(content), req.user.id]
    );

    await logAction(
      req.user.id,
      'content.update',
      'editable_content',
      key,
      { itemCount: { before: beforeCount, after: content.length } }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Save content error:', error);
    res.status(500).json({ error: 'Failed to save content' });
  }
});

/* =========================================================
   USER CONTENT — replaces localStorage-only custom /me
   actions, /tts questions, favourites and saved scenes with
   real per-user server storage. Every mutating route checks
   user_id = req.session.userId so nobody can edit or delete another
   user's items even if they guess an id.
========================================================= */

const USER_CONTENT_TYPES = ['rp_action', 'tts_action', 'rp_favourite', 'scene'];

function isValidUserContentType(type) {
  return USER_CONTENT_TYPES.includes(type);
}

/* GET /api/user-content/:type — the current user's items of this type */
app.get('/api/user-content/:type', auth, async (req, res) => {
  try {
    const type = req.params.type;
    if (!isValidUserContentType(type)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }
    const q = await pool.query(
      `SELECT id, data, order_index, is_published, created_at, updated_at
       FROM user_content
       WHERE user_id = $1 AND content_type = $2
       ORDER BY order_index ASC, created_at ASC`,
      [req.session.userId, type]
    );
    res.json({ ok: true, items: q.rows });
  } catch (error) {
    console.error('Get user content error:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

/* POST /api/user-content/:type — create a new item for the current user */
app.post('/api/user-content/:type', auth, async (req, res) => {
  try {
    const type = req.params.type;
    if (!isValidUserContentType(type)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }
    const { data } = req.body;
    if (data === undefined || data === null || typeof data !== 'object') {
      return res.status(400).json({ error: 'data must be an object' });
    }

    const maxQ = await pool.query(
      `SELECT COALESCE(MAX(order_index), -1) AS max_order
       FROM user_content WHERE user_id = $1 AND content_type = $2`,
      [req.session.userId, type]
    );
    const nextOrder = Number(maxQ.rows[0].max_order) + 1;

    const newId = id();
    const insertQ = await pool.query(
      `INSERT INTO user_content (id, user_id, content_type, data, order_index)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, data, order_index, is_published, created_at, updated_at`,
      [newId, req.session.userId, type, JSON.stringify(data), nextOrder]
    );
    res.status(201).json({ ok: true, item: insertQ.rows[0] });
  } catch (error) {
    console.error('Create user content error:', error);
    res.status(500).json({ error: 'Failed to create content' });
  }
});

/* PUT /api/user-content/:type/reorder — bulk-update order_index for the current user's items.
   Registered BEFORE the /:id route below so Express doesn't match "reorder" as an :id value. */
app.put('/api/user-content/:type/reorder', auth, async (req, res) => {
  try {
    const type = req.params.type;
    if (!isValidUserContentType(type)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'order must be an array of ids' });
    }

    for (let i = 0; i < order.length; i++) {
      await pool.query(
        `UPDATE user_content SET order_index = $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3 AND content_type = $4`,
        [i, order[i], req.session.userId, type]
      );
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Reorder user content error:', error);
    res.status(500).json({ error: 'Failed to reorder content' });
  }
});

/* PUT /api/user-content/:type/:id — update one item, only if owned by the current user */
app.put('/api/user-content/:type/:id', auth, async (req, res) => {
  try {
    const type = req.params.type;
    if (!isValidUserContentType(type)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }
    const { data } = req.body;
    if (data === undefined || data === null || typeof data !== 'object') {
      return res.status(400).json({ error: 'data must be an object' });
    }

    const q = await pool.query(
      `UPDATE user_content SET data = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 AND content_type = $4
       RETURNING id, data, order_index, is_published, created_at, updated_at`,
      [JSON.stringify(data), req.params.id, req.session.userId, type]
    );
    if (q.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ ok: true, item: q.rows[0] });
  } catch (error) {
    console.error('Update user content error:', error);
    res.status(500).json({ error: 'Failed to update content' });
  }
});

/* DELETE /api/user-content/:type/:id — delete one item, only if owned by the current user */
app.delete('/api/user-content/:type/:id', auth, async (req, res) => {
  try {
    const type = req.params.type;
    if (!isValidUserContentType(type)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }
    const q = await pool.query(
      `DELETE FROM user_content WHERE id = $1 AND user_id = $2 AND content_type = $3 RETURNING id`,
      [req.params.id, req.session.userId, type]
    );
    if (q.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete user content error:', error);
    res.status(500).json({ error: 'Failed to delete content' });
  }
});

/* POST /api/user-content/:type/migrate — one-time bulk import from localStorage.
   Accepts an array of raw items (whatever shape the client already had) and
   inserts them as new rows in one go, preserving their existing order. */
app.post('/api/user-content/:type/migrate', auth, async (req, res) => {
  try {
    const type = req.params.type;
    if (!isValidUserContentType(type)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' });
    }

    const maxQ = await pool.query(
      `SELECT COALESCE(MAX(order_index), -1) AS max_order
       FROM user_content WHERE user_id = $1 AND content_type = $2`,
      [req.session.userId, type]
    );
    let nextOrder = Number(maxQ.rows[0].max_order) + 1;

    const inserted = [];
    for (const item of items) {
      const newId = id();
      const q = await pool.query(
        `INSERT INTO user_content (id, user_id, content_type, data, order_index)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, data, order_index, is_published, created_at, updated_at`,
        [newId, req.session.userId, type, JSON.stringify(item), nextOrder]
      );
      inserted.push(q.rows[0]);
      nextOrder++;
    }
    res.status(201).json({ ok: true, items: inserted });
  } catch (error) {
    console.error('Migrate user content error:', error);
    res.status(500).json({ error: 'Failed to migrate content' });
  }
});

/* =========================================================
   CMS API (Defaults + Overrides)
   Stored in the same editable_content table. Each row is
   one editable item (medication, procedure, equipment,
   emergency, question, rp-action, scene template, section
   text, nav item, theme setting, etc.).
   - content_type  groups the items (e.g. 'medication')
   - content_key   unique stable key (e.g. 'paracetamol')
   - content       JSON payload with all fields
   - is_published  hide/show without deleting
   - order_index   controls display order
========================================================= */

/* GET /api/cms/:contentType -- list all items of a type */
app.get('/api/cms/:contentType', async (req, res) => {
  try {
    const type = req.params.contentType;
    if (!/^[a-zA-Z0-9_-]+$/.test(type)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }
    const q = await pool.query(
      `SELECT content_key, content_type, is_published, order_index, item_name,
              updated_at, updated_by
       FROM editable_content
       WHERE content_type = $1
       ORDER BY order_index ASC, item_name ASC, content_key ASC`,
      [type]
    );
    res.json({ ok: true, items: q.rows });
  } catch (error) {
    console.error('CMS list error:', error);
    res.status(500).json({ error: 'Failed to list content' });
  }
});

/* GET /api/cms/item/:key -- fetch one item */
app.get('/api/cms/item/:key', async (req, res) => {
  try {
    const key = req.params.key;
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      return res.status(400).json({ error: 'Invalid key' });
    }
    const q = await pool.query(
      `SELECT content_key, content_type, is_published, order_index, item_name, content, updated_at
       FROM editable_content WHERE content_key = $1`,
      [key]
    );
    if (q.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ ok: true, item: q.rows[0] });
  } catch (error) {
    console.error('CMS get error:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

/* PUT /api/cms/:contentType/:key -- create/update an item (admin) */
app.put('/api/cms/:contentType/:key', admin, async (req, res) => {
  try {
    const type = req.params.contentType;
    const key = req.params.key;
    if (!/^[a-zA-Z0-9_-]+$/.test(type) || !/^[a-zA-Z0-9_-]+$/.test(key)) {
      return res.status(400).json({ error: 'Invalid type or key' });
    }
    const content = req.body && req.body.content !== undefined
      ? req.body.content
      : req.body;
    const itemName = (req.body && req.body.itemName) || (content && content.name) || (content && content.title) || key;
    const isPublished = req.body && req.body.isPublished !== undefined
      ? !!req.body.isPublished
      : true;
    const orderIndex = req.body && req.body.orderIndex !== undefined
      ? Number(req.body.orderIndex) || 0
      : 0;
    const payload = JSON.stringify(content);
    await pool.query(
      `INSERT INTO editable_content
        (content_key, content_type, content, item_name, is_published, order_index, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (content_key)
       DO UPDATE SET
         content_type = $2,
         content = $3,
         item_name = $4,
         is_published = $5,
         order_index = $6,
         updated_by = $7,
         updated_at = NOW()`,
      [key, type, payload, itemName, isPublished, orderIndex, req.user.id]
    );

    await logAction(
      req.user.id,
      'cms.item.update',
      type,
      key,
      { itemName, isPublished, orderIndex }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('CMS save error:', error);
    res.status(500).json({ error: 'Failed to save content' });
  }
});

/* DELETE /api/cms/item/:key -- remove an override item (admin) */
app.delete('/api/cms/item/:key', admin, async (req, res) => {
  try {
    const key = req.params.key;
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      return res.status(400).json({ error: 'Invalid key' });
    }

    const beforeQ = await pool.query(
      'SELECT item_name, content_type FROM editable_content WHERE content_key = $1',
      [key]
    );

    await pool.query('DELETE FROM editable_content WHERE content_key = $1', [key]);

    await logAction(
      req.user.id,
      'cms.item.delete',
      beforeQ.rows[0]?.content_type || null,
      key,
      { itemName: beforeQ.rows[0]?.item_name || key }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('CMS delete error:', error);
    res.status(500).json({ error: 'Failed to delete content' });
  }
});

/* POST /api/cms/seed -- reseed defaults for a content type (admin) */
app.post('/api/cms/seed', admin, async (req, res) => {
  try {
    const { content_type, items } = req.body;
    if (!/^[a-zA-Z0-9_-]+$/.test(content_type) || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid seed payload' });
    }
    let count = 0;
    for (const it of items) {
      if (!it || !it.key) continue;
      const payload = JSON.stringify(it.content !== undefined ? it.content : it);
      const name = it.itemName || (it.content && (it.content.name || it.content.title)) || it.key;
      const order = it.orderIndex !== undefined ? Number(it.orderIndex) || 0 : count;
      await pool.query(
        `INSERT INTO editable_content (content_key, content_type, content, item_name, is_published, order_index, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, $5, NOW())
         ON CONFLICT (content_key) DO UPDATE SET
           content_type = $2, content = $3, item_name = $4, is_published = TRUE, order_index = $5, updated_at = NOW()`,
        [it.key, content_type, payload, name, order]
      );
      count++;
    }

    await logAction(
      req.user.id,
      'cms.seed',
      content_type,
      null,
      { itemsSeeded: count }
    );

    res.json({ ok: true, seeded: count });
  } catch (error) {
    console.error('CMS seed error:', error);
    res.status(500).json({ error: 'Failed to seed content' });
  }
});

/* POST /api/cms/reset -- wipe all override rows for a type, restoring defaults (admin) */
app.post('/api/cms/reset', admin, async (req, res) => {
  try {
    const { content_type } = req.body;
    if (content_type && !/^[a-zA-Z0-9_-]+$/.test(content_type)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    let deletedCount;
    if (content_type) {
      const result = await pool.query('DELETE FROM editable_content WHERE content_type = $1', [content_type]);
      deletedCount = result.rowCount;
    } else {
      const result = await pool.query('DELETE FROM editable_content WHERE content_type <> $1', ['generic']);
      deletedCount = result.rowCount;
    }

    await logAction(
      req.user.id,
      'cms.reset',
      content_type || 'all-non-generic',
      null,
      { rowsDeleted: deletedCount }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('CMS reset error:', error);
    res.status(500).json({ error: 'Failed to reset content' });
  }
});

/* =========================================================
   DOCUMENTS API (multi-file per section, with folders)
   Each section can hold multiple documents.
   Admins can manage folders and documents.
========================================================= */

/* MIME type helper */
function getDocMimeType(name) {
  const ext = name ? path.extname(name).toLowerCase() : '';
  const types = {
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.csv': 'text/csv',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm'
  };
  return types[ext] || 'application/octet-stream';
}

/* GET /api/documents/:section — fetch all docs for a section */
app.get('/api/documents/:section', async (req, res) => {
  try {
    const section = req.params.section;
    if (!/^[a-zA-Z0-9_-]+$/.test(section)) {
      return res.status(400).json({ error: 'Invalid section' });
    }
    const q = await pool.query(
      'SELECT id, name, section, folder_id, description, tags, created_at FROM document_files WHERE section = $1 ORDER BY folder_id NULLS FIRST, LOWER(name) ASC',
      [section]
    );
    const folders = await pool.query(
      'SELECT id, name, parent_id, sort_order FROM document_folders ORDER BY sort_order ASC, name ASC'
    );
    res.json({ ok: true, documents: q.rows, folders: folders.rows });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

/* POST /api/documents/:section — upload a new document to a section */
app.post('/api/documents/:section', auth, async (req, res) => {
  try {
    const section = req.params.section;
    if (!/^[a-zA-Z0-9_-]+$/.test(section)) {
      return res.status(400).json({ error: 'Invalid section' });
    }
    const { name, data, folder_id, description, tags } = req.body;
    if (!name || !data) {
      return res.status(400).json({ error: 'Missing name or data' });
    }
    if (typeof data !== 'string') {
      return res.status(400).json({ error: 'Data must be a base64 string' });
    }
    if (data.length > 20 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large (max ~15MB)' });
    }

    let objectKey = null;
    let storedData = data;

    if (s3 && R2_BUCKET) {
      try {
        objectKey = `documents/${crypto.randomUUID()}-${safeFileName(name)}`;
        await s3.send(new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: objectKey,
          Body: Buffer.from(data, 'base64'),
          ContentType: getDocMimeType(name)
        }));
        storedData = null;
      } catch (r2Error) {
        console.error('R2 upload failed, falling back to database storage:', r2Error);
        objectKey = null;
        storedData = data;
      }
    }

    const q = await pool.query(
      `INSERT INTO document_files (section, name, data, object_key, folder_id, description, tags, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [section, name, storedData, objectKey, folder_id || null, description || '', tags || '', req.user?.id || null]
    );
    res.json({ ok: true, id: q.rows[0].id });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

/* PUT /api/documents/:id/meta — update document metadata (admin) */
app.put('/api/documents/:id/meta', requirePermission('documents.edit'), async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    const { name, folder_id, description, tags } = req.body;
    await pool.query(
      `UPDATE document_files SET name = COALESCE($1, name), folder_id = $2, description = COALESCE($3, description), tags = COALESCE($4, tags) WHERE id = $5`,
      [name || null, folder_id || null, description !== undefined ? description : null, tags !== undefined ? tags : null, id]
    );

    await logAction(
      req.user.id,
      'document.metadata.update',
      'document',
      id,
      { name, folder_id, description, tags }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

/* DELETE /api/documents/by-id/:id — delete a document (admin only) */
app.delete('/api/documents/by-id/:id', admin, async (req, res) => {
  try {
    const id = req.params.id;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const beforeQ = await pool.query('SELECT name, section, object_key FROM document_files WHERE id = $1', [id]);

    if (beforeQ.rows[0]?.object_key && s3 && R2_BUCKET) {
      try {
        await s3.send(new DeleteObjectCommand({
          Bucket: R2_BUCKET,
          Key: beforeQ.rows[0].object_key
        }));
      } catch (r2Error) {
        console.error('R2 delete failed (continuing with database delete):', r2Error);
      }
    }

    await pool.query('DELETE FROM document_files WHERE id = $1', [id]);

    await logAction(
      req.user.id,
      'document.delete',
      'document',
      id,
      { name: beforeQ.rows[0]?.name || null, section: beforeQ.rows[0]?.section || null }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

/* GET /api/serve-doc/by-id/:id — serve the raw file bytes */
app.get('/api/serve-doc/by-id/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    const q = await pool.query(
      'SELECT name, data, object_key FROM document_files WHERE id = $1',
      [id]
    );
    if (q.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const { name, data, object_key } = q.rows[0];
    const contentType = getDocMimeType(name);

    if (object_key && s3 && R2_BUCKET) {
      try {
        const r2Object = await s3.send(new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: object_key
        }));
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${name}"`);
        if (r2Object.ContentLength) {
          res.setHeader('Content-Length', String(r2Object.ContentLength));
        }
        r2Object.Body.pipe(res);
        return;
      } catch (r2Error) {
        console.error('R2 fetch failed for document', id, r2Error);
        return res.status(500).json({ error: 'Failed to fetch document from storage' });
      }
    }

    if (!data) {
      return res.status(404).json({ error: 'Document data not found' });
    }
    const buffer = Buffer.from(data, 'base64');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (error) {
    console.error('Serve document error:', error);
    res.status(500).json({ error: 'Failed to serve document' });
  }
});

/* =========================================================
   DOCUMENT FOLDERS API
========================================================= */

/* GET /api/folders — list all folders */
app.get('/api/folders', async (req, res) => {
  try {
    const q = await pool.query('SELECT id, name, parent_id, sort_order FROM document_folders ORDER BY sort_order ASC, name ASC');
    res.json({ ok: true, folders: q.rows });
  } catch (error) {
    console.error('Get folders error:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

/* POST /api/folders — create a folder (admin) */
app.post('/api/folders', admin, async (req, res) => {
  try {
    const { name, parent_id } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Folder name is required' });
    }
    const q = await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM document_folders WHERE parent_id IS NULL');
    const nextOrder = q.rows[0].next_order;
    const r = await pool.query(
      'INSERT INTO document_folders (name, parent_id, sort_order) VALUES ($1, $2, $3) RETURNING id',
      [name.trim(), parent_id || null, nextOrder]
    );

    await logAction(
      req.user.id,
      'folder.create',
      'folder',
      r.rows[0].id,
      { name: name.trim(), parent_id: parent_id || null }
    );

    res.json({ ok: true, id: r.rows[0].id });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

/* PUT /api/folders/:id — rename or move a folder (admin) */
app.put('/api/folders/:id', admin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid folder ID' });
    }
    const { name, parent_id, sort_order } = req.body;

    const beforeQ = await pool.query(
      'SELECT name, parent_id, sort_order FROM document_folders WHERE id = $1',
      [id]
    );
    const before = beforeQ.rows[0] || {};

    await pool.query(
      `UPDATE document_folders SET name = COALESCE($1, name), parent_id = $2, sort_order = COALESCE($3, sort_order) WHERE id = $4`,
      [name || null, parent_id !== undefined ? parent_id : null, sort_order !== undefined ? sort_order : null, id]
    );

    await logAction(
      req.user.id,
      'folder.update',
      'folder',
      id,
      {
        name: { before: before.name, after: name || before.name },
        sort_order: { before: before.sort_order, after: sort_order !== undefined ? sort_order : before.sort_order }
      }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Update folder error:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

/* DELETE /api/folders/:id — delete a folder (admin) */
app.delete('/api/folders/:id', admin, async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid folder ID' });
    }

    const beforeQ = await pool.query('SELECT name FROM document_folders WHERE id = $1', [id]);
    const docsMovedQ = await pool.query('SELECT COUNT(*) FROM document_files WHERE folder_id = $1', [id]);
    const childFoldersQ = await pool.query('SELECT COUNT(*) FROM document_folders WHERE parent_id = $1', [id]);

    /* Move documents in this folder to root */
    await pool.query('UPDATE document_files SET folder_id = NULL WHERE folder_id = $1', [id]);
    /* Delete child folders */
    await pool.query('DELETE FROM document_folders WHERE parent_id = $1', [id]);
    /* Delete the folder itself */
    await pool.query('DELETE FROM document_folders WHERE id = $1', [id]);

    await logAction(
      req.user.id,
      'folder.delete',
      'folder',
      id,
      {
        name: beforeQ.rows[0]?.name || null,
        documentsMovedToRoot: Number(docsMovedQ.rows[0].count),
        childFoldersDeleted: Number(childFoldersQ.rows[0].count)
      }
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

/* =========================================================
   STATIC WEBSITE
========================================================= */

app.use(
  express.static(
    path.join(__dirname, '../public'),
    {
      extensions: ['html']
    }
  )
);

/* =========================================================
   SPA FALLBACK
========================================================= */

app.get('/{*splat}', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/index.html'
    )
  );
});

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (err, req, res, next) => {
    console.error(err);

    res.status(500).json({
      error: 'Internal server error'
    });
  }
);

/* =========================================================
   START SERVER
========================================================= */

const port = Number(
  process.env.PORT || 3000
);

ensureCoreSchema()
  .then(() => ensureBodycamSchema())
  .catch(error => {
    console.error(
      'SCHEMA SETUP ERROR:',
      error
    );
  })
  .finally(() => {
    app.listen(
      port,
      '0.0.0.0',
      () => {
        console.log(
          `NHS Clinical Desk listening on ${port}`
        );
      }
    );
  });
