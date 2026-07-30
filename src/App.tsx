import { useState, useCallback } from 'react';
import type { ToolId } from './types';
import Header from './components/Header';
import Footer from './components/Footer';
import ToolCard from './components/ToolCard';
import { LabMark, QueryIcon, GeneratorIcon } from './components/Icons';
import CaseQueryTool from './components/case-query/CaseQueryTool';
import SheetGeneratorTool from './components/sheet-generator/SheetGeneratorTool';

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolId>(null);

  const handleOpen = useCallback((id: ToolId) => {
    setActiveTool(prev => prev === id ? null : id);
  }, []);

  const handleClose = useCallback(() => {
    setActiveTool(null);
  }, []);

  return (
    <main className="lab-shell">
      <div className="lab-page">
        <Header />

        {/* Intro */}
        <section className="intro" id="top">
          <div className="sticky-note">
            <span>团队共创</span><strong>的效率工具箱</strong><i aria-hidden="true">☺</i>
          </div>
          <div className="intro-copy">
            <p className="eyebrow">{"// FROM SMALL PROBLEMS"}</p>
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
              tags={["Excel", "快速查询"]}
              icon={<QueryIcon />}
              isActive={activeTool === 'case-query'}
              onOpen={() => handleOpen('case-query')}
            />
            <ToolCard
              index="02" id="sheet-generator"
              title="表格生成器"
              description="一键生成对样及重复性数据表格"
              tags={["对样表格", "重复性表格"]}
              icon={<GeneratorIcon />}
              isActive={activeTool === 'sheet-generator'}
              onOpen={() => handleOpen('sheet-generator')}
            />
          </div>
          <aside className="future-grid" aria-label="未来工具">
            <div className="future-card">
              <LabMark /><strong>新工具开发中…</strong><span>灵感正在装配</span>
            </div>
            <div className="future-card">
              <span className="plus">＋</span><strong>添加下一个灵感</strong>
              <span>持续更新，慢慢变好</span>
            </div>
          </aside>
        </section>

        {/* Expanded Tool Panel */}
        {activeTool === 'case-query' && <CaseQueryTool onClose={handleClose} />}
        {activeTool === 'sheet-generator' && <SheetGeneratorTool onClose={handleClose} />}

        <Footer />
      </div>
    </main>
  );
}
