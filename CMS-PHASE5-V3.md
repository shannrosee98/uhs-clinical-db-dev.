# CMS Phase 5 browser migration v3

This release fixes two migration edge cases found in production-style deployments:

- soft-deleted pages/blocks/categories could still violate unique constraints when the migration attempted to recreate them;
- the browser API client now displays the server's PostgreSQL diagnostic message/detail instead of only the generic error.

The migration remains transactional and never deletes or modifies `editable_content`.

Deploy this version, then run **Admin → CMS Manager → Migrate Legacy Content**.
If it still fails, the UI will show the database diagnostic needed for the next fix.
