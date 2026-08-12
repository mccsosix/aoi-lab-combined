import * as XLSX from 'xlsx';
import type { DataRecord, ParsedData, CaseStatus, ItemStatus, CaseGroup } from '../types';
import { toSimplified } from './utils';

function parseSheet(ws: XLSX.WorkSheet): { headers: string[]; records: DataRecord[] } {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const data: (string | number | null)[][] = [];

  for (let r = 0; r <= range.e.r; r++) {
    const row: (string | number | null)[] = [];
    for (let c = 0; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) {
        row.push(cell.w !== undefined ? String(cell.w) : cell.v);
      } else {
        row.push(null);
      }
    }
    data.push(row);
  }

  const headerRow = data[0];
  const headers = headerRow.map((h) => (h ? toSimplified(String(h).trim()) : '')).filter((h) => h !== '');

  const colMap = new Map<number, string>();
  for (let c = 0; c < headerRow.length; c++) {
    const h = headerRow[c] ? toSimplified(String(headerRow[c]).trim()) : '';
    if (h) colMap.set(c, h);
  }

  const records: DataRecord[] = [];
  let id = 0;

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const fields: Record<string, string | number> = {};
    const textParts: string[] = [];

    for (const [c, header] of colMap) {
      const val = row[c];
      if (val === null || val === undefined || val === '') continue;
      if (typeof val === 'number') {
        fields[header] = val;
        textParts.push(String(val));
      } else {
        const str = toSimplified(String(val).trim());
        if (!str) continue;
        fields[header] = str;
        textParts.push(str);
      }
    }

    if (Object.keys(fields).length === 0) continue;
    const raw = textParts.join(' ');
    records.push({ id: id++, data: fields, _searchText: raw.toLowerCase() });
  }

  return { headers, records };
}

function extractPeople(records: DataRecord[]): string[] {
  const nameCount = new Map<string, string>();
  for (const r of records) {
    const reason = String(r.data['采购单原由'] ?? '');
    if (!reason) continue;
    const pairPattern = /([一-鿿]{2,3})\/([一-鿿]{2,3})/g;
    let match;
    while ((match = pairPattern.exec(reason)) !== null) {
      const n1 = toSimplified(match[1]);
      const n2 = toSimplified(match[2]);
      nameCount.set(n1, (nameCount.get(n1) || '') + n1);
      nameCount.set(n2, (nameCount.get(n2) || '') + n2);
    }
  }

  const denyList = new Set([
    '裁切机', '生产日', '组装标', '型模修', '机设计', '离子风',
    '亚马逊', '消除器', '纤模块', '单元',
  ]);

  const freq = new Map<string, number>();
  for (const [name] of nameCount) {
    if (denyList.has(name)) continue;
    let count = 0;
    for (const r of records) {
      if (String(r.data['采购单原由'] ?? '').includes(name)) count++;
    }
    freq.set(name, count);
  }

  return [...freq.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

export function extractDate(text: string): Date | null {
  if (!text) return null;
  const mdChinese = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (mdChinese) {
    const m = parseInt(mdChinese[1], 10);
    const d = parseInt(mdChinese[2], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return new Date(2026, m - 1, d);
    }
  }
  const mdSlash = text.match(/(\d{1,2})\/(\d{1,2})/);
  if (mdSlash) {
    const m = parseInt(mdSlash[1], 10);
    const d = parseInt(mdSlash[2], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return new Date(2026, m - 1, d);
    }
  }
  return null;
}

function isAccepted(record: DataRecord): boolean {
  return String(record.data['是否已验收'] ?? '') === 'Y';
}

function isCancelled(record: DataRecord): boolean {
  return String(record.data['是否已验收'] ?? '') === '取消';
}

function getStatus(record: DataRecord, today: Date): CaseStatus {
  if (isAccepted(record)) return 'arrived';
  if (isCancelled(record)) return 'cancelled';
  const dateText = String(record.data['预计交期'] ?? '');
  const date = extractDate(dateText);
  if (!date) return 'pending';
  return date < today ? 'overdue' : 'in_transit';
}

function getDaysRemaining(record: DataRecord, today: Date): number | null {
  const dateText = String(record.data['预计交期'] ?? '');
  const date = extractDate(dateText);
  if (!date) return null;
  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const STATUS_PRIORITY: Record<CaseStatus, number> = {
  overdue: 0, in_transit: 1, pending: 2, arrived: 3, cancelled: 4,
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  arrived: '已到', cancelled: '取消', pending: '待定',
  overdue: '逾期', in_transit: '在途',
};

const STATUS_CLASSES: Record<CaseStatus, string> = {
  arrived: 'status-arrived', cancelled: 'status-cancelled', pending: 'status-pending',
  overdue: 'status-overdue', in_transit: 'status-intransit',
};

function worstStatus(statuses: CaseStatus[]): CaseStatus {
  let worst: CaseStatus = 'cancelled';
  let worstPrio = 99;
  for (const s of statuses) {
    const p = STATUS_PRIORITY[s] ?? 99;
    if (p < worstPrio) { worstPrio = p; worst = s; }
  }
  return worst;
}

function extractCaseName(reason: string, personName: string, allPeople: string[]): string {
  let name = reason;
  name = name.replace(new RegExp(personName, 'g'), '');
  for (const p of allPeople) {
    if (p !== personName) name = name.replace(new RegExp(p, 'g'), '');
  }
  name = name
    .replace(/^[A-Za-z0-9]+[-]?/, '')
    .replace(/[/／]+/g, '')
    .replace(/^[\s,，。．、]+/, '')
    .replace(/[\s,，。．、]+$/, '')
    .trim();
  return name || reason;
}

export function getPersonCasesGrouped(
  records: DataRecord[], personName: string, allPeople: string[], today: Date,
): CaseGroup[] {
  const caseMap = new Map<string, { items: ItemStatus[]; caseName: string }>();
  for (const r of records) {
    const reason = String(r.data['采购单原由'] ?? '');
    if (!reason.includes(personName)) continue;
    const caseNumber = String(r.data['请购单号'] ?? r.data['采购单号'] ?? '未知');
    const caseName = extractCaseName(reason, personName, allPeople);
    const status = getStatus(r, today);
    const daysRemaining = getDaysRemaining(r, today);
    const estimatedDate = String(r.data['预计交期'] ?? '');
    const item: ItemStatus = { record: r, status, daysRemaining, estimatedDate: estimatedDate || null };
    if (!caseMap.has(caseNumber)) caseMap.set(caseNumber, { items: [], caseName });
    caseMap.get(caseNumber)!.items.push(item);
  }

  const groups: CaseGroup[] = [];
  for (const [caseNumber, { items, caseName }] of caseMap) {
    groups.push({ caseNumber, caseName, items, worstStatus: worstStatus(items.map((i) => i.status)), totalItems: items.length });
  }

  groups.sort((a, b) => {
    const pa = STATUS_PRIORITY[a.worstStatus] ?? 99;
    const pb = STATUS_PRIORITY[b.worstStatus] ?? 99;
    if (pa !== pb) return pa - pb;
    return b.totalItems - a.totalItems;
  });

  return groups;
}

const REQUIRED_COLUMNS = [
  { keys: ['请购单号', '采购单号'], label: '请购单号/采购单号' },
  { keys: ['采购单原由'], label: '采购单原由' },
  { keys: ['预计交期'], label: '预计交期' },
  { keys: ['是否已验收'], label: '是否已验收' },
  { keys: ['品名'], label: '品名' },
];

export function parseExcelFile(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arr = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(arr, { type: 'array' });
        const allRecords: DataRecord[] = [];
        const allHeaders: string[] = [];
        const errors: string[] = [];

        for (const name of workbook.SheetNames) {
          const ws = workbook.Sheets[name];
          const { headers, records } = parseSheet(ws);
          if (workbook.SheetNames.length > 1) {
            for (const r of records) {
              r.data['_来源Sheet'] = toSimplified(name);
              r._searchText += ' ' + toSimplified(name).toLowerCase();
            }
          }
          allHeaders.push(...headers);
          allRecords.push(...records);
        }

        const uniqueHeaders = [...new Set(allHeaders)];
        for (const col of REQUIRED_COLUMNS) {
          const found = col.keys.some((k) => uniqueHeaders.includes(k));
          if (!found) errors.push(`缺少必要列「${col.label}」`);
        }

        const people = extractPeople(allRecords);

        resolve({ headers: uniqueHeaders, records: allRecords, fileName: file.name, people, errors });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

export { STATUS_LABELS, STATUS_CLASSES, STATUS_PRIORITY, getStatus, getDaysRemaining };
