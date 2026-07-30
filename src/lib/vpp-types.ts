/**
 * VPP 解析器类型定义
 * 对应 VPP-自动识别检测项目-算法与实现交接.md 中的数据结构
 */

/** 字段级置信度 */
export interface FieldConfidence {
  /** 0-1 之间的置信度分数 */
  value: number;
  /** 值的来源说明 */
  source: string;
}

/** 单个检测项目的识别结果 */
export interface VppDetectionItem {
  /** 唯一标识 */
  id: string;
  /** 默认是否勾选 */
  selected: boolean;
  /** 项目名称 (来自 OutputItem[0]) */
  name: string;
  /** 名称置信度 */
  nameConfidence: FieldConfidence;
  /** 点数 (null = 无法确定) */
  points: number | null;
  /** 点数置信度 */
  pointsConfidence: FieldConfidence;
  /** 规格上限 */
  upper?: number;
  /** 规格中心值 */
  nominal?: number;
  /** 规格下限 */
  lower?: number;
  /** 上公差 (upper - nominal) */
  upperTolerance?: number;
  /** 下公差 (nominal - lower) */
  lowerTolerance?: number;
  /** 公差模式: symmetric | asymmetric */
  toleranceMode?: 'symmetric' | 'asymmetric';
  /** 公差显示文本 */
  toleranceDisplay?: string;
  /** @deprecated 使用 upperTolerance/lowerTolerance/toleranceDisplay */
  tolerance?: number | null;
  /** 公差置信度 */
  toleranceConfidence: FieldConfidence;
  /** 评分 (0-100+) */
  score: number;
  /** 评分原因 */
  scoreReasons: string[];
  /** 来源数据路径 */
  sources: string[];
  /** 警告信息 */
  warnings: string[];
  /** 所属 ToolBlock 路径 */
  blockPath: string;
}

/** 被忽略的项目 */
export interface VppIgnoredItem {
  name: string;
  blockPath: string;
  reason: string;
  toolTypes: string[];
}

/** VPP 解析结果 */
export interface VppAnalysisResult {
  /** 解析器类型 */
  parser: 'visionpro' | 'static-nrbf';
  /** VPP 版本 */
  vppVersion: string;
  /** 程序集版本 */
  assemblyVersion: string;
  /** 警告信息 */
  warnings: string[];
  /** 检测到的测量项目 */
  items: VppDetectionItem[];
  /** 被忽略的项目 */
  ignoredItems: VppIgnoredItem[];
  /** 原始工具树 (备用扫描) */
  toolTree?: VppToolNode[];
}

/** 工具树节点 */
export interface VppToolNode {
  path: string;
  blockName: string;
  toolTypes: string[];
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  children: VppToolNode[];
}

/** 导入模式 */
export type ImportMode = 'append' | 'replace' | 'skip-existing';

/** VPP 导入配置 */
export interface VppImportConfig {
  mode: ImportMode;
  /** 用户编辑后的项目列表 */
  items: VppDetectionItem[];
}
