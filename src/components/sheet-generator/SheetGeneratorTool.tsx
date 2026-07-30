import { useState, useCallback, useMemo } from 'react';
import type { MeasurementProject } from '../../types';
import { generateRepeatability } from '../../lib/repeatability';
import { generateCorrelation } from '../../lib/correlation';
import { CloseIcon } from '../Icons';

interface Props {
  onClose: () => void;
}

type Mode = 'repeatability' | 'correlation';

const DEFAULT_COLORS = ['#00B0F0', '#FFC000', '#92D050', '#FF6B6B', '#B4A7D6', '#FFD966', '#76D7C4', '#F1948A', '#85C1E9', '#F8C471'];

const templates = [
  { id: 'repeatability' as const, title: '重复性评估', note: '同一产品多次测量，验证数据稳定性' },
  { id: 'correlation' as const, title: '相关性评估', note: '对照两组测量数据，生成相关性表格' },
];

export default function SheetGeneratorTool({ onClose }: Props) {
  const [mode, setMode] = useState<Mode>('repeatability');
  const [productCount, setProductCount] = useState(10);
  const [seatingCount, setSeatingCount] = useState(1);
  const [angle0, setAngle0] = useState(true);
  const [angle180, setAngle180] = useState(true);
  const [dataRows, setDataRows] = useState(12);
  const [projects, setProjects] = useState<MeasurementProject[]>([
    { name: 'LH', pointCount: 4, color: '#00B0F0', tolerance: 0.1 },
    { name: '总高', pointCount: 1, color: '#FFC000', tolerance: 0.15 },
  ]);

  // Correlation params
  const [corrDataRows, setCorrDataRows] = useState(5);
  const [gapUpper, setGapUpper] = useState('0.015');
  const [gapLower, setGapLower] = useState('-0.015');
  const [includeR2, setIncludeR2] = useState(true);
  const [includeChart, setIncludeChart] = useState(true);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [status, setStatus] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [fileName, setFileName] = useState('');

  const angles = useMemo(() => {
    const a: string[] = [];
    if (angle0) a.push('0度');
    if (angle180) a.push('180度');
    return a;
  }, [angle0, angle180]);

  const sheetCount = Math.max(1, angles.length * seatingCount);

  const defaultFileName = useMemo(() => {
    const kind = mode === 'repeatability' ? '重复性' : '相关性';
    const now = new Date();
    return `CCD_${kind}_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }, [mode]);

  const estimatedRows = useMemo(() => {
    if (angles.length === 0) return 0;
    if (mode === 'repeatability') return sheetCount * productCount * (7 + dataRows);
    return sheetCount * (6 + corrDataRows + 1);
  }, [angles, sheetCount, productCount, dataRows, mode, corrDataRows]);

  const previewText = useMemo(() => {
    if (angles.length === 0) return '';
    if (mode === 'repeatability') {
      const info = projects.map(p => `${p.name}(${p.pointCount}点, ±${p.tolerance})`).join(', ');
      return `[重复性] ${sheetCount} Sheet (${angles.length}角度×${seatingCount}次) — ${productCount}产品, ${dataRows}次测量, ${projects.length}项目: ${info}, 约${estimatedRows}行`;
    }
    return `[相关性] ${sheetCount} Sheet (${angles.length}角度×${seatingCount}次) — ${productCount}产品横排, ${corrDataRows}个测量点, GAP [${gapLower}, ${gapUpper}], 约${estimatedRows}行`;
  }, [angles, mode, sheetCount, seatingCount, productCount, dataRows, projects, estimatedRows, corrDataRows, gapLower, gapUpper]);

  const updateProject = useCallback((idx: number, field: keyof MeasurementProject, value: string | number) => {
    setProjects(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }, []);

  const addProject = useCallback(() => {
    setProjects(prev => [...prev, {
      name: `项目${prev.length + 1}`,
      pointCount: 1,
      color: DEFAULT_COLORS[prev.length % DEFAULT_COLORS.length],
      tolerance: 0.1,
    }]);
  }, []);

  const removeProject = useCallback((idx: number) => {
    if (projects.length <= 1) return;
    setProjects(prev => prev.filter((_, i) => i !== idx));
  }, [projects.length]);

  const moveProject = useCallback((idx: number, dir: number) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= projects.length) return;
    setProjects(prev => {
      const arr = [...prev];
      [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
      return arr;
    });
  }, [projects.length]);

  const switchTemplate = useCallback((m: Mode) => {
    setMode(m);
    setStatus(null);
    if (m === 'repeatability') { setProductCount(10); setDataRows(12); }
    else { setProductCount(5); }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (angles.length === 0) { setStatus({ msg: '请至少选择一个评估角度！', type: 'error' }); return; }
    setGenerating(true); setProgress(0); setProgressText('正在生成...'); setStatus(null);
    try {
      let buffer: ArrayBuffer;
      if (mode === 'repeatability') {
        buffer = await generateRepeatability({
          productCount, seatingCount, angles,
          projects: projects.map(p => ({ ...p, color: p.color.replace('#', '') })),
          dataRows,
        }, (cur, total, name) => {
          setProgress(Math.round(cur / total * 100));
          setProgressText(`正在生成: ${name} (${cur}/${total})`);
        });
      } else {
        buffer = await generateCorrelation({
          productCount, seatingCount, angles,
          dataRows: corrDataRows,
          gapUpper: parseFloat(gapUpper) || 0.015,
          gapLower: parseFloat(gapLower) || -0.015,
          includeR2, includeChart,
        }, (cur, total, name) => {
          setProgress(Math.round(cur / total * 100));
          setProgressText(`正在生成: ${name} (${cur}/${total})`);
        });
      }

      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (fileName.trim() || defaultFileName) + '.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(100); setProgressText('生成完成');
      setStatus({ msg: '下载成功！', type: 'success' });
    } catch (e) {
      setStatus({ msg: `生成失败: ${e instanceof Error ? e.message : '未知错误'}`, type: 'error' });
    } finally { setGenerating(false); }
  }, [angles, mode, productCount, seatingCount, projects, dataRows, corrDataRows, gapUpper, gapLower, includeR2, includeChart, fileName, defaultFileName]);

  return (
    <div className="tool-panel" role="region" aria-label="表格生成器">
      <div className="tool-panel-header">
        <h2>02 表格生成器</h2>
        <button className="tool-panel-close" onClick={onClose} aria-label="关闭工具面板"><CloseIcon /></button>
      </div>

      <div className="generator-layout">
        {/* ===== Left: Config ===== */}
        <div className="generator-config">

          {/* 01: Template */}
          <section className="generator-section">
            <div className="generator-section-title">
              <span>01</span>
              <div><h2>选择评估模板</h2><p>先确定表格用途，后续参数会保持一致的填写方式。</p></div>
            </div>
            <div className="template-grid">
              {templates.map(t => (
                <button
                  type="button" key={t.id}
                  className={mode === t.id ? 'template-card is-active' : 'template-card'}
                  onClick={() => switchTemplate(t.id)}
                  aria-pressed={mode === t.id}
                >
                  <i aria-hidden="true">{mode === t.id ? '✓' : ''}</i>
                  <strong>{t.title}</strong>
                  <span>{t.note}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 02: Basic Params */}
          <section className="generator-section">
            <div className="generator-section-title">
              <span>02</span>
              <div><h2>基础参数</h2><p>设置产品、乘坐与评估角度。</p></div>
            </div>
            <div className="base-fields">
              <label className="generator-field">
                <span>产品个数</span>
                <input type="number" min={1} value={productCount} onChange={e => setProductCount(Math.max(1, parseInt(e.target.value) || 1))} />
              </label>
              <label className="generator-field">
                <span>乘坐次数</span>
                <input type="number" min={1} value={seatingCount} onChange={e => setSeatingCount(Math.max(1, parseInt(e.target.value) || 1))} />
              </label>
              <fieldset className="angle-field">
                <legend>评估角度</legend>
                <div>
                  {[0, 180].map(a => (
                    <button type="button" key={a}
                      className={(a === 0 ? angle0 : angle180) ? 'angle-chip is-active' : 'angle-chip'}
                      onClick={() => a === 0 ? setAngle0(v => !v) : setAngle180(v => !v)}
                      aria-pressed={a === 0 ? angle0 : angle180}
                    >
                      <span aria-hidden="true">{(a === 0 ? angle0 : angle180) ? '✓' : ''}</span>{a}度
                    </button>
                  ))}
                </div>
              </fieldset>
              {mode === 'repeatability' ? (
                <label className="generator-field">
                  <span>重复测量次数</span>
                  <input type="number" min={2} max={100} value={dataRows}
                    onChange={e => setDataRows(Math.max(2, parseInt(e.target.value) || 2))} />
                  <small>每个产品重复测量的行数</small>
                </label>
              ) : (
                <label className="generator-field">
                  <span>测量数据行数</span>
                  <input type="number" min={2} max={20} value={corrDataRows}
                    onChange={e => setCorrDataRows(Math.max(2, parseInt(e.target.value) || 2))} />
                  <small>每个产品的测量点数</small>
                </label>
              )}
            </div>
          </section>

          {/* 03: Mode-specific */}
          {mode === 'repeatability' ? (
            <section className="generator-section">
              <div className="generator-section-title">
                <span>03</span>
                <div><h2>测量项目</h2><p>添加项目并调整顺序、点数与公差。</p></div>
              </div>
              <div className="measurement-table-wrap">
                <div className="measurement-table" role="table" aria-label="测量项目">
                  <div className="measurement-row measurement-head" role="row">
                    <span>名称</span><span>点数</span><span>公差</span><span>颜色</span><span>操作</span>
                  </div>
                  {projects.map((p, i) => (
                    <div className="measurement-row" role="row" key={i}>
                      <label><span className="sr-only">项目名称</span><input value={p.name} onChange={e => updateProject(i, 'name', e.target.value)} /></label>
                      <label><span className="sr-only">点数</span><input type="number" min={1} max={20} value={p.pointCount} onChange={e => updateProject(i, 'pointCount', Math.max(1, parseInt(e.target.value) || 1))} /></label>
                      <label className="tolerance-input"><span aria-hidden="true">±</span><span className="sr-only">公差</span><input type="number" min={0} step={0.01} value={p.tolerance} onChange={e => updateProject(i, 'tolerance', Math.max(0, parseFloat(e.target.value) || 0))} /></label>
                      <label className="color-input"><span className="sr-only">颜色</span><input type="color" value={p.color} onChange={e => updateProject(i, 'color', e.target.value)} /></label>
                      <div className="row-actions">
                        <button type="button" disabled={i === 0} onClick={() => moveProject(i, -1)} aria-label={`上移${p.name}`}>↑</button>
                        <button type="button" disabled={i === projects.length - 1} onClick={() => moveProject(i, 1)} aria-label={`下移${p.name}`}>↓</button>
                        <button type="button" className="delete" disabled={projects.length <= 1} onClick={() => removeProject(i)} aria-label={`删除${p.name}`}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button type="button" className="add-item" onClick={addProject}>＋ 添加测量项目</button>
            </section>
          ) : (
            <section className="generator-section">
              <div className="generator-section-title">
                <span>03</span>
                <div><h2>相关性配置</h2><p>设置 GAP 超标阈值与输出选项。</p></div>
              </div>
              <div className="corr-fields">
                <label className="generator-field">
                  <span>GAP 超标上限</span>
                  <input value={gapUpper} onChange={e => setGapUpper(e.target.value)} />
                  <small>GAP &gt; 此值 → 红色标记</small>
                </label>
                <label className="generator-field">
                  <span>GAP 超标下限</span>
                  <input value={gapLower} onChange={e => setGapLower(e.target.value)} />
                  <small>GAP &lt; 此值 → 红色标记</small>
                </label>
              </div>
              <div className="corr-options">
                <label className={includeR2 ? 'corr-option-chip is-active' : 'corr-option-chip'}>
                  <input type="checkbox" checked={includeR2} onChange={e => setIncludeR2(e.target.checked)} className="sr-only" />
                  <span aria-hidden="true">{includeR2 ? '✓' : ''}</span>
                  包含末尾相关性系数 R²
                </label>
                <label className={includeChart ? 'corr-option-chip is-active' : 'corr-option-chip'}>
                  <input type="checkbox" checked={includeChart} onChange={e => setIncludeChart(e.target.checked)} className="sr-only" />
                  <span aria-hidden="true">{includeChart ? '✓' : ''}</span>
                  插入折线图提示
                </label>
              </div>
            </section>
          )}
        </div>

        {/* ===== Right: Preview ===== */}
        <aside className="generator-preview">
          <span className="preview-label">LIVE PREVIEW</span>
          <h2>实时预览</h2>
          <div className="sheet-illustration" aria-hidden="true">
            <div className="sheet-back" />
            <div className="sheet-front"><b>XLSX</b><i /><i /><i /><i /></div>
          </div>
          <div className="preview-metrics">
            <div><strong>{angles.length === 0 ? 0 : sheetCount}</strong><span>Sheet</span></div>
            <div><strong>{productCount}</strong><span>产品</span></div>
            <div><strong>{mode === 'repeatability' ? dataRows : corrDataRows}</strong><span>{mode === 'repeatability' ? '次测量' : '测量点'}</span></div>
            <div><strong>{mode === 'repeatability' ? projects.length : '—'}</strong><span>项目</span></div>
          </div>
          <div className="preview-summary">
            <b>{angles.length === 0 ? '⚠ 请至少选择一个评估角度' : `预计约 ${estimatedRows} 行`}</b>
            {angles.length > 0 && <span>{previewText}</span>}
          </div>
          <label className="filename-field">
            <span>文件名</span>
            <div>
              <input
                value={fileName}
                onChange={e => setFileName(e.target.value)}
                placeholder={`默认: ${defaultFileName}`}
              />
              <b>.xlsx</b>
            </div>
          </label>
          <button type="button" className="generate-button" onClick={handleGenerate} disabled={generating || angles.length === 0}>
            {generating ? '生成中...' : '生成并下载'} <span>→</span>
          </button>

          {generating && (
            <div className="generator-progress">
              <div className="generator-progress-track">
                <div className="generator-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="generator-progress-text">{progressText}</p>
            </div>
          )}

          {status && (
            <p className={status.type === 'error' ? 'generator-status generator-status-error' : 'generator-status generator-status-ok'} aria-live="polite">
              {status.msg}
            </p>
          )}

          <p className="local-note"><span aria-hidden="true">✓</span> 仅在本地生成，不上传数据</p>
        </aside>
      </div>
    </div>
  );
}
