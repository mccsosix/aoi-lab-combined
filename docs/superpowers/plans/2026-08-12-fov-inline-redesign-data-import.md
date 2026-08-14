# FOV Inline Redesign and Camera Data Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FOV TOOL 03 expand inline, redesign its information hierarchy per the supplied spec, and import the supplied Do3think/OPT camera data safely.

**Architecture:** Preserve the Vite/React app and all FOV domain/storage APIs. Change only App composition, FOV presentation components/CSS, default camera records, and the default-data version label.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, browser IndexedDB, JSON default datasets.

## Global Constraints

- Preserve the user's current `App.tsx` and `index.css` edits, especially Future Tools appearing after expanded tools with its added spacing.
- Do not modify FOV calculations, recommendation algorithm, compatibility logic, IndexedDB schema, import/export behavior, or device-library behavior.
- Keep all new FOV CSS scoped under `.fov-shell`.
- Keep desktop-first behavior and responsive stacking below 1024 px.

---

### Task 1: Add regression verification

**Files:**
- Create: `scripts/verify-fov-update.mjs`

**Interfaces:**
- Consumes: project source text and `src/fov/data/cameras.json`
- Produces: exit code 0 only when inline expansion, redesigned UI anchors, and all imported models are present and valid

- [ ] Write assertions for inline FOV rendering, active card state, redesigned layout classes, KPI classes, and imported model metadata.
- [ ] Run `node scripts/verify-fov-update.mjs` and confirm it fails on the pre-change source.

### Task 2: Make FOV expand inline

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/fov/components/FovWorkbench.tsx`

**Interfaces:**
- Consumes: existing `activeTool`, `handleOpen`, `handleClose`
- Produces: `<FovWorkbench onBack={handleClose} />` below other expanded tools

- [ ] Remove the FOV early return from `App.tsx`.
- [ ] Mark the FOV tool card active when selected.
- [ ] Render FOV in the expanded-tool area before Future Tools.
- [ ] Change the FOV outer element from a page-level `<main>` to an embedded `<section>` and make its close control collapse the tool.

### Task 3: Redesign FOV information hierarchy

**Files:**
- Modify: `src/fov/components/FovWorkbench.tsx`
- Modify: `src/fov/components/ReportResult.tsx`
- Modify: `src/fov/fov.css`

**Interfaces:**
- Consumes: existing selected camera/lens, calculated FOV, compatibility, recommendation result
- Produces: compact utility bar/header, 34/66 layout, KPI-first result, details grid, compatibility notice, scrollable target results

- [ ] Add compact utility bar, status chips, mode tabs, sensor summary, usage tips, and section headers.
- [ ] Convert report presentation to H-FOV/V-FOV/Resolution/DOF KPI cards and two-column device detail rows.
- [ ] Rewrite scoped FOV CSS to the supplied layout, colors, spacing, control sizes, and responsive breakpoints.

### Task 4: Import spreadsheet camera data

**Files:**
- Modify: `src/fov/data/cameras.json`
- Modify: `src/fov/hooks/useDeviceLibrary.ts`
- Create: `docs/FOV_CAMERA_IMPORT_NOTES.md`

**Interfaces:**
- Consumes: unique model rows from `工作簿1(1).xlsx`
- Produces: 1147 default camera records with the 14 spreadsheet models represented once each; existing customized IndexedDB records remain protected by current repository behavior

- [ ] Deduplicate the two repeated Do3think rows.
- [ ] Update the two models already present and append the remaining 12 models.
- [ ] Set the default data version label to `2026-08-12-camera1147-lens426`.
- [ ] Document spreadsheet fields and physical-sensor completion assumptions.

### Task 5: Verify and package

**Files:**
- Verify: all changed source/data files
- Create: `/mnt/data/aoi-lab-combined.zip`

**Interfaces:**
- Consumes: final project tree
- Produces: clean source ZIP without `node_modules`, `.git`, or build artifacts

- [ ] Run `node scripts/verify-fov-update.mjs` and require 0 failures.
- [ ] Run TypeScript checking with the available local toolchain.
- [ ] Run focused FOV math/data assertions without changing domain code.
- [ ] Confirm no `node_modules`, `.git`, `.workbuddy`, or `dist` enters the archive.
- [ ] Zip the project with root folder `aoi-lab-combined`.
