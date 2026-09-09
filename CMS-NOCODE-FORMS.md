# UHS CMS — No-Code Clinical Forms

The structured CMS now provides dedicated no-code editors for clinical content blocks.

## Supported dedicated forms

- Procedure
- Medication
- Emergency
- Equipment
- Surgery
- Incident scene
- RP action
- Alert / warning
- Checklist
- TTS / question
- Document

### How to use

1. Open **Admin → CMS Manager**.
2. Select **Content Blocks**.
3. Click **Edit** on a block, or **Add** to create one.
4. Choose the **Block type**.
5. Complete the friendly clinical fields shown for that type.
6. Use **+ Add ...** for repeatable lists such as steps, contraindications, warnings and questions.
7. Save normally.

No JSON editing is required.

## Compatibility

The editor stores data in the existing JSON-backed `content` column. Existing keys are preserved where possible, including migrated legacy keys such as `prepChecklist` and `procedureChecklist`.

Migrated surgery and scene blocks that were stored as generic `document` blocks are detected using their preserved migration metadata and receive the appropriate dedicated form.

Unknown legacy fields are intentionally retained when saving so migration data is not silently destroyed.

## Safety

The dedicated form is an editor only. It does not change the database schema or the legacy `editable_content` table.
