/**
 * 06 打光报告生成器 —— 领域类型
 *
 * 只放类型与纯数据形状；任何 I/O（读模板、读设备库、写文件）都在调用方。
 * 这样同一份 domain 既能跑在浏览器（Vite），也能被 Node 门禁直接 import
 * （见 scripts/ts-loader.mjs：Node 原生 type-stripping + 无扩展名 resolve hook）。
 */
import type { Camera, Lens } from "../../fov/domain/types";

/** 与源报告对应：某一行末尾是否追加红色「(新增)」 */
export type NewFlag = "camera" | "lens" | "light1" | "light2" | "items";

/** 人工覆盖值：设备库里查不到、或与库值不一致时，以报告实测为准 */
export type MeasuredOverrides = {
  fps?: number;
  magnification?: number;
  fovWidthMm?: number;
  fovHeightMm?: number;
  resolutionMmPerPixel?: number;
  dofNominalMm?: number;
  lensResolutionMmPerPixel?: number;
};

/**
 * 影像页版式。源报告 7 页影像页实际分两类：
 *   plain   普通页：多张图 + 每图一个红圈 + 顶部「名称 + 3 行说明」（slide5/6/7/9/10）
 *   special 特殊页：单张大图 + 「名称（…-特殊）+ 2 行说明」+ 一个 ↓（slide8/11）
 * 两种壳的骨架不同（说明框宽度、有无 ↓），所以模板里保留两份壳。
 */
export type ImagePageKind = "plain" | "special";

/** 页面坐标系（pt，720×540，4:3）里的一个矩形 */
export type Box = { xPt: number; yPt: number; wPt: number; hPt: number };

/**
 * 红圈。坐标是**相对所属图片自身**的归一化框（0..1），
 * 所以之后重排图片（自动摆放或手拖）时圈跟着图走，不需要重算。
 */
export type CircleMark = {
  /** 稳定标识，UI 删圈时用；不参与呈现 */
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * 一张**已经降采样过**的上传图。
 *
 * `dataUrl` 是浏览器上传时就转好的 JPEG（见 image-io.ts）——domain 只把它当字节来源，
 * 不做像素处理，所以 Node 门禁能跑同一份代码。
 * 原始文件不入模型：现场手机拍的图动辄 5–10MB，留着会把内存和产物一起撑爆。
 */
export type UploadedImage = {
  /** 稳定标识，UI 增删图时用；不参与呈现 */
  id: string;
  /** 原始文件名，写进 `<p:cNvPr descr>`，出问题能对上号 */
  name: string;
  /** 降采样后的 dataURL（image/jpeg） */
  dataUrl: string;
  /** 降采样后的像素尺寸，自动摆放按这个算宽高比 */
  pxW: number;
  pxH: number;
};

/** 一张图 + 它在页面上的位置（影像页用） */
export type ImageSlot = UploadedImage & {
  /** 手动拖过之后的位置；缺省 = 跟随本页自动摆放 */
  box?: Box;
  /** 图上的红圈 */
  circles: CircleMark[];
};


export type ImagePage = {
  /** 稳定标识，UI 增删页时用；不参与呈现 */
  id: string;
  kind: ImagePageKind;
  /**
   * 页内「名称」行（影像页骨架里那个文本框的第 1 段），如「打光影像-破損」「打光影像-毛邊-特殊」。
   * 注意与标题条不同：特殊页的标题条仍是基础缺陷名（源报告 slide8 的条子写「3.打光影像-破損」，
   * 而名称行写「打光影像-破損-特殊」）。
   */
  caption: string;
  /** 「说明」行（第 2 段起，一行一段）；空数组 = 该页不写说明 */
  desc: string[];
  /**
   * 本页的图片。用户 2026-09-29 定的口径：**默认自动摆放，拖拽只是微调**。
   * 缺省 / 空数组 = 这一页暂时没有图（骨架照出，只是没有图）。
   */
  slots?: ImageSlot[];
  /**
   * 是否还在「自动摆放」。拖过任何一张图就置 false（并把当时的坐标固化到各 slot.box），
   * 免得后续加删图时已经摆好的位置又跳。点「重新自动摆放」置回 true。
   */
  autoLayout?: boolean;
};

/** 一个缺陷分组，如「破損」；组内页数 = 这个缺陷要几页影像 */
export type ImageGroup = {
  /** 稳定标识 */
  id: string;
  /** 缺陷名，决定标题条文字：`3.打光影像-{defect}` */
  defect: string;
  pages: ImagePage[];
};

export type StationSpec = {
  /** 稳定标识，UI 增删工站时用；不参与呈现 */
  id: string;
  /** 标题条文字，如「2.硬體設定-CCD1」「2.硬體設定-CCD2（替換鐳射工站）」 */
  header: string;
  cameraModel: string;
  lensModel: string;
  lightSource1: string;
  lightSource2: string;
  inspectionItems: string[];
  newFlags: NewFlag[];
  /** 光路图上的 4 个尺寸标注 */
  marks: { mark228: string | number; mark100: string | number; mark80: string | number; mark30_100: string | number };
  measured: MeasuredOverrides;
  /** DOF 折减因子：报告口径 = 标称 DOF × 该值（本厂通用 0.4） */
  dofDerateFactor?: number;
  /**
   * 本工站后面的打光影像段（用户 2026-09-29 定的「工站 → 缺陷 两层」）。
   * 缺省 = 这个工站没有影像页（影像壳会被整页删掉，不留空壳页）。
   */
  imageGroups?: ImageGroup[];

  /* ---- 需求推导那 4 行的逐站参数（用户 2026-09-30 定：不能全报告一份） ----
   * 实测依据：源报告 CCD1 公差帶 0.1mm + 遠心頭、CCD2 0.15mm + 液態變焦鏡頭、
   * CCD4「檢測範圍：一次量測2pcs產品」+ CCTV鏡頭 —— 同一份报告里逐站都不同。
   */

  /**
   * 需求推导块的**前置行**（自由文本，一行），如「最大值徑53.3mm，最大厚度6.7mm」。
   * 为什么是自由文本而不是「外径 / 厚度」两个数字：用户 2026-09-30 定
   * 「产品需求不一定是外径和内径」—— 这一行每份报告写的都不一样，工具不做字段体系。
   * 留空 = 不生成这一行。
   */
  requireLead?: string;
  /**
   * 本工站的最小公差。**本单位换算成「公差带」去算理想系統解析度**。
   * `toleranceStyle` 决定行文（源报告两种写法都出现过）：
   *   `"pm"`   → `最小公差±0.08mm，公差帶=0.16`（密封圈族；数值是 ± 值，带宽 = 2×）
   *   `"band"` → `最小公差帶 0.1mm`（四合一族；数值就是带宽）
   * 留空 = 不自动生成公差行与解析度行（改用 `requireOverride` 手写）。
   */
  toleranceMm?: number | null;
  toleranceStyle?: "pm" | "band";
  /** 公差行后面的补充，如「一次檢測1pcs，伺服控制相機左右移動拍兩次」 */
  inspectNote?: string;
  /** 镜头类型，写进「選用…」那句：遠心鏡頭 / 液態變焦鏡頭 / CCTV鏡頭。留空按「遠心鏡頭」 */
  lensKind?: string;
  /**
   * 这台相机是彩色还是黑白（写进「選用…」那句）。
   * 为什么不是从设备库读：`Camera` 类型里**没有颜色字段**（实测 src/fov/domain/types.ts），
   * 靠型号名猜会偶发猜错，所以做成工站级选择。缺省 = 彩色。
   */
  colorCamera?: boolean;
  /**
   * 整块覆盖需求推导（一行一段）。填了就**完全不自动生成** ——
   * 参考报告里这句话的写法超出任何模板（CCD4 只写「檢測範圍：一次量測2pcs產品」），
   * 自动逻辑只负责最常见的那种，其余靠手工。留空 / 空数组 = 走自动。
   */
  requireOverride?: string[];
};

/**
 * 【1.檢測需求】页的内容 —— 用户 2026-09-30 定的口径：
 * **「一张图（品保发的需求表），或者手打项目名称」**。
 *
 * 所以这里没有「最大外径 / 最大厚度 / 相机像素」这类字段：
 * 需求不一定是尺寸，公共条件（如公差）也是**手打文字**，工具不建字段体系。
 * 相机像素属于工站（按型号识别），不属于需求。
 */
export type RequirementSpec = {
  /** 顶部文字，一行一段。如「檢測項目：SMT TP,框口TPY、彈片高度,DC」「密封圈內徑/厚度」 */
  lines: string[];
  /** 可选：品保发的需求表截图 / 产品照片。等比适配到族的 `requireImageBox`，不裁切 */
  image?: UploadedImage | null;
};

export type ReportModel = {
  /** 用的哪族模板（`templates.ts` 的 id）。缺省 = 默认族 */
  templateId?: string;
  /** 封面两行：第一行项目名，第二行固定为「評估報告」 */
  cover: [string, string];
  requirement: RequirementSpec;
  /** 至少 1 个；第 1 个用工站页模板本身，其余克隆 */
  stations: StationSpec[];
};

export type DeviceData = { cameras: Camera[]; lenses: Lens[] };

export type GenerateOptions = {
  /**
   * 覆盖模板壳映射（默认取 `model.templateId` 对应那一族的 layout）。
   * 只在门禁里做负向实验时用得到 —— 正常生成不要传。
   */
  layout?: Record<string, string>;
  onMissing?: (key: string) => void;
};

export type GenerateResult = {
  /** 用 uint8array 而不是 Buffer：浏览器与 Node 同一份代码 */
  bytes: Uint8Array;
  /** 实际用到的模板族 id */
  templateId: string;
  used: string[];
  missing: string[];
  /** 最终页数 */
  pages: number;
  /** 各工站落在哪个 part 上，便于门禁与排障 */
  stationParts: string[];
  /** 各影像页落在哪个 part 上（按最终页序），P2b 往里塞图片时要用 */
  imageParts: string[];
  /** 这次写进包里的图片部件（`ppt/media/imageN.*`），排障与门禁用 */
  mediaParts: string[];
  /** 最终显示页序（part 名），与 ppt/presentation.xml 的 sldIdLst 一致 */
  pageOrder: string[];
  /** 这次生成用不到的壳（已从包里删掉） */
  droppedShells: string[];
  warnings: string[];
};
