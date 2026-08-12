import { LabMark } from './Icons';

export default function Header() {
  return (
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
  );
}
