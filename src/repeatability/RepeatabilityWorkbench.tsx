import { useEffect, useRef, useState } from 'react';
import repeatabilityHtml from './repeatability-v1.6.html?raw';

type RepeatabilityWorkbenchProps = {
  onBack: () => void;
};

type RepeatabilityBridgeWindow = Window & {
  __AOI_REPEATABILITY_ROOT__?: ShadowRoot;
  __AOI_REPEATABILITY_BACK__?: () => void;
  /** 内嵌态标志：旧脚本据此关闭"抢宿主滚动"等独立页行为。 */
  __AOI_EMBEDDED__?: boolean;
  AOI?: unknown;
};

const EMBED_STYLE = `
:host { display:block; width:100%; min-width:0; color:var(--ink); }
.repeatability-embed { min-width:0; color:var(--ink); font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif; }
.repeatability-embed .topbar,
.repeatability-embed .footer-strip { display:none !important; }
.repeatability-embed #btnBack { display:none !important; }
.repeatability-embed #btnHelp { display:none !important; }
.repeatability-embed .page {
  max-width:none !important;
  width:100%;
  margin:0 !important;
}
.repeatability-embed .page-header { align-items:flex-start; }
.repeatability-embed .embed-header-actions {
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:10px;
  flex-wrap:wrap;
}
.repeatability-embed .embed-header-actions .toolbar { display:flex; }
.repeatability-embed .embed-header-actions .tool-btn {
  color:var(--ink);
  border-color:var(--ink);
  background:#fff;
}
.repeatability-embed .embed-header-actions .tool-btn.primary { background:var(--orange); }
@media (max-width: 760px) {
  .repeatability-embed .page-header { flex-direction:column; }
  .repeatability-embed .embed-header-actions { width:100%; justify-content:flex-start; }
}
`;

// 隔离脚本通过 document.getElementById / querySelector(All) 查找元素。
// 用一个代理把这三类查询路由到 Shadow DOM，其余（createElement、body、
// addEventListener 等）转发到真实 document —— 与 05 工具同策略。
//
// 历史实现用 String.replace 精确匹配旧 HTML 里定义 $ / $$ 选择器的那两行源码。
// 只要旧 HTML 改动一个空格、引号或换行，替换就静默失配：$ 仍指向真实 document，
// Shadow DOM 里所有 #id 都查不到，工具一打开就抛错，且运行时没有任何兜底。
// 改为注入 document 参数后，旧脚本里基于 document.querySelector 的 $ / $$
// 会自然绑定到这个代理，不再依赖源码的确切文本形态。
function buildDocumentProxy(shadow: ShadowRoot): Document {
  return new Proxy(document, {
    get(target, prop) {
      if (prop === 'getElementById') return (id: string) => shadow.getElementById(id);
      if (prop === 'querySelector') return (sel: string) => shadow.querySelector(sel);
      if (prop === 'querySelectorAll') return (sel: string) => shadow.querySelectorAll(sel);
      // receiver 必须传 target（真实 document）而不是默认的代理：
      // 否则 document.body / documentElement 这类**原生 getter** 会以代理为 this 调用，
      // 抛 "TypeError: Illegal invocation" —— 隔离脚本一碰 document.body 就炸。
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as Document;
}

function mountLegacyPage(host: HTMLElement, onBack: () => void) {
  const bridgeWindow = window as RepeatabilityBridgeWindow;
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.replaceChildren();

  const parsed = new DOMParser().parseFromString(repeatabilityHtml, 'text/html');
  const originalStyle = Array.from(parsed.querySelectorAll('style')).map((node) => node.textContent || '').join('\n');
  const script = Array.from(parsed.querySelectorAll('script')).map((node) => node.textContent || '').join('\n');
  parsed.querySelectorAll('script').forEach((node) => node.remove());

  const style = document.createElement('style');
  style.textContent = `${originalStyle.replace(/:root\s*\{/g, ':host {')}\n${EMBED_STYLE}`;

  const wrapper = document.createElement('div');
  wrapper.className = 'repeatability-embed';
  wrapper.innerHTML = parsed.body.innerHTML;

  const pageHeader = wrapper.querySelector('.page-header');
  const toolbar = wrapper.querySelector('.toolbar');
  const backButton = wrapper.querySelector('#btnBack');
  if (pageHeader && backButton) {
    const actions = document.createElement('div');
    actions.className = 'embed-header-actions';
    if (toolbar) actions.append(toolbar);
    actions.append(backButton);
    pageHeader.append(actions);
  }

  shadow.append(style, wrapper);
  bridgeWindow.__AOI_REPEATABILITY_ROOT__ = shadow;
  bridgeWindow.__AOI_REPEATABILITY_BACK__ = onBack;
  // 让旧脚本知道自己是内嵌态：它据此关闭 window.scrollTo 等会抢宿主滚动的独立页行为。
  bridgeWindow.__AOI_EMBEDDED__ = true;

  // 旧版返回按钮在嵌入态被 CSS 隐藏，但它的原生 handler 会调用 history.back()。
  // 用捕获阶段拦截替代源码字符串替换，避免依赖旧 HTML 的确切写法。
  const interceptBack = (event: Event) => {
    if ((event.target as HTMLElement | null)?.closest?.('#btnBack')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      onBack();
    }
  };
  shadow.addEventListener('click', interceptBack, true);

  // Run the supplied V1.6 logic only after its markup is mounted inside the shadow tree.
  // `new Function` keeps the legacy declarations isolated from the React module scope,
  // and injected `document` redirects its element lookups into the shadow root.
  new Function('document', script)(buildDocumentProxy(shadow));

  return () => {
    shadow.removeEventListener('click', interceptBack, true);
    if (bridgeWindow.__AOI_REPEATABILITY_ROOT__ === shadow) delete bridgeWindow.__AOI_REPEATABILITY_ROOT__;
    if (bridgeWindow.__AOI_REPEATABILITY_BACK__ === onBack) delete bridgeWindow.__AOI_REPEATABILITY_BACK__;
    delete bridgeWindow.__AOI_EMBEDDED__;
    shadow.replaceChildren();
  };
}

export default function RepeatabilityWorkbench({ onBack }: RepeatabilityWorkbenchProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    // Deferring one microtask prevents React StrictMode's development-only first effect
    // from booting the imperative legacy app twice.
    queueMicrotask(() => {
      if (disposed || !hostRef.current) return;
      try {
        cleanup = mountLegacyPage(hostRef.current, onBack);
      } catch (err) {
        console.error('Repeatability workbench failed to initialize', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [onBack]);

  if (error) {
    return (
      <section className="repeatability-tool-host">
        <div className="repeatability-load-error" role="alert">
          <strong>重复性分析加载失败</strong>
          <span>{error}</span>
          <div style={{ marginTop: 16 }}>
            <button className="tool-panel-close" type="button" onClick={onBack}>返回工作台</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="repeatability-tool-host">
      <div ref={hostRef} />
    </section>
  );
}
