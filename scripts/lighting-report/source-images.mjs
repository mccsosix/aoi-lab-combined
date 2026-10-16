/**
 * 从源报告里「读回」某一页影像的图片与红圈 —— **只给样张当素材用**。
 *
 * 工具本身不吃这条路径：现场是用户自己上传图。这里读回来纯粹是为了产出
 * 一份「和源报告逐页对得上」的 replica 样张，好让人一眼看出生成器摆得对不对。
 *
 * 两条判据都是量出来的，不是猜的：
 *   · 红圈 = `prstGeom prst="ellipse"` + `a:noFill` + 红描边。
 *     源报告里还有一类**红边椭圆照片**（`a:blipFill` 里嵌图、带 rot），长得像但不是标注，
 *     所以要排掉带 blipFill 的 —— 只看形状会被它骗过去。
 *   · 箭头 = `p:cxnSp`（`straightConnector1` + `tailEnd type="arrow"`）；本版不生成，
 *     只计数报出来，免得样张「少了几根箭头」被当成 bug。
 *
 * 圈归给哪张图：取「圆心落在其中、且面积最小的那张」。
 * 用面积最小而不是「第一个包含它的」，是因为源报告里图会互相压着摆，
 * 先命中的可能是底下那张大图。
 */
const EMU_PER_PT = 12700;
/** @param {string|undefined} v @returns {number} */
const pt = (v) => (v === undefined ? 0 : Number(v) / EMU_PER_PT);

/** PNG：签名 8 字节 + 块长 4 + 'IHDR' 4 → 宽高各 4（大端） */
function pngSize(b) {
  if (b.length < 24) return { w: 0, h: 0 };
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

/** JPEG：扫 SOF0/1/2 段拿宽高 */
function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + len;
  }
  return { w: 0, h: 0 };
}

function imageSize(bytes, name) {
  if (/\.png$/i.test(name)) return pngSize(bytes);
  if (/\.jpe?g$/i.test(name)) return jpegSize(bytes);
  return { w: 0, h: 0 };
}

const toDataUrl = (bytes, name) =>
  `data:${/\.png$/i.test(name) ? "image/png" : "image/jpeg"};base64,${Buffer.from(bytes).toString("base64")}`;

/**
 * @returns {{ slots: object[], media: Map<string, Uint8Array>, arrows: number, orphans: number, source: object }}
 *   `slots[i].box` 是**手动位置**（源报告的原始坐标），`slots[i].circles` 是归一化后的红圈。
 */
export async function extractSlideImages(zip, slideNo) {
  const slidePart = `ppt/slides/slide${slideNo}.xml`;
  const xml = await zip.file(slidePart)?.async("text");
  if (!xml) throw new Error(`源报告里没有 ${slidePart}`);
  const relsXml = (await zip.file(`ppt/slides/_rels/slide${slideNo}.xml.rels`)?.async("text")) ?? "";
  const relMap = new Map(
    [...relsXml.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );

  const blocks = [];
  for (const re of [/<p:pic>[\s\S]*?<\/p:pic>/g, /<p:sp>[\s\S]*?<\/p:sp>/g, /<p:cxnSp>[\s\S]*?<\/p:cxnSp>/g]) {
    let m;
    while ((m = re.exec(xml)) !== null) blocks.push({ s: m[0], i: m.index, kind: /^<p:(\w+)/.exec(m[0])[1] });
  }
  blocks.sort((a, b) => a.i - b.i);

  const pics = [];
  const circles = [];
  let arrows = 0;
  const media = new Map();

  for (const b of blocks) {
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(b.s);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(b.s);
    if (!off || !ext) continue;
    const box = { xPt: pt(off[1]), yPt: pt(off[2]), wPt: pt(ext[1]), hPt: pt(ext[2]) };

    if (b.kind === "pic") {
      const embed = /r:embed="(rId\d+)"/.exec(b.s)?.[1];
      const target = embed ? relMap.get(embed) : null;
      if (!target) continue;
      const part = target.replace(/^\.\.\//, "ppt/");
      const bytes = await zip.file(part)?.async("uint8array");
      if (!bytes) continue;
      media.set(part, bytes);
      pics.push({ box, part, name: /\sname="([^"]*)"/.exec(/<p:cNvPr[^>]*/.exec(b.s)?.[0] ?? "")?.[1] ?? part, order: pics.length });
    } else if (b.kind === "sp" && /prstGeom prst="ellipse"/.test(b.s) && !/<a:blipFill/.test(b.s) && /srgbClr val="FF0000"/.test(b.s)) {
      circles.push(box);
    } else if (b.kind === "cxnSp") {
      arrows += 1;
    }
  }

  const slots = [];
  let orphans = 0;
  const slotOfOrder = (order) => {
    let s = slots.find((x) => x.order === order);
    if (!s) {
      const p = pics[order];
      s = { order, part: p.part, name: p.name, box: p.box, circles: [] };
      slots.push(s);
    }
    return s;
  };
  for (const c of circles) {
    const cx = c.xPt + c.wPt / 2;
    const cy = c.yPt + c.hPt / 2;
    const home = pics
      .filter((p) => cx >= p.box.xPt && cx <= p.box.xPt + p.box.wPt && cy >= p.box.yPt && cy <= p.box.yPt + p.box.hPt)
      .sort((a, b) => a.box.wPt * a.box.hPt - b.box.wPt * b.box.hPt)[0];
    if (!home) { orphans += 1; continue; }
    slotOfOrder(home.order).circles.push({
      x: (c.xPt - home.box.xPt) / home.box.wPt,
      y: (c.yPt - home.box.yPt) / home.box.hPt,
      w: c.wPt / home.box.wPt,
      h: c.hPt / home.box.hPt,
    });
  }
  // 没圈也要出槽位 —— 影像页的图都是「裁过再贴」的空图也要占位，否则样张少图
  for (const p of pics) slotOfOrder(p.order);
  slots.sort((a, b) => a.order - b.order);

  for (const s of slots) {
    const bytes = media.get(s.part);
    s.dataUrl = toDataUrl(bytes, s.part);
    const size = imageSize(bytes, s.part);
    s.pxW = size.w;
    s.pxH = size.h;
    s.bytes = bytes.length;
  }

  return { slots, media, arrows, orphans, pics: pics.length, circles: circles.length };
}
