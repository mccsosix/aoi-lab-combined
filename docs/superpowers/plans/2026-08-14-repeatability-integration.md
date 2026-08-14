# AOI LAB Repeatability Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the supplied repeatability-analysis V1.6 HTML into the existing AOI LAB React workbench as tool 04, and add a disabled tool-05 correlation placeholder.

**Architecture:** Keep the existing V1.6 implementation intact and host it inside a React component backed by Shadow DOM. Import the HTML as a raw Vite asset, mount its markup/styles/scripts inside the shadow root, redirect its root selectors to the shadow tree, and bridge its back button to React. Keep the homepage and all existing tools unchanged except for the new cards and disabled-state support.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, raw asset imports, Shadow DOM, browser IndexedDB, Node assertion verification scripts.

## Global Constraints

- 04 repeatability is usable and expands inline in the current AOI LAB page.
- 05 correlation is visible but disabled and must not open a frontend.
- Do not use iframe or external-page navigation.
- Preserve V1.6 business logic and local-data behavior.
- Preserve existing uncommitted FOV/start-script changes.
- Follow `FRONTEND_DESIGN_GUIDELINES.md` and `SUBPAGE_DESIGN_GUIDELINES.md`.

---

### Task 1: Add a failing integration verification

**Files:**
- Create: `scripts/verify-repeatability-integration.mjs`

**Interfaces:**
- Consumes: current `src/App.tsx`, `src/types.ts`, `src/components/ToolCard.tsx`.
- Produces: a deterministic source-level integration contract runnable with `node scripts/verify-repeatability-integration.mjs`.

- [ ] **Step 1: Write the failing verification script**

Assert that `ToolId` contains `repeatability`; App contains 04/05 cards; 05 uses disabled behavior; App renders `<RepeatabilityWorkbench onBack={handleClose} />`; and the repeatability workbench source contains Shadow DOM usage but no iframe.

- [ ] **Step 2: Run it to verify RED**

Run: `node scripts/verify-repeatability-integration.mjs`
Expected: FAIL because the new tool/component does not exist yet.

### Task 2: Add homepage tool IDs, icons, and disabled-card behavior

**Files:**
- Modify: `src/types.ts`
- Modify: `src/components/Icons.tsx`
- Modify: `src/components/ToolCard.tsx`
- Modify: `src/index.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `ToolId = 'case-query' | 'sheet-generator' | 'fov' | 'repeatability' | null` and `ToolCard` props `disabled?: boolean`, `statusText?: string`.

- [ ] **Step 1: Extend `ToolId`** with `repeatability` only; correlation remains non-openable.
- [ ] **Step 2: Add `RepeatabilityIcon` and `CorrelationIcon`** using the existing inline-SVG visual grammar.
- [ ] **Step 3: Extend `ToolCard` disabled semantics** so disabled cards use `aria-disabled`, do not call `onOpen`, and expose visible status copy.
- [ ] **Step 4: Add disabled styles** with clear text and pointer/keyboard behavior.
- [ ] **Step 5: Add 04 and 05 cards to App**, with 04 active/open behavior and 05 disabled.

### Task 3: Host V1.6 inside a React Shadow DOM workbench

**Files:**
- Create: `src/repeatability/RepeatabilityWorkbench.tsx`
- Create: `src/repeatability/repeatability-v1.6.html`
- Modify: `src/App.tsx`

**Interfaces:**
- `RepeatabilityWorkbench({ onBack }: { onBack: () => void })`.
- Raw HTML import: `import repeatabilityHtml from './repeatability-v1.6.html?raw'`.

- [ ] **Step 1: Copy the supplied HTML verbatim** to `src/repeatability/repeatability-v1.6.html`.
- [ ] **Step 2: Parse the raw HTML** using `DOMParser`, collect style blocks, body markup and script blocks.
- [ ] **Step 3: Create a ShadowRoot** on a host ref and mount embedded-mode CSS plus the V1.6 body.
- [ ] **Step 4: Patch selector helpers** from `document.querySelector` / `document.querySelectorAll` to a ShadowRoot stored on `window.__AOI_REPEATABILITY_ROOT__`.
- [ ] **Step 5: Patch the back-button handler** so `btnBack` calls `window.__AOI_REPEATABILITY_BACK__()`.
- [ ] **Step 6: Execute script blocks in order** after markup is mounted.
- [ ] **Step 7: Clean global bridge references on unmount** and show a local error panel if initialization throws.
- [ ] **Step 8: Render the component** for `activeTool === 'repeatability'`.

### Task 4: Documentation and verification

**Files:**
- Modify: `README.md`
- Test: `scripts/verify-repeatability-integration.mjs`

- [ ] **Step 1: Update README tool table** with 04 Repeatability and 05 Correlation (开发中).
- [ ] **Step 2: Run integration verification**: `node scripts/verify-repeatability-integration.mjs` → PASS.
- [ ] **Step 3: Run TypeScript build stage**: `./node_modules/.bin/tsc -b` → PASS.
- [ ] **Step 4: Run Vite build if host Rollup native dependency is available**; if unavailable because the uploaded Windows `node_modules` lacks Linux optional dependencies, record that environment limitation without modifying production dependencies.
- [ ] **Step 5: Package the completed working tree** without `.git`, `node_modules`, or prior `dist` into `/mnt/data/aoi-lab-combined-repeatability-integrated.zip`.
