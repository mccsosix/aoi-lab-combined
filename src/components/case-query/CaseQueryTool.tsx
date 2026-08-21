import { useState, useCallback, useMemo, useRef } from 'react';
import type { ParsedData, CaseGroup, CaseStatus } from '../../types';
import { parseExcelFile, getPersonCasesGrouped, STATUS_LABELS } from '../../lib/parser';
import { CloseIcon } from '../Icons';

interface Props {
  onClose: () => void;
  showClose?: boolean;
}

// 小组成员：置顶显示并高亮，方便快速查询。
const TEAM_MEMBERS = ['黄卓平', '张琳馨', '莫海凌', '张柳庆', '罗颖华'];
const STATUS_ORDER: CaseStatus[] = ['overdue', 'in_transit', 'pending', 'arrived', 'cancelled'];

export default function CaseQueryTool({ onClose, showClose = true }: Props) {
  const [data, setData] = useState<ParsedData | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<CaseStatus | null>(null);
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set());
  const [caseSearch, setCaseSearch] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [showAllPeople, setShowAllPeople] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  const today = useMemo(() => new Date(), []);

  const visiblePeople = useMemo(() => {
    if (!data) return [];
    if (personSearch.trim()) {
      return data.people.filter(p => p.toLowerCase().includes(personSearch.toLowerCase()));
    }
    const team = data.people.filter(p => TEAM_MEMBERS.includes(p));
    const others = data.people.filter(p => !TEAM_MEMBERS.includes(p));
    return showAllPeople ? [...team, ...others] : [...team, ...others.slice(0, 5)];
  }, [data, personSearch, showAllPeople]);

  const cases = useMemo(() => {
    if (!data || !selectedPerson) return [];
    return getPersonCasesGrouped(data.records, selectedPerson, data.people, today);
  }, [data, selectedPerson, today]);

  // 全量人员 × 案件分组：不选人员、直接按案号/关键词搜索时，跨所有人员查询。
  const allCasesByPerson = useMemo(() => {
    if (!data) return [];
    return data.people.map(person => ({
      person,
      groups: getPersonCasesGrouped(data.records, person, data.people, today),
    }));
  }, [data, today]);

  // 结果行：默认限定在选中人员；未选人员时按输入的关键词搜索全部人员。
  const resultRows = useMemo(() => {
    const q = caseSearch.trim().toLowerCase();
    const sources = selectedPerson
      ? [{ person: selectedPerson, groups: cases }]
      : allCasesByPerson;
    const rows: { person: string; group: CaseGroup }[] = [];
    for (const { person, groups } of sources) {
      for (const group of groups) {
        if (filterStatus && group.worstStatus !== filterStatus) continue;
        if (q && !(group.caseNumber.toLowerCase().includes(q) || group.caseName.toLowerCase().includes(q))) continue;
        rows.push({ person, group });
      }
    }
    return rows;
  }, [selectedPerson, cases, allCasesByPerson, filterStatus, caseSearch]);

  const statusCounts = useMemo(() => {
    const counts: Record<CaseStatus, number> = { arrived: 0, in_transit: 0, overdue: 0, pending: 0, cancelled: 0 };
    for (const { group } of resultRows) counts[group.worstStatus]++;
    return counts;
  }, [resultRows]);

  const totalItems = useMemo(() => resultRows.reduce((s, r) => s + r.group.totalItems, 0), [resultRows]);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true); setUploadError(null); setError(null); setSelectedPerson(null);
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.records.length === 0) { setUploadError('文件中没有可解析的记录'); return; }
      if (parsed.people.length === 0) { setUploadError('未检测到人员信息，请检查「采购单原由」列'); return; }
      setData(parsed);
    } catch (e) {
      setUploadError(`解析失败：${e instanceof Error ? e.message : '未知错误'}`);
    } finally { setLoading(false); }
  }, []);

  const toggleCase = useCallback((caseNumber: string) => {
    setExpandedCases(prev => {
      const next = new Set(prev);
      if (next.has(caseNumber)) next.delete(caseNumber); else next.add(caseNumber);
      return next;
    });
  }, []);

  const clearPerson = useCallback(() => {
    setSelectedPerson(null);
    setFilterStatus(null);
    setCaseSearch('');
  }, []);

  const resetFile = useCallback(() => { setData(null); setSelectedPerson(null); setUploadError(null); setError(null); }, []);

  const selectPerson = useCallback((name: string) => {
    setSelectedPerson(name);
    setFilterStatus(null);
    setCaseSearch('');
  }, []);

  return (
    <div className="tool-panel" role="region" aria-label="案子物件查询">
      <div className="tool-panel-header">
        <h2>01 案子物件查询</h2>
        {showClose && <button className="tool-panel-close" onClick={onClose} aria-label="关闭工具面板"><CloseIcon /></button>}
      </div>

      {/* Top Grid */}
      <div className="cq-topgrid" style={{ marginBottom: 4 }}>
        {/* File Info Panel */}
        {data ? (
          <div className="cq-panel cq-filepanel">
            <div className="cq-fileicon" aria-hidden="true">▦</div>
            <div>
              <h3 style={{ fontSize: '1.05rem' }}>已载入数据文件</h3>
              <p className="cq-filename">{data.fileName}</p>
              <p className="cq-meta">{data.records.length} 条记录</p>
              <span className="cq-validation">● 格式校验通过</span>
            </div>
            <button className="panel-btn panel-btn-sm cq-reupload-btn" onClick={resetFile} style={{ alignSelf: 'start' }}>重新上传</button>
            <p className="cq-privacy"><b>◉</b> 数据仅在本地解析，不会上传服务器</p>
          </div>
        ) : (
          <div className={`cq-upload-empty show`}>
            <label className="cq-drop-label" htmlFor="cqFileInput">
              选择标准周报
            </label>
            <input
              ref={fileInputRef}
              id="cqFileInput"
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <p>也可以将 .xlsx / .xls 文件拖放到这里</p>
            {loading && <p style={{ color: 'var(--cyan)', fontWeight: 600, marginTop: 8 }}>解析中...</p>}
            {uploadError && <p style={{ color: 'var(--orange)', fontWeight: 800, marginTop: 8, fontSize: '.82rem' }}>{uploadError}</p>}
          </div>
        )}

        {/* Rules Panel */}
        <aside className="cq-panel cq-rules">
          <span className="cq-important">重要</span>
          <div className="cq-ruleicon" aria-hidden="true">▦✓</div>
          <h3 style={{ color: 'var(--orange)', marginTop: 0 }}>上传前请确认</h3>
          <strong>仅支持公司每周六发布的标准报表</strong>
          <ul>
            <li>文件格式：.xlsx / .xls</li>
            <li>表头与列名不可修改</li>
            <li>请勿上传个人整理版</li>
          </ul>
        </aside>
      </div>

      {/* Data errors */}
      {data && data.errors.length > 0 && (
        <p style={{ color: 'var(--orange)', fontSize: '.82rem', margin: '0 0 8px', fontWeight: 700 }}>
          ⚠ {data.errors.join('；')}
        </p>
      )}
      {error && (
        <p style={{ color: 'var(--orange)', fontSize: '.82rem', margin: '0 0 8px', fontWeight: 700 }}>{error}</p>
      )}

      {/* Section 02: Query */}
      {data && (
        <section className="cq-section">
          <div className="cq-sectionhead">
            <span className="cq-num">02</span>
            <h3>查询条件</h3>
          </div>
          <div className="cq-controls">
            <div className="cq-field">
              <label htmlFor="cqPersonSearch">选择人员</label>
              <div className="cq-selectbox">
                {selectedPerson && (
                  <span className="cq-selected">{selectedPerson} <button onClick={clearPerson} style={{ background: 'none', border: 'none', marginLeft: 4, fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: 0, lineHeight: 1 }} aria-label={`清除${selectedPerson}`}>×</button></span>
                )}
                <input
                  id="cqPersonSearch"
                  placeholder="搜索人员"
                  value={personSearch}
                  onChange={e => setPersonSearch(e.target.value)}
                />
                <button className="cq-iconbtn" aria-label="搜索人员">⌕</button>
              </div>
              <div className="cq-recent">
                <span>人员列表</span>
                {visiblePeople.map(name => (
                  <button
                    key={name}
                    data-person={name}
                    className={TEAM_MEMBERS.includes(name) ? 'cq-team' : undefined}
                    onClick={() => selectPerson(name)}
                  >
                    {name}
                  </button>
                ))}
                {data.people.length > TEAM_MEMBERS.length + 5 && !personSearch && !showAllPeople && (
                  <button className="more" onClick={() => setShowAllPeople(true)}>
                    展开全部 {data.people.length} 人
                  </button>
                )}
              </div>
            </div>
            <div className="cq-field">
              <label htmlFor="cqCaseSearch">搜索案号或案名</label>
              <div className="cq-searchbox">
                <input
                  id="cqCaseSearch"
                  placeholder="输入案号或案名关键词"
                  value={caseSearch}
                  onChange={e => setCaseSearch(e.target.value)}
                />
                <button className="cq-iconbtn" aria-label="搜索案件">⌕</button>
              </div>
            </div>
            <button
              className="cq-query-btn"
              disabled={!selectedPerson && !caseSearch.trim()}
              onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              开始查询
            </button>
          </div>
        </section>
      )}

      {/* Section 03: Results */}
      {(selectedPerson || caseSearch.trim()) && (
        <section className="cq-section" ref={resultsRef}>
          <div className="cq-sectionhead">
            <span className="cq-num">03</span>
            <h3>查询结果</h3>
            <span className="cq-summary">
              {caseSearch.trim()
                ? `搜索“${caseSearch.trim()}” · ${resultRows.length} 个案子 · ${totalItems} 件物品`
                : `${selectedPerson} · ${resultRows.length} 个案子 · ${totalItems} 件物品`}
            </span>
          </div>

          {/* Filters */}
          <div className="cq-filters">
            <button
              className={`cq-filter ${!filterStatus ? 'active' : ''}`}
              onClick={() => setFilterStatus(null)}
            >
              全部　{resultRows.length}
            </button>
            {STATUS_ORDER.map(s => (
              <button
                key={s}
                className={`cq-filter ${filterStatus === s ? 'active' : ''}`}
                onClick={() => setFilterStatus(filterStatus === s ? null : s)}
                disabled={statusCounts[s] === 0}
              >
                {STATUS_LABELS[s]}　{statusCounts[s]}
              </button>
            ))}
          </div>

          {/* Case Cards */}
          {resultRows.length === 0 ? (
            <div className="cq-empty">无匹配记录</div>
          ) : (
            <div className="cq-cases">
              {resultRows.map(({ person, group: c }) => (
                <article
                  key={`${person}-${c.caseNumber}`}
                  className={`cq-case-card ${expandedCases.has(c.caseNumber) ? 'open' : ''}`}
                  data-status={c.worstStatus}
                >
                  <div className="cq-case-top" onClick={() => toggleCase(c.caseNumber)}>
                    <span className="cq-case-status">{STATUS_LABELS[c.worstStatus]}</span>
                    <div>
                      <div className="cq-case-title">{c.caseName}</div>
                      <div className="cq-case-meta">{person}　·　{c.caseNumber}　·　{c.totalItems} 件物品</div>
                    </div>
                    <button className="cq-toggle" aria-label={expandedCases.has(c.caseNumber) ? '收起案件' : '展开案件'}>
                      {expandedCases.has(c.caseNumber) ? '⌃' : '⌄'}
                    </button>
                  </div>
                  <div className="cq-case-details">
                    <table>
                      <thead>
                        <tr>
                          <th>物件名称</th><th>规格</th><th>数量</th><th>当前状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.items.map((item, i) => (
                          <tr key={i}>
                            <td>{String(item.record.data['品名'] ?? '-')}</td>
                            <td>{String(item.record.data['规格'] ?? '-')}</td>
                            <td>{String(item.record.data['数量'] ?? '')}{String(item.record.data['单位'] ?? '')}</td>
                            <td className={item.status === 'overdue' ? 'cq-bad' : ''}>
                              {STATUS_LABELS[item.status]}
                              {item.daysRemaining !== null && (
                                <span style={{ marginLeft: 4, fontWeight: 400, fontSize: '.72rem', color: item.status === 'overdue' ? 'var(--orange)' : '#65808d' }}>
                                  {item.daysRemaining > 0 ? `还有${item.daysRemaining}天` : item.daysRemaining === 0 ? '' : `已逾期${Math.abs(item.daysRemaining)}天`}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
