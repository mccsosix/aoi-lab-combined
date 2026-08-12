import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function renderHome() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders development preview metadata", async () => {
  const response = await renderHome();
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("renders the AOI LAB homepage contract", async () => {
  const response = await renderHome();
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /AOI LAB/);
  assert.match(html, /把工作里的麻烦，做成顺手的小工具/);
  assert.match(html, /案子物件查询/);
  assert.match(html, /表格生成器/);
  assert.match(html, /FOV 选型工具/);
  assert.match(html, /新工具开发中…/);
  assert.match(html, /添加下一个灵感/);
  assert.match(html, /href=["']#case-query["']/);
  assert.match(html, /href=["']#sheet-generator["']/);
  assert.match(html, /href=["']\/fov["']/);
});

test("renders the FOV tool route", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("fov-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/fov", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /FOV 相机与镜头选型/);
  assert.match(html, /设备资料库/);
  assert.match(html, /组合计算/);
  assert.match(html, /按目标推荐/);
});
