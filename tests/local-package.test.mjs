import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const root = new URL("../release/AOI-LAB本地工具/", import.meta.url);

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

test("Windows 本地包包含双击启动器和静态网页", () => {
  assert.ok(existsSync(new URL("启动工具.bat", root)));
  assert.ok(existsSync(new URL("server.ps1", root)));
  assert.ok(existsSync(new URL("web/index.html", root)));
  assert.ok(existsSync(new URL("AOI-LAB本地工具.zip", new URL("../", root))));
});

test("本地服务只监听回环地址并阻止目录逃逸", () => {
  const script = readFileSync(new URL("server.ps1", root), "utf8");
  assert.doesNotMatch(script, /0\.0\.0\.0|IPAddress\]::Any|\+:\/\//);
  assert.match(script, /IPAddress\]::Loopback/);
  assert.match(script, /StartsWith/);
  assert.match(script, /GetFullPath/);
});
