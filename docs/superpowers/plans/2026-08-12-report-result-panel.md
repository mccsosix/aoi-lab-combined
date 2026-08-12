# Report Result Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Turn the manual FOV result panel into a copyable report summary and filter the lens picker by actual mount and image-circle compatibility.

**Architecture:** Extend normalized camera/lens records with the raw catalog fields needed by reports, and isolate report math/text in a domain module. Keep compatibility filtering derived from the existing `checkCompatibility` result, then render a focused report component with native expandable details.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, IndexedDB, Node.js data normalization

## Global Constraints

- Report DOF is `source DOF × actual magnification` as explicitly chosen by the user.
- Lens resolution is `1 / (2 × image MTF lp/mm × actual magnification)` and is labeled as an MTF estimate in details.
- Physical compatibility uses sensor diagonal millimeters and lens image-circle millimeters, not optical-format string ordering.
- Explicitly incompatible lenses are hidden by default but recoverable through “显示不兼容镜头”.
- Missing catalog fields display `—`; never invent values.
- Preserve the AOI LAB style, local IndexedDB behavior, old JSON backup compatibility, Windows launchers, and local-only delivery.

---

### Task 1: Extend default records and report calculations

**Files:**
- Modify: `src/fov/domain/types.ts`
- Create: `src/fov/domain/report.ts`
- Create: `src/fov/domain/report.test.ts`
- Modify: `tests/fixtures.ts`
- Modify: `scripts/normalize-fov-data.mjs`
- Modify: `scripts/validate-default-data.mjs`
- Modify: `tests/default-data.test.ts`
- Regenerate: `src/fov/data/cameras.json`
- Regenerate: `src/fov/data/lenses.json`

**Interfaces:**
- Produces: optional camera fields `sensorFormat`, `fps`, `pixelSizeXUm`, `pixelSizeYUm`, `sensorModel`, `nominalMegapixels`
- Produces: optional lens fields `sensorFormat`, `imageMtfLpMmMin`, `depthOfFieldAperture`, `aperture`, `depthOfFieldSymmetric`
- Produces: `buildReportResult(camera: Camera, lens: Lens, fov: FovResult): ReportResult`
- Produces: `formatReportText(result: ReportResult): string`

- [x] **Step 1: Write failing report formula tests**

```ts
it("uses actual magnification for report DOF", () => {
  const result = buildReportResult(cameraFixture, { ...lensFixture, depthOfFieldMm: 14.8 }, calculateFov(cameraFixture, lensFixture));
  expect(result.dofMm).toBeCloseTo(14.8 * 0.208);
});

it("converts image MTF to object half-pitch", () => {
  const result = buildReportResult(cameraFixture, { ...lensFixture, imageMtfLpMmMin: 135 }, calculateFov(cameraFixture, lensFixture));
  expect(result.lensResolutionMm).toBeCloseTo(1 / (2 * 135 * 0.208));
});

it("keeps unavailable catalog values explicit", () => {
  const result = buildReportResult(cameraFixture, lensFixture, calculateFov(cameraFixture, lensFixture));
  expect(result.fps).toBeNull();
  expect(result.lensResolutionMm).toBeNull();
});
```

- [x] **Step 2: Run the tests and confirm they fail**

Run: `npm run test:unit -- src/fov/domain/report.test.ts`

Expected: FAIL because `report.ts` does not exist.

- [x] **Step 3: Add optional record fields and report functions**

Implement `buildReportResult` with numeric values and `formatReportText` with the exact seven labels `CCD`, `Sensor Size`, `Lens`, `FOV`, `DOF`, `Resolution`, and `Lens Resolution`. Format Resolution with five decimals and missing values as `—`.

- [x] **Step 4: Extend normalization and regenerate defaults**

Map raw camera `sensor_format`, `fps`, pixel sizes, sensor model, and a nominal megapixel label parsed from source notes when available. Map raw lens sensor format, image MTF, DOF aperture, best aperture, and symmetric DOF metadata for catalog families whose source explicitly uses `±`.

Run: `node scripts/normalize-fov-data.mjs`

- [x] **Step 5: Add specified-record data assertions**

Assert `MV-CH250-90UC` carries `sensorFormat: "1.1”"` and `fps: 14`, while `DTCM110-80H-AL` carries `imageMtfLpMmMin: 135`, `magnification: 0.208`, `depthOfFieldMm: 14.8`, and `depthOfFieldAperture: "F16"`.

- [x] **Step 6: Run focused tests and data validation**

Run: `npm run test:unit -- src/fov/domain/report.test.ts tests/default-data.test.ts && npm run validate:data`

Expected: all focused tests pass and default counts remain 1,135 cameras and 426 lenses.

### Task 2: Add compatibility-aware lens filtering

**Files:**
- Modify: `src/fov/domain/compatibility.ts`
- Modify: `src/fov/domain/compatibility.test.ts`
- Modify: `src/fov/components/FovWorkbench.tsx`
- Modify: `src/fov/components/FovWorkbench.test.tsx`

**Interfaces:**
- Produces: `isExplicitlyIncompatible(camera: Camera, lens: Lens): boolean`
- Consumes: existing `checkCompatibility(camera, lens)`

- [x] **Step 1: Write failing compatibility and component tests**

```ts
it("recognizes a smaller 2/3-inch sensor as covered by a 1-inch image circle", () => {
  expect(isExplicitlyIncompatible({ ...cameraFixture, sensorDiagonalMm: 11 }, { ...lensFixture, maxSensorDiagonalMm: 16 })).toBe(false);
});

it("hides an image-circle-incompatible lens until the override is enabled", async () => {
  // Render one compatible and one 10 mm image-circle lens for a 15.697 mm camera.
  expect(await screen.findByRole("option", { name: /LENS-OK/ })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /LENS-SMALL/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "显示不兼容镜头" }));
  expect(screen.getByRole("option", { name: /LENS-SMALL/ })).toBeInTheDocument();
});
```

- [x] **Step 2: Run focused tests and confirm failure**

Run: `npm run test:unit -- src/fov/domain/compatibility.test.ts src/fov/components/FovWorkbench.test.tsx`

Expected: FAIL because the helper and checkbox do not exist.

- [x] **Step 3: Implement minimal filtering behavior**

Derive filtered lenses from selected camera, brand, keyword, and `showIncompatible`. Exclude only status `incompatible`; keep `review` records visible. When the selected lens disappears after a camera or filter change, resolve the effective selection to the first visible lens without mutating state in an effect.

- [x] **Step 4: Run focused tests**

Run: `npm run test:unit -- src/fov/domain/compatibility.test.ts src/fov/components/FovWorkbench.test.tsx`

Expected: all focused tests pass.

### Task 3: Render the report summary, copy action, and details

**Files:**
- Create: `src/fov/components/ReportResult.tsx`
- Create: `src/fov/components/ReportResult.test.tsx`
- Modify: `src/fov/components/FovWorkbench.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `buildReportResult`, `formatReportText`, selected camera/lens, FOV, and compatibility
- Produces: `<ReportResult camera lens fov compatibility />`

- [x] **Step 1: Write failing component tests**

Render the specified camera/lens fixture and assert the seven report labels, five-decimal Resolution, DOF formula, compatibility status, closed “查看更多参数”, and copy button. Stub `navigator.clipboard.writeText`, click “复制报告参数”, and assert the copied text contains all seven labels and the button changes to “已复制”.

- [x] **Step 2: Run the component test and confirm failure**

Run: `npm run test:unit -- src/fov/components/ReportResult.test.tsx`

Expected: FAIL because `ReportResult.tsx` does not exist.

- [x] **Step 3: Implement the report component**

Use a definition-list-like row layout for the seven primary fields, a native `<details>` for technical values, the existing compatibility component styling, and a visible copy error state. Keep physical status outside the collapsed details.

- [x] **Step 4: Replace the old metric grid and add responsive styles**

Render `ReportResult` in manual mode. Add `.report-list`, `.report-row`, `.report-copy`, `.report-details`, and narrow-screen rules while preserving current paper panel and AOI LAB tokens.

- [x] **Step 5: Run component and workbench tests**

Run: `npm run test:unit -- src/fov/components/ReportResult.test.tsx src/fov/components/FovWorkbench.test.tsx`

Expected: all tests pass.

### Task 4: Expose new fields in the local device library

**Files:**
- Modify: `src/fov/components/DeviceLibraryModal.tsx`
- Modify: `src/fov/components/DeviceLibraryModal.test.tsx`
- Modify: `src/fov/storage/backup.test.ts`

**Interfaces:**
- Consumes: optional fields added in Task 1
- Produces: editable camera report fields and lens report fields without making them required

- [x] **Step 1: Write failing editor tests**

Open a camera editor and assert fields for optical format, fps, nominal megapixels, and pixel size. Open a lens editor and assert fields for sensor format, MTF, original DOF, DOF aperture, and best aperture. Save a missing optional field as `null`, not zero.

- [x] **Step 2: Run the editor test and confirm failure**

Run: `npm run test:unit -- src/fov/components/DeviceLibraryModal.test.tsx`

Expected: FAIL because the optional fields are not rendered.

- [x] **Step 3: Add optional editor fields and blank defaults**

Keep existing required validation unchanged. Use nullable number parsing for optional numeric values and include a checkbox for symmetric `±` DOF.

- [x] **Step 4: Confirm old backups remain importable**

Add an import fixture with schema version 1 and no new optional fields; assert preview and apply still succeed.

- [x] **Step 5: Run storage and editor tests**

Run: `npm run test:unit -- src/fov/components/DeviceLibraryModal.test.tsx src/fov/storage/backup.test.ts`

Expected: all tests pass.

### Task 5: Validate the experience and refresh deliverables

**Files:**
- Modify: `README.md`
- Modify: `docs/fov-data-fields.md`
- Modify: `docs/verification-report.md`
- Replace: `release/AOI-LAB本地工具.zip`
- Replace: `/workspace/scratch/498d28760c1a/AOI-LAB-local-project-completed.zip`

**Interfaces:**
- Consumes: complete verified source tree
- Produces: updated standalone local package and source package with one-click BAT

- [x] **Step 1: Update user and field documentation**

Document the report list, actual-magnification DOF convention, MTF estimate, optical-format display, numeric image-circle rule, and incompatible-lens override.

- [x] **Step 2: Run full automated verification**

Run: `npm run lint && npm test && npm run validate:data && npm run package:local && node --test tests/local-package.test.mjs && git diff --check`

Expected: every command exits 0, all unit/component tests pass, both routes build, data counts are unchanged, and local launcher assertions pass.

- [x] **Step 3: Run agent preview QA**

Start the Sites agent preview, inspect the default report list, select `MV-CH250-90UC` and `DTCM110-80H-AL` with incompatible lenses visible, exercise copy/details controls, and inspect a narrow responsive layout. Confirm the status shows 18.10 mm required versus 16.60 mm supported.

- [x] **Step 4: Rebuild and verify both archives**

Confirm `unzip -t` reports no errors, `AOI-LAB本地工具.zip` contains `启动工具.bat`, and the source ZIP root contains `一键启动.bat`.

- [x] **Step 5: Replace the existing saved deliverables**

Replace the existing Library identities for the standalone package and source package using their current version guards, then persist returned xattrs locally.
