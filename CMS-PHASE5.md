# UHS CMS Phase 5 — Authoritative Structured CMS & Retirement Gate

Phase 5 completes the **logical cutover** to the structured CMS without performing a destructive
database drop.

## Production architecture

Public content now follows:

1. published/public structured CMS blocks
2. built-in application defaults
3. **optional emergency legacy fallback only**

The normal frontend build has `CMS_LEGACY_FALLBACK` disabled. The legacy `editable_content` table is
retained as a rollback archive until the retirement gate passes.

## Legacy write protection

All legacy `/api/cms/*` mutation routes now return HTTP `410 LEGACY_CMS_RETIRED` by default.
This includes save, rename, delete, seed, reset, publish, duplicate, reorder, restore, and legacy
version mutations.

Emergency writes require:

```text
CMS_LEGACY_WRITE_ENABLED=true
```

Do not enable this during normal operation.

The old read-only CMS screen can remain available for audit/rollback visibility. New content must
be created in **Admin → CMS Manager**.

## Migration safety correction

Legacy navigation and migrated categories are created as `draft` + `admin`, not published
automatically. This closes a Phase 4 safety gap where a migration could accidentally expose
navigation/category records before an administrator reviewed them.

Migration records carry provenance in `metadata` for navigation/categories and `_migration` for
content blocks.

## Retirement gate

Run:

```bash
npm run cms:retirement-check
```

The command is read-only. It checks:

- all required CMS tables exist;
- every `editable_content` row has a structured equivalent;
- navigation provenance is present;
- the public frontend has legacy fallback explicitly disabled;
- legacy writes are disabled;
- current structured published/public counts.

A zero exit code means the database has passed the mechanical retirement checks. A non-zero exit
code means production still needs review. **The command never drops `editable_content`.**

## Final destructive retirement

Do not drop `editable_content` merely because the mechanical check passes.

Before a future destructive phase:

- take a verified production database backup;
- compare every public clinical/reference section against production;
- manually approve migrated navigation;
- manually review drafts and empty/unnamed legacy records;
- test login/admin permissions and public pages;
- rehearse rollback;
- deploy the structured CMS;
- monitor production;
- only then remove the legacy table/API in a separate change.

This separation is intentional: Phase 5 makes the new CMS authoritative while keeping a reversible
database safety net.


## Render Free plan: browser-based retirement check

If the Render service is on the Free compute plan, Shell/SSH is unavailable. The same
read-only retirement check is available to authenticated administrators in:

**Admin → CMS Manager → Legacy CMS Retirement Check → Run Check**

It calls `GET /api/admin/cms-retirement-check`, which uses the production service's
existing database connection and admin session. No database credentials are entered
into the browser and the endpoint performs no writes or destructive operations.

The CLI command remains available for local/staging environments:

```bash
npm run cms:retirement-check
```
