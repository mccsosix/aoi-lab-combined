# Source One-Click Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a root-level Windows BAT that installs dependencies on first use, launches the source development server, and opens the browser.

**Architecture:** Keep Windows orchestration in one root `一键启动.bat` and expose browser opening through a reusable `dev:open` npm script. Extend the existing Node package test to validate the launcher contract without attempting to execute Windows BAT in Linux.

**Tech Stack:** Windows Batch, npm, Vite, Node.js Test Runner

## Global Constraints

- The launcher filename is exactly `一键启动.bat` at the project root.
- Node.js 22.13+ and npm are required; the BAT must not install system software.
- Run `npm install` only when `node_modules` is absent.
- Do not change `AOI-LAB本地工具.zip` or deploy an online build.
- Keep Chinese error messages and support project paths containing spaces or Chinese characters.

---

### Task 1: Define the source launcher contract

**Files:**
- Modify: `tests/local-package.test.mjs`
- Test: `tests/local-package.test.mjs`

**Interfaces:**
- Consumes: project root resolved with `new URL("../", import.meta.url)`
- Produces: assertions for the root BAT and `package.json` `dev:open` script

- [ ] **Step 1: Write the failing test**

```js
test("源码包根目录提供首次安装后启动开发服务器的 BAT", () => {
  const launcher = readFileSync(new URL("一键启动.bat", projectRoot), "utf8");
  const packageJson = JSON.parse(readFileSync(new URL("package.json", projectRoot), "utf8"));
  assert.match(launcher, /where node/);
  assert.match(launcher, /where npm/);
  assert.match(launcher, /process\.versions\.node/);
  assert.match(launcher, /if not exist "node_modules"/);
  assert.match(launcher, /call npm install/);
  assert.match(launcher, /call npm run dev:open/);
  assert.equal(packageJson.scripts["dev:open"], "vite --open");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/local-package.test.mjs`

Expected: FAIL because `一键启动.bat` does not exist.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/local-package.test.mjs
git commit -m "test: define source launcher contract"
```

### Task 2: Implement the one-click launcher

**Files:**
- Create: `一键启动.bat`
- Modify: `package.json`
- Modify: `README.md`
- Test: `tests/local-package.test.mjs`

**Interfaces:**
- Consumes: Windows `where`, `node`, `npm`, and package script `dev:open`
- Produces: a root-level double-click entry point that returns the npm process status

- [ ] **Step 1: Add the npm script**

Add to `package.json`:

```json
"dev:open": "vite --open"
```

- [ ] **Step 2: Add the minimal BAT implementation**

```bat
@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || goto :missing_runtime
where npm >nul 2>nul || goto :missing_runtime
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" || goto :outdated_runtime
if not exist "node_modules" (
  call npm install
  if errorlevel 1 goto :install_failed
)
call npm run dev:open
if errorlevel 1 goto :start_failed
exit /b 0
```

Add labels that print Chinese guidance, pause, and `exit /b 1` for missing runtime, outdated Node.js, install failure, and start failure.

- [ ] **Step 3: Update source usage documentation**

Document that Windows users can double-click `一键启动.bat`, the first run requires internet access to install dependencies, and later runs reuse `node_modules`.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/local-package.test.mjs`

Expected: 3 tests pass, 0 fail.

- [ ] **Step 5: Commit the implementation**

```bash
git add 一键启动.bat package.json package-lock.json README.md tests/local-package.test.mjs
git commit -m "feat: add source one-click launcher"
```

### Task 3: Verify and replace the source archive

**Files:**
- Replace: `/workspace/scratch/498d28760c1a/AOI-LAB-local-project-completed.zip`

**Interfaces:**
- Consumes: verified project tree and existing Library file identity
- Produces: updated source ZIP with `一键启动.bat` at its archive root

- [ ] **Step 1: Run full verification**

Run: `npm run lint && npm test && npm run validate:data && git diff --check`

Expected: every command exits 0; Vitest reports 20 passing tests and Node reports the launcher/package/page tests with 0 failures.

- [ ] **Step 2: Rebuild the source ZIP**

Run the existing ZIP command from the project root, excluding `.git`, `node_modules`, `.next`, `dist`, `local-dist`, `.sites-runtime`, `outputs`, and `work` while keeping `release`.

- [ ] **Step 3: Verify the archive**

Run: `unzip -t /workspace/scratch/498d28760c1a/AOI-LAB-local-project-completed.zip`

Expected: no compressed-data errors and an archive entry named `一键启动.bat`.

- [ ] **Step 4: Replace the existing saved source ZIP**

Replace Library file `libfile_1725cbc087608191b7dc70c1f045b4fa` using optimistic version `0`, then persist the returned xattrs on the local ZIP.
