export interface DataRecord {
  id: number;
  data: Record<string, string | number>;
  _searchText: string;
}

export interface ParsedData {
  headers: string[];
  records: DataRecord[];
  fileName: string;
  people: string[];
  errors: string[];
}

export type CaseStatus = 'arrived' | 'in_transit' | 'overdue' | 'pending' | 'cancelled';

export interface ItemStatus {
  record: DataRecord;
  status: CaseStatus;
  daysRemaining: number | null;
  estimatedDate: string | null;
}

export interface CaseGroup {
  caseNumber: string;
  caseName: string;
  items: ItemStatus[];
  worstStatus: CaseStatus;
  totalItems: number;
}

export interface MeasurementProject {
  name: string;
  pointCount: number;
  color: string;
  tolerance: number;
}

export type ToolId = 'case-query' | 'sheet-generator' | 'fov' | 'repeatability' | null;
