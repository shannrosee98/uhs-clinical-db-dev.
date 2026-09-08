# UHS CMS Phase 3 — Structured CMS cutover

Phase 3 makes the **structured CMS the preferred runtime source for published admin content** while retaining the legacy `editable_content` API as a compatibility fallback.

## What changed

- Added public read-only CMS runtime endpoints:
  - `/api/public/cms/blocks/:contentType`
  - `/api/public/cms/pages/:slug`
  - `/api/public/cms/navigation`
  - `/api/public/cms/categories/:contentType`
- `public/script.js` now asks the structured CMS first. If no published structured records exist, it falls back to the legacy CMS and then built-in data.
- Public CMS endpoints only expose records with `status = published`, `visibility = public`, and `deleted_at IS NULL`.
- Migration metadata is stripped from public content.
- CMS create/update APIs now honour `order_index`, `status`, and `visibility` consistently.
- Content block `block_key` can now be renamed from the structured CMS.
- Added restore endpoints for blocks, navigation items, and categories.
- Added status/visibility controls to the corresponding structured CMS editors.

## Safe cutover procedure

1. Run `npm run cms:audit` against a database copy or staging database.
2. Run `npm run cms:migrate` if the legacy content has not already been migrated.
3. Open **Admin → CMS Manager**.
4. Review the generated **Legacy Content Migration** draft page.
5. Publish the page/sections/blocks only after review.
6. Confirm the public site is reading the expected structured records.
7. Keep `editable_content` intact during the observation period.
8. Only after a successful observation period should the legacy admin editing surface be removed.

## Important

Do **not** truncate or drop `editable_content` yet. Some older admin tools still write to it, and it is the final rollback path until every runtime consumer has been moved to the structured CMS.

The runtime bridge intentionally uses a fallback model:

`Structured CMS published content → legacy editable_content → built-in JavaScript defaults`

That means an incomplete migration should degrade safely instead of producing an empty clinical reference site.
