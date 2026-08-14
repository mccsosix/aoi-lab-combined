import { useState, useCallback, useRef } from 'react';
import type { VppAnalysisResult, VppDetectionItem, ImportMode } from '../../lib/vpp-types';
import { parseVppBinary, mapToMeasurementProjects } from '../../lib/vpp-parser';

interface Props {
  onImport: (projects: Array<{ name: string; pointCount: number; color: string; tolerance: number }>, mode: ImportMode) => void;
  onClose: () => void;
  defaultColors: string[];
  existingProjectNames: string[];
}

const CONFIDENCE_CLASS: Record<string, string> = {
  high: 'vpp-conf-high',
  medium: 'vpp-conf-medium',
  low: 'vpp-conf-low',
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

function getConfidenceLevel(conf: number): string {
  if (conf >= 0.85) return 'high';
  if (conf >= 0.60) return 'medium';
  return 'low';
}

export default function VppImportModal({ onImport, onClose, defaultColors, existingProjectNames }: Props) {
  const [stage, setStage] = useState<'upload' | 'parsing' | 'results' | 'error'>('upload');
  const [result, setResult] = useState<VppAnalysisResult | null>(null);
  const [items, setItems] = useState<VppDetectionItem[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [errorMsg, setErrorMsg] = useState('');
  const [progressText, setProgressText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理文件选择
  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.vpp')) {
      setErrorMsg('请选择 .vpp 文件');
      setStage('error');
      return;
    }

    setStage('parsing');
    setProgressText(`正在读取 ${file.name}...`);
    setErrorMsg('');

    try {
      const buffer = await file.arrayBuffer();
      setProgressText('正在扫描 C# 脚本...');

      const analysisResult = await parseVppBinary(buffer);

      setProgressText('分析完成');

      // 更新项目名称：跳过已有的同名项目
      const updatedItems = analysisResult.items.map(item => {
        const exists = existingProjectNames.some(
          name => name.toLowerCase() === item.name.toLowerCase()
        );
        if (exists) {
          return {
            ...item,
            selected: importMode === 'replace' ? item.selected : false,
            warnings: [...item.warnings, '已存在同名项目'],
          };
        }
        return item;
      });

      setResult(analysisResult);
      setItems(updatedItems);
      setStage('results');
    } catch (e) {
      setErrorMsg(`解析失败: ${e instanceof Error ? e.message : '未知错误'}`);
      setStage('error');
    }
  }, [existingProjectNames, importMode]);

  // 拖放处理
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // 文件输入变化
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // 切换项目选中状态
  const toggleItem = useCallback((id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
  }, []);

  // 更新项目字段
  const updateItem = useCallback((id: string, field: 'name' | 'points' | 'tolerance', value: string | number) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      if (field === 'name') return { ...item, name: value as string };
      if (field === 'points') {
        const num = typeof value === 'string' ? parseInt(value) : value;
        return { ...item, points: isNaN(num) || num < 1 ? null : num };
      }
      if (field === 'tolerance') {
        const num = typeof value === 'string' ? parseFloat(value) : value;
        return { ...item, tolerance: isNaN(num) || num < 0 ? null : num };
      }
      return item;
    }));
  }, []);

  // 确认导入
  const handleConfirm = useCallback(() => {
    const selected = items.filter(i => i.selected);
    if (selected.length === 0) {
      onClose();
      return;
    }

    const projects = mapToMeasurementProjects(selected, defaultColors);
    onImport(projects, importMode);
    onClose();
  }, [items, importMode, defaultColors, onImport, onClose]);

  // 全选/取消全选
  const toggleAll = useCallback(() => {
    const allSelected = items.every(i => i.selected);
    setItems(prev => prev.map(i => ({ ...i, selected: !allSelected })));
  }, [items]);

  const selectedCount = items.filter(i => i.selected).length;

  return (
    <div className="vpp-modal-overlay" onClick={onClose}>
      <div className="vpp-modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="VPP 导入">
        {/* Header */}
        <div className="vpp-modal-header">
          <h2>导入 VPP 检测项目</h2>
          <button className="vpp-modal-close" onClick={onClose} aria-label="关闭">×</button>
        </div>

        {/* Stage: Upload */}
        {stage === 'upload' && (
          <div className="vpp-upload-stage">
            <div
              className="vpp-drop-zone"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="vpp-drop-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M24 8v28M14 20l10-12 10 12" />
                  <path d="M8 34v4a4 4 0 004 4h24a4 4 0 004-4v-4" />
                </svg>
              </div>
              <p><strong>拖放 .vpp 文件到此处</strong></p>
              <p>或点击选择 Cognex VisionPro 项目文件</p>
              <p className="vpp-drop-hint">仅本地解析 · 数据不出设备</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".vpp"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {/* Stage: Parsing */}
        {stage === 'parsing' && (
          <div className="vpp-parsing-stage">
            <div className="vpp-spinner" aria-hidden="true" />
            <p>{progressText}</p>
          </div>
        )}

        {/* Stage: Error */}
        {stage === 'error' && (
          <div className="vpp-error-stage">
            <p className="vpp-error-msg">{errorMsg}</p>
            <div className="vpp-error-actions">
              <button className="panel-btn" onClick={() => { setStage('upload'); setErrorMsg(''); }}>
                重新选择文件
              </button>
              <button className="panel-btn panel-btn-ghost" onClick={onClose}>
                取消
              </button>
            </div>
          </div>
        )}

        {/* Stage: Results */}
        {stage === 'results' && result && (
          <div className="vpp-results-stage">
            {/* Parser info */}
            <div className="vpp-parser-info">
              <span className="vpp-parser-badge">
                {result.parser === 'static-nrbf' ? '静态 NRBF 解析' : 'VisionPro 解析'}
              </span>
              <span>VPP {result.vppVersion} · 程序集 {result.assemblyVersion}</span>
              {result.warnings.length > 0 && (
                <span className="vpp-parser-warning">
                  ⚠ {result.warnings.join('; ')}
                </span>
              )}
            </div>

            {/* Import mode */}
            <div className="vpp-import-mode">
              <span>导入方式：</span>
              <label className={importMode === 'append' ? 'vpp-mode-chip active' : 'vpp-mode-chip'}>
                <input type="radio" name="importMode" checked={importMode === 'append'} onChange={() => setImportMode('append')} />
                追加到现有项目
              </label>
              <label className={importMode === 'replace' ? 'vpp-mode-chip active' : 'vpp-mode-chip'}>
                <input type="radio" name="importMode" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} />
                替换当前项目
              </label>
            </div>

            {/* Items table */}
            {items.length > 0 ? (
              <>
                <div className="vpp-table-wrap">
                  <table className="vpp-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>
                          <input
                            type="checkbox"
                            checked={items.every(i => i.selected)}
                            onChange={toggleAll}
                            aria-label="全选"
                          />
                        </th>
                        <th>项目名称</th>
                        <th style={{ width: 80 }}>点数</th>
                        <th style={{ width: 100 }}>公差</th>
                        <th style={{ width: 60 }}>可信度</th>
                        <th style={{ width: 80 }}>评分</th>
                        <th>提示</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => {
                        const nameLevel = getConfidenceLevel(item.nameConfidence.value);
                        const pointsLevel = getConfidenceLevel(item.pointsConfidence.value);
                        const tolLevel = getConfidenceLevel(item.toleranceConfidence.value);
                        const worstLevel = [nameLevel, pointsLevel, tolLevel].sort((a, b) => {
                          const order = { high: 3, medium: 2, low: 1 };
                          return order[a as keyof typeof order] - order[b as keyof typeof order];
                        })[0];

                        return (
                          <tr key={item.id} className={item.selected ? '' : 'vpp-row-disabled'}>
                            <td>
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => toggleItem(item.id)}
                                aria-label={`选择 ${item.name}`}
                              />
                            </td>
                            <td>
                              <input
                                className="panel-input"
                                value={item.name}
                                onChange={e => updateItem(item.id, 'name', e.target.value)}
                                style={{ width: '100%', minWidth: 120 }}
                              />
                            </td>
                            <td>
                              <div className="vpp-cell-with-hint">
                                <input
                                  className="panel-input panel-input-sm"
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={item.points ?? ''}
                                  placeholder={item.pointsConfidence.source}
                                  onChange={e => updateItem(item.id, 'points', e.target.value)}
                                  style={{ width: 60 }}
                                />
                                <span className="vpp-cell-formula">{item.pointsConfidence.source}</span>
                              </div>
                            </td>
                            <td>
                              <div className="vpp-cell-with-hint">
                                <input className="panel-input panel-input-sm" type="number" min={0} step={0.01}
                                  value={item.tolerance ?? ''}
                                  placeholder={item.toleranceConfidence.source}
                                  onChange={e => updateItem(item.id, 'tolerance', e.target.value)}
                                  style={{ width: 80 }}
                                />
                                <span className="vpp-cell-formula">{item.toleranceConfidence.source}</span>
                              </div>
                            </td>
                            <td>
                              <span className={`vpp-conf-badge ${CONFIDENCE_CLASS[worstLevel]}`}>
                                {CONFIDENCE_LABEL[worstLevel]}
                              </span>
                            </td>
                            <td className="vpp-score-cell">{item.score}</td>
                            <td className="vpp-hints-cell">
                              {item.warnings.map((w, i) => (
                                <span key={i} className="vpp-hint">{w}</span>
                              ))}
                              {item.tolerancePositive !== undefined && (
                                <span className="vpp-hint vpp-hint-warn">
                                  不对称公差 (+{item.tolerancePositive}/-{item.toleranceNegative})
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="vpp-table-summary">
                  <span>已选择 <strong>{selectedCount}</strong> / {items.length} 个项目</span>
                  <span className="vpp-summary-sep">|</span>
                  <span>测量点合计：<strong>{
                    items.filter(i => i.selected).reduce((s, i) => s + (i.points ?? 0), 0)
                  }</strong></span>
                  <span className="vpp-summary-sep">|</span>
                  <label className="vpp-datarows-label">
                    数据行数：
                    <input
                      className="panel-input panel-input-sm"
                      type="number"
                      min={1}
                      max={200}
                      value={
                        items.filter(i => i.selected).reduce((s, i) => s + (i.points ?? 0), 0)
                      }
                      readOnly
                      style={{ width: 60, marginLeft: 6, height: 28 }}
                    />
                  </label>
                </div>
              </>
            ) : (
              <div className="vpp-empty">
                <p>未检测到测量项目</p>
                <p className="vpp-empty-hint">
                  该 VPP 文件中可能不包含检测项目，或文件结构无法通过备用解析器识别。
                  请确认 VPP 版本，或尝试在安装了 VisionPro 的环境中使用精确解析。
                </p>
              </div>
            )}

            {/* Ignored items */}
            {result.ignoredItems.length > 0 && (
              <details className="vpp-ignored-details">
                <summary>
                  查看被忽略的 {result.ignoredItems.length} 个项目
                </summary>
                <table className="panel-table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>名称</th>
                      <th>原因</th>
                      <th>工具类型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.ignoredItems.map((item, i) => (
                      <tr key={i}>
                        <td>{item.name}</td>
                        <td>{item.reason}</td>
                        <td>{item.toolTypes.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}

            {/* Actions */}
            <div className="vpp-actions">
              <button className="panel-btn" onClick={handleConfirm} disabled={selectedCount === 0}>
                确认导入 ({selectedCount} 项)
              </button>
              <button className="panel-btn panel-btn-ghost" onClick={() => { setStage('upload'); setResult(null); setItems([]); }}>
                重新选择文件
              </button>
              <button className="panel-btn panel-btn-ghost" onClick={onClose}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
