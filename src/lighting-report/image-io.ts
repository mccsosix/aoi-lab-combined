/**
 * 06 打光报告生成器 —— 上传图片的读取与降采样（**只跑在浏览器**）
 *
 * 为什么降采样放在 UI 而不在 domain：
 *   domain 要能在 Node 里被门禁直接 import（`scripts/verify-lighting-report.mjs`），
 *   而 Node 没有 canvas / createImageBitmap。所以「阈值」在 domain（`canvas.ts` 的
 *   `IMAGE_MAX_PX` / `IMAGE_JPEG_QUALITY`），「像素操作」在这里 —— 分开之后
 *   门禁能用同一份 domain 跑，而真浏览器的 E2E 去验真正压出来的字节。
 *
 * 现场为什么必须压：CCD 拍的图动辄 4000×3000 / 5–10MB。不压的话一页 4 张 = 30MB，
 * 整份报告上百 MB，`offline/index.html` 的下载与微信转发都会直接废掉。
 *
 * 三个容易踩的坑：
 *   ① PNG 带透明 → 直接用 JPEG 编码会把透明区变**黑**，所以先铺白底再画。
 *   ② `createImageBitmap` 在旧内核里没有，退回 `<img>` + objectURL（2–3 年前的企业微信内核）。
 *   ③ canvas 的 `toDataURL` 有体积上限，失败时不能静默 —— 返回的错误要能显示给用户。
 */
import { IMAGE_JPEG_QUALITY, IMAGE_MAX_PX } from "./domain/canvas";

export type PreparedImage = {
  /** 原始文件名，写进 pic 的 descr */
  name: string;
  /** 降采样后的 JPEG dataURL */
  dataUrl: string;
  /** 降采样后的像素尺寸 */
  pxW: number;
  pxH: number;
  /** 原始尺寸（给用户看「压了多少」） */
  srcW: number;
  srcH: number;
};

type Loaded = { source: CanvasImageSource; w: number; h: number; release: () => void };

async function loadImage(file: File): Promise<Loaded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, w: bmp.width, h: bmp.height, release: () => bmp.close?.() };
    } catch {
      /* 落到 <img> 分支 */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`读不出这张图（${file.name}）`));
      el.src = url;
    });
    return { source: img, w: img.naturalWidth, h: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * 读一个文件 → 降采样后的 JPEG。
 * 长边不超过 `IMAGE_MAX_PX`；**本来就不超的图不放大**（放大只是白占体积）。
 */
export async function prepareImageFile(file: File): Promise<PreparedImage> {
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name)) {
    throw new Error(`${file.name} 不是图片文件`);
  }
  const loaded = await loadImage(file);
  try {
    const scale = Math.min(1, IMAGE_MAX_PX / Math.max(loaded.w, loaded.h));
    const w = Math.max(1, Math.round(loaded.w * scale));
    const h = Math.max(1, Math.round(loaded.h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("这台机器的浏览器不支持 canvas 2d，无法处理图片");
    // ① 先铺白底：PNG 的透明区域直接编码成 JPEG 会变成黑块
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(loaded.source, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
    if (!/^data:image\/jpeg;base64,/.test(dataUrl)) throw new Error(`${file.name} 转码失败（浏览器没给出 JPEG）`);
    return { name: file.name, dataUrl, pxW: w, pxH: h, srcW: loaded.w, srcH: loaded.h };
  } finally {
    loaded.release();
  }
}

/** 批量：一个文件失败不连累其它，失败信息逐条回报 */
export async function prepareImageFiles(files: File[]): Promise<{ prepared: PreparedImage[]; errors: string[] }> {
  const prepared: PreparedImage[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      prepared.push(await prepareImageFile(file));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { prepared, errors };
}
