# AOI LAB FOV Integration Design

## Goal

Integrate the standalone `AOI-LAB-POV` FOV camera/lens selection tool into the existing `aoi-lab-combined-main` Vite application as tool 03, producing a single project named `aoi-lab-combined` without breaking the existing case-query and sheet-generator tools.

## Architecture

The existing React + Vite application remains the only application shell. The FOV feature is migrated as a self-contained `src/fov/` module containing its domain logic, IndexedDB repository, default device data, hooks, and UI components. No Next.js, Vinext, Cloudflare, Drizzle, or React Router dependency is introduced.

The home screen gains a third tool card. Selecting tool 03 switches the app into a full-screen FOV workbench rendered inside the same React root. `FovWorkbench` receives an `onBack` callback instead of navigating with `window.location.href`, so returning to the toolbox is state-driven and remains safe under Vite/GitHub Pages sub-path deployment.

## Data and persistence

The bundled camera and lens JSON datasets are copied unchanged into `src/fov/data/`. The FOV feature continues using the browser native IndexedDB API for local device edits, hiding defaults, reset behavior, and JSON backup import/export. Existing data semantics and calculations remain unchanged.

## Styling

The main AOI LAB visual language remains unchanged. FOV-specific CSS is placed in `src/fov/fov.css` and loaded only by the FOV workbench. Generic FOV selectors are scoped under `.fov-shell` where necessary so modal, panel, header-action, table, and button styles cannot leak into the existing two tools.

## Testing

The existing FOV domain, storage, report, workbench, and device-library tests are migrated to the Vite project using Vitest, Testing Library, jsdom, and fake-indexeddb. A new application integration test verifies that the third tool card opens the FOV workbench and its back action returns to the toolbox. Final verification requires all tests, TypeScript compilation, and the Vite production build to pass.
