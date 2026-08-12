function LabMark() {
  return (
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <path d="M28 12h16M32 12v19L18 56c-2 4 1 7 6 7h24c5 0 8-3 6-7L40 31V12" />
      <path d="M25 49h22M29 44c5 3 10-2 15 1" />
      <circle cx="31" cy="54" r="2" />
      <circle cx="41" cy="51" r="2" />
    </svg>
  );
}

function QueryIcon() {
  return (
    <svg viewBox="0 0 220 148" aria-hidden="true">
      <rect x="28" y="18" width="126" height="98" rx="8" />
      <path d="M28 46h126M64 18v98M99 46v70M28 78h126" />
      <rect className="icon-fill" x="65" y="79" width="33" height="36" />
      <circle cx="151" cy="94" r="31" />
      <path d="m173 117 27 25" />
      <rect className="excel-badge" x="17" y="9" width="38" height="38" rx="4" />
      <path className="badge-mark" d="m28 20 16 17M44 20 28 37" />
    </svg>
  );
}

function GeneratorIcon() {
  return (
    <svg viewBox="0 0 220 148" aria-hidden="true">
      <rect x="10" y="27" width="76" height="88" rx="7" />
      <path d="M10 52h76M35 27v88M10 82h76" />
      <rect x="134" y="27" width="76" height="88" rx="7" />
      <path d="M134 52h76M159 27v88M134 82h76" />
      <path className="bolt" d="m112 22-24 49h20l-9 54 34-63h-23z" />
      <rect className="excel-badge" x="2" y="19" width="30" height="30" rx="3" />
      <path className="badge-mark" d="m10 27 14 14M24 27 10 41" />
      <rect className="excel-badge" x="126" y="19" width="30" height="30" rx="3" />
      <path className="badge-mark" d="m134 27 14 14M148 27l-14 14" />
    </svg>
  );
}

function FovIcon() {
  return (
    <svg viewBox="0 0 220 148" aria-hidden="true">
      <rect x="18" y="22" width="82" height="62" rx="7" />
      <circle cx="59" cy="53" r="20" />
      <path d="M100 39h17l12 14-12 14h-17M129 53h62M164 30l27 23-27 23" />
      <rect className="icon-fill" x="132" y="92" width="70" height="34" rx="4" />
      <path d="M143 109h48M150 99v20M184 99v20" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 42 28" aria-hidden="true">
      <path d="M2 14h34M26 4l10 10-10 10" />
    </svg>
  );
}

type ToolCardProps = {
  index: string;
  id: string;
  title: string;
  description: string;
  tags: string[];
  icon: React.ReactNode;
  href?: string;
};

function ToolCard(props: ToolCardProps) {
  return (
    <a className="tool-card" href={props.href ?? `#${props.id}`} aria-label={`打开${props.title}`}>
      <span className="tape" aria-hidden="true">{props.index}</span>
      <div className="tool-illustration">{props.icon}</div>
      <div className="tool-copy">
        <span className="tiny-star" aria-hidden="true">★</span>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
        <div className="tool-card-footer">
          <div className="tags">
            {props.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <span className="open-button" aria-hidden="true"><ArrowIcon /></span>
        </div>
      </div>
    </a>
  );
}

export default function Home() {
  return (
    <main className="lab-shell">
      <div className="lab-page">
        <header className="lab-header">
          <a className="brand" href="#top" aria-label="AOI LAB 首页">
            <span className="brand-mark"><LabMark /></span>
            <span className="brand-copy">
              <strong>AOI LAB</strong>
              <span>把工作里的麻烦，做成顺手的小工具</span>
            </span>
          </a>
          <nav aria-label="页面导航">
            <a href="#about"><span aria-hidden="true">ⓘ</span> 关于</a>
            <span className="status-dot" aria-label="网站正常运行"><i /> ONLINE</span>
          </nav>
        </header>

        <section className="intro" id="top">
          <div className="sticky-note">
            <span>独立开发者</span><strong>的个人实验室</strong><i aria-hidden="true">☺</i>
          </div>
          <div className="intro-copy">
            <p className="eyebrow">{"// FROM SMALL PROBLEMS"}</p>
            <h1>小需求，<br />也值得认真解决。</h1>
            <p className="intro-description">
              这里收集我为日常工作做的小工具。<br />少一点重复操作，多一点顺手。
            </p>
          </div>
          <div className="scribble-note" aria-hidden="true">
            <span>记录想法</span><span>解决麻烦</span><b>↘</b>
          </div>
        </section>

        <section className="tools-layout" aria-label="工具列表">
          <div className="tool-grid">
            <ToolCard index="01" id="case-query" title="案子物件查询"
              description="快速查询案子关联的物件信息"
              tags={["Excel", "快速查询"]} icon={<QueryIcon />} />
            <ToolCard index="02" id="sheet-generator" title="表格生成器"
              description="一键生成对样及重复性数据表格"
              tags={["对样表格", "重复性表格"]} icon={<GeneratorIcon />} />
            <ToolCard index="03" id="fov-selector" title="FOV 选型工具"
              description="算视野，按目标尺寸反向匹配相机与镜头"
              tags={["相机", "镜头选型", "本机保存"]} icon={<FovIcon />} href="/fov" />
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

        <section className="tool-details" aria-label="工具入口说明">
          <article id="case-query">
            <span>01 / EXCEL</span><strong>案子物件查询入口已预留</strong>
            <p>下一步可在这里接入现有查询页面或 Excel 处理流程。</p>
          </article>
          <article id="sheet-generator">
            <span>02 / EXCEL</span><strong>表格生成器入口已预留</strong>
            <p>下一步可在这里接入对样与重复性表格的生成流程。</p>
          </article>
          <article id="fov-selector">
            <span>03 / OPTICS</span><strong>FOV 相机与镜头选型已可使用</strong>
            <p>内置 1,135 台面阵相机与 426 款镜头，支持组合计算、完整覆盖推荐和本机资料编辑。</p>
          </article>
        </section>

        <footer id="about">
          <p><span>&lt;/&gt;</span> AOI LAB · 小工具，大效率</p>
          <p>持续迭代中 ↻</p>
        </footer>
      </div>
    </main>
  );
}
