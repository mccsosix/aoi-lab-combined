import { useState, useCallback, useRef } from 'react';
import type { ToolId } from './types';
import Header from './components/Header';
import Footer from './components/Footer';
import ToolCard from './components/ToolCard';
import ToolWorkbenchNav from './components/ToolWorkbenchNav';
import { TOOL_HELP } from './components/help-content';
import { LabMark, QueryIcon, GeneratorIcon, FovIcon, RepeatabilityIcon, CorrelationIcon } from './components/Icons';
import CaseQueryTool from './components/case-query/CaseQueryTool';
import SheetGeneratorTool from './components/sheet-generator/SheetGeneratorTool';
import { FovWorkbench } from './fov/components/FovWorkbench';
import RepeatabilityWorkbench from './repeatability/RepeatabilityWorkbench';

type OpenToolId = Exclude<ToolId, null>;

const TOOL_META: Record<OpenToolId, { index: string; title: string; description: string }> = {
  'case-query': {
    index: '01',
    title: '案子物件查询',
    description: '快速查询案子关联的物件信息',
  },
  'sheet-generator': {
    index: '02',
    title: '表格生成器',
    description: '一键生成对样及重复性数据表格',
  },
  fov: {
    index: '03',
    title: 'FOV 选型工具',
    description: '算视野，按目标尺寸反向匹配相机与镜头',
  },
  repeatability: {
    index: '04',
    title: '重复性分析',
    description: '导入重复性 Excel，自动重算 6σ，定位异常并辅助调机判断',
  },
};

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolId>(null);
  const lastToolRef = useRef<OpenToolId | null>(null);

  const handleOpen = useCallback((id: OpenToolId) => {
    lastToolRef.current = id;
    setActiveTool(id);
    requestAnimationFrame(() => {
      const workbench = document.getElementById('tool-workbench');
      workbench?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      document.querySelector<HTMLButtonElement>('.workbench-back')?.focus({ preventScroll: true });
    });
  }, []);

  const returnFocusToTool = useCallback((id: OpenToolId | null) => {
    if (!id) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const card = document.getElementById(id);
        card?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
        card?.focus({ preventScroll: true });
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    const previousTool = lastToolRef.current;
    setActiveTool(null);
    returnFocusToTool(previousTool);
  }, [returnFocusToTool]);

  const activeMeta = activeTool ? TOOL_META[activeTool] : null;

  return (
    <main className="lab-shell">
      <div className="lab-page">
        <Header onHome={activeTool ? handleClose : undefined} />

        {activeTool === null ? (
          <>
            {/* Intro */}
            <section className="intro" id="top">
              <div className="sticky-note">
                <span>团队共创</span><strong>的效率工具箱</strong><i aria-hidden="true">☺</i>
              </div>
              <div className="intro-copy">
                <p className="eyebrow">{'// FROM SMALL PROBLEMS'}</p>
                <h1>小需求，<br />也值得认真解决。</h1>
                <p className="intro-description">
                  这里收集我们团队日常用到的工具。<br />少一点重复操作，多一点顺手。
                </p>
              </div>
              <div className="scribble-note" aria-hidden="true">
                <span>记录想法</span><span>解决麻烦</span><b>↘</b>
              </div>
            </section>

            {/* Tools Grid */}
            <section className="tools-layout" aria-label="工具列表">
              <div className="tool-grid">
                <ToolCard
                  index="01" id="case-query"
                  title="案子物件查询"
                  description="快速查询案子关联的物件信息"
                  tags={['Excel', '快速查询']}
                  icon={<QueryIcon />}
                  isActive={false}
                  onOpen={() => handleOpen('case-query')}
                />
                <ToolCard
                  index="02" id="sheet-generator"
                  title="表格生成器"
                  description="一键生成对样及重复性数据表格"
                  tags={['对样表格', '重复性表格']}
                  icon={<GeneratorIcon />}
                  isActive={false}
                  onOpen={() => handleOpen('sheet-generator')}
                />
                <ToolCard
                  index="03" id="fov"
                  title="FOV 选型工具"
                  description="算视野，按目标尺寸反向匹配相机与镜头"
                  tags={['相机', '镜头选型', '本机保存']}
                  icon={<FovIcon />}
                  isActive={false}
                  onOpen={() => handleOpen('fov')}
                />
                <ToolCard
                  index="04" id="repeatability"
                  title="重复性分析"
                  description="导入重复性 Excel，自动重算 6σ，定位异常并辅助调机判断"
                  tags={['6σ', '异常定位', '本机记录']}
                  icon={<RepeatabilityIcon />}
                  isActive={false}
                  onOpen={() => handleOpen('repeatability')}
                />
                <ToolCard
                  index="05" id="correlation"
                  title="相关性分析"
                  description="用于后续 QV / CCD 等相关性评估"
                  tags={['相关性', '预留模块']}
                  icon={<CorrelationIcon />}
                  isActive={false}
                  disabled
                  statusText="开发中"
                />
              </div>
            </section>

            <aside className="future-grid" aria-label="未来工具">
              <div className="future-card">
                <LabMark /><strong>新工具开发中…</strong><span>灵感正在装配</span>
              </div>
              <div className="future-card">
                <span className="plus">＋</span><strong>添加下一个灵感</strong>
                <span>持续更新，慢慢变好</span>
              </div>
            </aside>
          </>
        ) : (
          <section className="workbench-shell" id="tool-workbench" aria-label={`${activeMeta?.title || '工具'}工作台`}>
            {activeMeta && (
              <ToolWorkbenchNav
                index={activeMeta.index}
                title={activeMeta.title}
                description={activeMeta.description}
                help={TOOL_HELP[activeTool]}
                onBack={handleClose}
              />
            )}
            <div className="workbench-content">
              {activeTool === 'case-query' && <CaseQueryTool onClose={handleClose} showClose={false} />}
              {activeTool === 'sheet-generator' && <SheetGeneratorTool onClose={handleClose} showClose={false} />}
              {activeTool === 'fov' && <FovWorkbench onBack={handleClose} showBackAction={false} />}
              {activeTool === 'repeatability' && <RepeatabilityWorkbench onBack={handleClose} />}
            </div>
          </section>
        )}

        <Footer />
      </div>
    </main>
  );
}
