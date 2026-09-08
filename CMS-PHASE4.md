# UHS CMS Phase 4 — Controlled Cutover

Phase 4 makes the structured CMS the authoritative editing system while preserving the legacy
`editable_content` table as a read-only compatibility/fallback source.

## Cutover model

Public reads use:

1. published/public `cms_content_blocks`
2. legacy `editable_content` compatibility fallback
3. built-in application defaults

The legacy admin UI no longer exposes Add, Seed, or Reset controls and its mutation functions are
blocked in `public/cms.js`.

## Migration

Run the audit first:

```bash
npm run cms:audit
```

If the report is acceptable:

```bash
npm run cms:migrate
```

This creates a draft migration page and draft structured blocks. It never deletes or modifies the
legacy rows.

Review the migrated records in **Admin → CMS Manager**.

## Promotion

After review, publish only migrated blocks whose legacy source was already published:

```bash
npm run cms:promote
```

The command has an explicit confirmation guard and will refuse to run unless
`CMS_CUTOVER_CONFIRM=YES` is present.

Migrated navigation is deliberately **not** auto-published. Navigation changes the site's
information architecture and must be approved manually in CMS Manager.

## Rollback

Rollback remains possible because the legacy rows are retained and the public runtime falls back
to them whenever no structured content is available.

To roll back a particular structured block, change its status to `draft`/`hidden` in CMS Manager.
Do not delete the legacy source row.

## Phase 4 exit criteria

Do not drop `editable_content` until all of these are true:

- production audit shows no unreviewed legacy records;
- every required clinical content type has a structured equivalent;
- public pages have been checked against the old site;
- navigation has been manually approved;
- no application code requires the legacy endpoint;
- a production backup has been taken;
- rollback has been rehearsed.

Only then should a later phase remove the legacy API/table.
