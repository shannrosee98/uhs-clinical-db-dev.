# UHS CMS migration phase 2

## Goal
Move the legacy `editable_content` rows into the structured Phase 2 CMS without deleting or modifying the legacy source.

## Important finding
The database schema cannot reliably tell whether a row in `editable_content` was created by **Seed Defaults** or manually created by an administrator. Both paths write to the same table and there is no provenance column. Therefore this phase treats every existing row as content worth preserving and records its original key/type inside the migrated block.

## Audit (read-only)
Run:

    npm run cms:audit

This prints JSON containing:
- total legacy rows
- counts by content type
- published/hidden counts
- empty/unnamed content
- current structured-table counts
- proposed destination for each legacy type
- categories discovered in legacy content

The audit does not change the database.

## Safe migration
After reviewing the audit:

    npm run cms:migrate

This:
1. Creates a **draft**, admin-visible page called `Legacy Content Migration`.
2. Creates a draft section for each legacy content type.
3. Copies non-navigation legacy rows into `cms_content_blocks`.
4. Copies `nav` rows into `cms_navigation`.
5. Creates reusable categories found in legacy content.
6. Writes a version-1 snapshot into `cms_content_versions`.
7. Leaves every `editable_content` row untouched.

The migration is idempotent for content blocks: rerunning it updates the same deterministic `legacy-*` block keys rather than creating another copy.

## Mapping
- medication -> medication block
- procedure -> procedure block
- equipment -> equipment block
- emergency -> emergency block
- question -> tts block
- rp-action -> rp block
- scene -> document block
- surgery -> document block
- section-text -> text block
- theme -> document block (because Phase 2 has no settings table)
- generic -> document block
- nav -> navigation

Content that does not map cleanly keeps its original JSON payload and receives `_migration.source_*` metadata.

## What is intentionally NOT done
- No legacy rows are deleted.
- No production pages are published.
- No legacy content is assumed to be disposable.
- No automatic attempt is made to infer that a legacy row is a built-in default.
- Theme/localStorage migration is not performed because Phase 2 currently has no dedicated settings/branding table.

## Recommended production sequence
1. Run `npm run cms:audit` against a production database backup/staging database.
2. Review the report.
3. Run `npm run cms:migrate` in staging.
4. Review the draft page and migrated blocks in the CMS Manager.
5. Manually promote/reshape content into real pages and navigation.
6. Only after production usage confirms the structured CMS is sufficient should `cms.js`/`editable_content` be considered for retirement.
