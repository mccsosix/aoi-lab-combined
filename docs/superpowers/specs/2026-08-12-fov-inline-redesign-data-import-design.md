# FOV Inline Redesign and Camera Data Import Design

## Goal

Keep the user's current AOI LAB project as the source of truth, preserve their App/CSS edits, make FOV TOOL 03 expand below the tool cards like the other two tools, restyle the FOV workbench according to `FOV_LAYOUT_REDESIGN_SPEC(1).md`, and import the Do3think/OPT camera rows from `工作簿1(1).xlsx` without changing FOV math, compatibility rules, recommendation logic, or IndexedDB schema.

## Architecture

- `App.tsx` remains the single top-level tool switcher. FOV becomes a third inline expanded panel instead of replacing the whole app.
- `FovWorkbench` becomes an embedded `<section>` with its own scoped industrial grid surface and compact utility/header areas.
- `ReportResult` only changes presentation: KPI-first results, device detail grid, compatibility notice, and collapsed advanced parameters. Existing report calculations are reused unchanged.
- All FOV styles remain scoped under `.fov-shell` to avoid affecting the case-query and sheet-generator tools.
- Camera defaults stay in the existing JSON schema. The existing IndexedDB merge behavior will add new defaults and update non-customized defaults while preserving customized records.

## Data Import Rules

- Deduplicate repeated spreadsheet rows by model before import.
- Preserve spreadsheet model, interface, sensor format, resolution, shutter type (represented through the selected global-shutter family), and fps.
- Existing Do3think models are updated in place by model/id; missing models are appended as defaults.
- Add OPT as a new camera brand with C-Mount, USB3.0 family metadata and physical sensor dimensions required by the existing FOV algorithm.
- Physical sensor dimensions are derived from resolution × pixel pitch. Pixel pitch is completed from matching vendor camera families when the spreadsheet does not contain it; no FOV algorithm changes are made.

## UI Acceptance

- FOV card shows active state while expanded.
- FOV opens below the cards and collapses with the FOV close/collapse control.
- Top utility bar is compact; title area is shorter than before.
- Manual mode uses a 360–420 px input column and larger result column.
- Result hierarchy is KPI → device details → compatibility → advanced details.
- Target mode uses the same left-filter/right-results skeleton; result table scrolls internally.
- Keep deep-blue grid, warm paper panels, cyan structural accents, orange warning/CTA accents, small radii, and desktop-first responsive behavior.
