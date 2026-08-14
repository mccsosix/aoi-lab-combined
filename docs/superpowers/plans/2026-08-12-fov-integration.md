# FOV Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge AOI-LAB-POV's complete FOV camera/lens workflow into the existing AOI LAB Vite project as tool 03 while preserving the current two tools.

**Architecture:** Keep the current Vite app as the only shell and migrate FOV as a self-contained `src/fov/` module. Open/close the FOV workbench through App state rather than URL routing, and scope FOV styles to prevent cross-tool CSS collisions.

**Tech Stack:** React 19, TypeScript, Vite 6, Tailwind CSS 4, browser native IndexedDB, Vitest, Testing Library, jsdom, fake-indexeddb.

## Global Constraints

- Output project directory is `aoi-lab-combined`.
- Preserve existing `case-query` and `sheet-generator` behavior.
- Do not add Next.js, Vinext, Cloudflare, Drizzle, or React Router.
- Keep all FOV device data local and preserve IndexedDB import/export behavior.
- Tool 03 opens a full-screen FOV workbench and returns to the toolbox without URL navigation.
- Production build must remain compatible with Vite's configured `/aoi-lab-combined/` base path.

---

### Task 1: Test harness and failing integration test

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `src/App.integration.test.tsx`
- Create: `tests/fixtures.ts`
- Copy tests into: `src/fov/**/*.test.ts(x)` before production FOV modules exist

**Interfaces:**
- Consumes: existing `App` component.
- Produces: a test harness that can validate FOV domain/UI behavior and the app-level tool-03 navigation contract.

- [ ] **Step 1: Add Vitest and Testing Library configuration plus the migrated tests.**
- [ ] **Step 2: Add an App integration test that expects a `FOV 相机与镜头选型` card, opens it, sees `AOI LAB / TOOL 03 / OPTICS`, clicks `返回工具箱`, and sees the toolbox card again.**
- [ ] **Step 3: Run the tests and verify they fail because the FOV module/tool-03 integration does not exist yet.**

### Task 2: Port FOV domain, data, persistence, and UI

**Files:**
- Create: `src/fov/data/cameras.json`
- Create: `src/fov/data/lenses.json`
- Create: `src/fov/data/lens-extraction-report.json`
- Create: `src/fov/domain/types.ts`
- Create: `src/fov/domain/fov.ts`
- Create: `src/fov/domain/compatibility.ts`
- Create: `src/fov/domain/recommend.ts`
- Create: `src/fov/domain/report.ts`
- Create: `src/fov/storage/db.ts` using the browser native IndexedDB API
- Create: `src/fov/storage/backup.ts`
- Create: `src/fov/hooks/useDeviceLibrary.ts`
- Create: `src/fov/components/Modal.tsx`
- Create: `src/fov/components/BackupModal.tsx`
- Create: `src/fov/components/DeviceLibraryModal.tsx`
- Create: `src/fov/components/ReportResult.tsx`
- Create: `src/fov/components/FovWorkbench.tsx`
- 
**Interfaces:**
- Consumes: bundled camera/lens JSON and browser IndexedDB.
- Produces: `FovWorkbench({ onBack?, repository?, defaultData? })` plus the original FOV calculation/recommendation/storage APIs.

- [ ] **Step 1: Copy the FOV production module from AOI-LAB-POV.**
- [ ] **Step 2: Change `FovWorkbench` to accept `onBack?: () => void`; use it for the back button instead of `window.location.href = "/"`.**
- [ ] **Step 3: Run migrated FOV tests and make them pass without changing calculation/data behavior.**

### Task 3: Add tool 03 to the AOI LAB shell

**Files:**
- Modify: `src/types.ts`
- Modify: `src/components/Icons.tsx`
- Modify: `src/App.tsx`
- Create: `src/fov/fov.css`

**Interfaces:**
- Consumes: `FovWorkbench({ onBack })`.
- Produces: `ToolId` includes `fov`; home shows tool card 03; selecting it renders the full-screen workbench; back returns to home.

- [ ] **Step 1: Extend `ToolId` with `fov` and add an optics/FOV icon.**
- [ ] **Step 2: Add tool card 03 and render `FovWorkbench` as the app's full-screen state when selected.**
- [ ] **Step 3: Extract and scope FOV styles from AOI-LAB-POV's globals into `src/fov/fov.css`, loaded by `FovWorkbench`.**
- [ ] **Step 4: Run the App integration test and all FOV tests; verify all pass.**

### Task 4: Production verification and package handoff

**Files:**
- Modify: `README.md` only if needed to describe tool 03 and local startup.
- Generated: `dist/`
- Generated handoff: `/mnt/data/aoi-lab-combined.zip`

**Interfaces:**
- Consumes: completed unified project.
- Produces: a buildable source project and ZIP handoff.

- [ ] **Step 1: Run `npm test`.**
- [ ] **Step 2: Run `npm run build` and verify TypeScript + Vite succeed.**
- [ ] **Step 3: Inspect the generated `dist` assets and confirm FOV data/code are bundled with the same `/aoi-lab-combined/` base path.**
- [ ] **Step 4: Package source (excluding `node_modules`, `.git`, and `dist`) as `/mnt/data/aoi-lab-combined.zip`.**
