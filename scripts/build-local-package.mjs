import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const release = path.join(root, "release");
const folder = path.join(release, "AOI-LAB本地工具");
const archive = path.join(release, "AOI-LAB本地工具.zip");
if (!existsSync(path.join(root, "local-dist", "index.html"))) throw new Error("请先运行本地静态构建");

// 受限环境下删除可能被安全策略拦截；清理失败不阻断打包，后续复制会覆盖同名文件。
function safeRemove(target, options) {
  try {
    rmSync(target, options);
  } catch (error) {
    console.warn(`清理失败，继续打包：${target}（${error.message}）`);
  }
}

safeRemove(folder, { recursive: true, force: true });
safeRemove(archive, { force: true });
mkdirSync(folder, { recursive: true });
cpSync(path.join(root, "local-dist"), path.join(folder, "web"), { recursive: true });
cpSync(path.join(root, "launcher", "启动工具.bat"), path.join(folder, "启动工具.bat"));
cpSync(path.join(root, "launcher", "server.ps1"), path.join(folder, "server.ps1"));
cpSync(path.join(root, "README.md"), path.join(folder, "使用说明.md"));

const result = process.platform === "win32"
  ? spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", `Compress-Archive -LiteralPath '${folder}' -DestinationPath '${archive}' -Force`], { stdio: "inherit" })
  : spawnSync("zip", ["-q", "-r", archive, path.basename(folder)], { cwd: release, stdio: "inherit" });
if (result.status !== 0) throw new Error("创建 ZIP 失败");
console.log(JSON.stringify({ folder, archive }));
