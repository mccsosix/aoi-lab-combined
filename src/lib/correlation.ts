import ExcelJS from 'exceljs';
import { injectCharts, type ChartDef } from './chart-injector';

function colLetter(n: number): string {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

const FONT: Partial<ExcelJS.Font> = { name: '等线', size: 11 };
const CA: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };
const COLS_PER_PROD = 6;
const HEADER_HEX = 'FFD9D9D9';

export interface CorrelationConfig {
  productCount: number;
  seatingCount: number;
  angles: string[];
  dataRows: number;
  gapUpper: number;
  gapLower: number;
  includeR2: boolean;
  includeChart: boolean;
}

export async function generateCorrelation(
  c: CorrelationConfig,
  onProgress?: (cur: number, total: number, name: string) => void,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const total = c.angles.length * c.seatingCount;
  let idx = 0;
  const chartRefs: ChartDef[] = [];

  for (const angle of c.angles) {
    for (let s = 1; s <= c.seatingCount; s++) {
      let name = `${angle}乘坐${s}`;
      if (name.length > 31) name = `${angle}坐${s}`;
      createCorrSheet(wb, name, c, chartRefs);
      if (onProgress) onProgress(++idx, total, name);
    }
  }

  const buffer = await wb.xlsx.writeBuffer();

  // Inject charts if requested
  if (c.includeChart && chartRefs.length > 0) {
    try {
      return await injectCharts(buffer, chartRefs);
    } catch (_) {
      // Fallback: return buffer without charts
    }
  }

  return buffer;
}

function createCorrSheet(wb: ExcelJS.Workbook, name: string, c: CorrelationConfig, chartRefs: ChartDef[]) {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: 'FF00B050' } },
  });

  ws.getColumn(1).width = 2;
  for (let pi = 0; pi < c.productCount; pi++) {
    const off = 2 + pi * COLS_PER_PROD;
    for (let j = 0; j < 5; j++) ws.getColumn(off + j).width = 10;
  }

  const gapCols: string[] = [];

  for (let pi = 0; pi < c.productCount; pi++) {
    const off = 2 + pi * COLS_PER_PROD;
    const qv = off + 1;
    const ccd = off + 2;
    const cp = off + 3;
    const gap = off + 4;
    const num = pi + 1;

    const L0 = colLetter(off), L4 = colLetter(gap);
    ws.mergeCells(`${L0}2:${L4}4`);
    const titleCell = ws.getCell(2, off);
    titleCell.value = `${num}#`;
    titleCell.font = { name: '等线', size: 12, bold: true };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_HEX } };
    titleCell.alignment = CA;

    const headers = ['offset', 'QV', 'CCD', 'CCD+', 'GAP'];
    for (let j = 0; j < 5; j++) {
      const cell = ws.getCell(5, off + j);
      cell.value = headers[j];
      cell.font = FONT;
      cell.alignment = CA;
    }

    const ds = 6, de = 5 + c.dataRows;
    for (let rr = ds; rr <= de; rr++) {
      ws.getCell(rr, 1).value = rr - ds + 1;
      for (const col of [off, qv, ccd]) {
        ws.getCell(rr, col).font = FONT;
        ws.getCell(rr, col).alignment = CA;
      }
      ws.getCell(rr, cp).value = { formula: `=${colLetter(ccd)}${rr}+${colLetter(off)}${rr}` };
      ws.getCell(rr, cp).font = FONT;
      ws.getCell(rr, cp).alignment = CA;
      ws.getCell(rr, gap).value = { formula: `=${colLetter(cp)}${rr}-${colLetter(qv)}${rr}` };
      ws.getCell(rr, gap).font = FONT;
      ws.getCell(rr, gap).alignment = CA;
      gapCols.push(`${colLetter(gap)}${rr}`);
    }

    const refRow = de + 1;
    ws.getCell(refRow, cp).value = 0;
    ws.getCell(refRow, cp).font = FONT;
    ws.getCell(refRow, cp).alignment = CA;
    ws.getCell(refRow, gap).value = 0;
    ws.getCell(refRow, gap).font = FONT;
    ws.getCell(refRow, gap).alignment = CA;

    if (c.includeR2) {
      const r2Row = de + 2;
      const qvRange = `${colLetter(qv)}${ds}:${colLetter(qv)}${de}`;
      const cpRange = `${colLetter(cp)}${ds}:${colLetter(cp)}${de}`;
      ws.getCell(r2Row, gap).value = { formula: `=CORREL(${qvRange},${cpRange})^2` };
      ws.getCell(r2Row, gap).font = FONT;
      ws.getCell(r2Row, gap).alignment = CA;
      ws.getCell(r2Row, gap).numFmt = '0.0000';
    }

    if (c.includeChart) {
      chartRefs.push({
        sheetName: name,
        chartTitle: `${num}# QV vs CCD+`,
        qvRange: `${name}!${colLetter(qv)}${ds}:${colLetter(qv)}${de}`,
        cpRange: `${name}!${colLetter(cp)}${ds}:${colLetter(cp)}${de}`,
        catRange: `${name}!A${ds}:A${de}`,
      });
    }
  }

  if (gapCols.length) {
    for (const ref of gapCols) {
      ws.addConditionalFormatting({
        ref,
        rules: [
          {
            type: 'cellIs', operator: 'greaterThan', formulae: [String(c.gapUpper)], priority: 1,
            style: {
              fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6B0B0' } },
              font: { color: { argb: 'FFFF0000' }, name: '等线', size: 11 },
            },
          },
          {
            type: 'cellIs', operator: 'lessThan', formulae: [String(c.gapLower)], priority: 2,
            style: {
              fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6B0B0' } },
              font: { color: { argb: 'FFFF0000' }, name: '等线', size: 11 },
            },
          },
        ],
      });
    }
  }

  return ws;
}
