import ExcelJS from 'exceljs';
import type { MeasurementProject } from '../types';

function colLetter(n: number): string {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

const FONT: Partial<ExcelJS.Font> = { name: '等线', size: 11 };
const CA: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };
const RA: Partial<ExcelJS.Alignment> = { horizontal: 'right', vertical: 'middle' };

export interface RepeatabilityConfig {
  productCount: number;
  seatingCount: number;
  angles: string[];
  projects: MeasurementProject[];
  dataRows: number;
}

export async function generateRepeatability(
  c: RepeatabilityConfig,
  onProgress?: (cur: number, total: number, name: string) => void,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const total = c.angles.length * c.seatingCount;
  let idx = 0;

  for (const angle of c.angles) {
    for (let s = 1; s <= c.seatingCount; s++) {
      let name = `${angle}乘坐${s}`;
      if (name.length > 31) name = `${angle}坐${s}`;
      createRepeatSheet(wb, name, c.productCount, c.projects, c.dataRows);
      if (onProgress) onProgress(++idx, total, name);
    }
  }

  return await wb.xlsx.writeBuffer();
}

function createRepeatSheet(
  wb: ExcelJS.Workbook, name: string,
  productCount: number, projects: MeasurementProject[], dataRows: number,
) {
  const ws = wb.addWorksheet(name);
  const B = 7 + dataRows;
  ws.getColumn(1).width = 9;

  const colMap: { start: number; end: number; project: MeasurementProject }[] = [];
  let cur = 2;
  for (const p of projects) {
    const start = cur;
    const end = cur + p.pointCount - 1;
    colMap.push({ start, end, project: p });
    for (let c = start; c <= end; c++) ws.getColumn(c).width = 12;
    cur += p.pointCount;
  }
  const maxCol = cur - 1;

  function sc(r: number, c: number, font?: Partial<ExcelJS.Font>, align?: Partial<ExcelJS.Alignment>, fill?: string, numFmt?: string) {
    const cell = ws.getCell(r, c);
    if (font) cell.font = font;
    if (align) cell.alignment = align;
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    if (numFmt) cell.numFmt = numFmt;
    return cell;
  }

  for (let pi = 0; pi < productCount; pi++) {
    const base = pi * B + 1;

    sc(base, 1, FONT, CA).value = `产品${pi + 1}`;
    for (const cm of colMap) {
      if (cm.start < cm.end) ws.mergeCells(`${colLetter(cm.start)}${base}:${colLetter(cm.end)}${base}`);
      sc(base, cm.start, FONT, CA, 'FF' + cm.project.color.replace('#', '')).value = cm.project.name;
    }

    const r2 = base + 1;
    for (const cm of colMap) {
      for (let m = 0; m < cm.project.pointCount; m++) {
        sc(r2, cm.start + m, FONT, CA).value = m + 1;
      }
    }

    const ds = base + 2, de = ds + dataRows - 1;
    for (let i = 0; i < dataRows; i++) {
      const rr = ds + i;
      sc(rr, 1, FONT, CA).value = i + 1;
      for (let col = 2; col <= maxCol; col++) sc(rr, col, FONT, CA);
    }

    const mx = base + 2 + dataRows;
    const mn = base + 3 + dataRows;
    const gp = base + 4 + dataRows;
    const s6 = base + 5 + dataRows;

    function statRow(r: number, label: string) {
      sc(r, 1, FONT, RA).value = label;
      for (const cm of colMap) {
        for (let m = 0; m < cm.project.pointCount; m++) {
          const col = cm.start + m;
          const L = colLetter(col);
          let formula: string;
          switch (label) {
            case 'MAX': formula = `=MAX(${L}${ds}:${L}${de})`; break;
            case 'MIN': formula = `=MIN(${L}${ds}:${L}${de})`; break;
            case 'GAP': formula = `=${L}${mx}-${L}${mn}`; break;
            default: formula = '';
          }
          ws.getCell(r, col).value = { formula };
        }
      }
    }

    statRow(mx, 'MAX');
    statRow(mn, 'MIN');
    statRow(gp, 'GAP');

    sc(s6, 1, FONT, RA).value = '6sigma';
    for (const cm of colMap) {
      for (let m = 0; m < cm.project.pointCount; m++) {
        const col = cm.start + m;
        const L = colLetter(col);
        sc(s6, col, FONT, CA, undefined, '0.00%');
        ws.getCell(s6, col).value = { formula: `=6*STDEV(${L}${ds}:${L}${de})/${cm.project.tolerance}` };
      }
    }

    for (const cm of colMap) {
      for (let m = 0; m < cm.project.pointCount; m++) {
        const ref = `${colLetter(cm.start + m)}${s6}`;
        ws.addConditionalFormatting({
          ref,
          rules: [{
            type: 'cellIs', operator: 'greaterThan', formulae: ['0.2'], priority: 1,
            style: {
              fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6B0B0' } },
              font: { color: { argb: 'FFFF0000' }, name: '等线', size: 11 },
            },
          }],
        });
      }
    }
  }
  return ws;
}
