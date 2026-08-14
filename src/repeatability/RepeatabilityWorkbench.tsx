import { useEffect, useRef, useState } from 'react';
import repeatabilityHtml from './repeatability-v1.6.html?raw';

type RepeatabilityWorkbenchProps = {
  onBack: () => void;
};

type RepeatabilityBridgeWindow = Window & {
  __AOI_REPEATABILITY_ROOT__?: ShadowRoot;
  __AOI_REPEATABILITY_BACK__?: () => void;
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

function prepareLegacyScript(script: string): string {
  let patched = script
    .replace(
      'const $=s=>document.querySelector(s);',
      'const $=s=>(window.__AOI_REPEATABILITY_ROOT__||document).querySelector(s);',
    )
    .replace(
      'const $$=s=>[...document.querySelectorAll(s)];',
      () => 'const $$=s=>[...(window.__AOI_REPEATABILITY_ROOT__||document).querySelectorAll(s)];',
    );

  patched = patched.replace(
    /\$\('#btnBack'\)\.addEventListener\('click',\(\)=>\{if\(history\.length>1\)history\.back\(\);else toast\('独立 HTML 模式下没有上一页；整合进 AOI LAB 后此按钮返回工具箱。'\);\}\);/,
    "$('#btnBack').addEventListener('click',()=>{window.__AOI_REPEATABILITY_BACK__?.();});",
  );

  return patched;
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

  // Run the supplied V1.6 logic only after its markup is mounted inside the shadow tree.
  // `new Function` keeps the legacy declarations isolated from the React module scope.
  new Function(prepareLegacyScript(script))();

  return () => {
    if (bridgeWindow.__AOI_REPEATABILITY_ROOT__ === shadow) delete bridgeWindow.__AOI_REPEATABILITY_ROOT__;
    if (bridgeWindow.__AOI_REPEATABILITY_BACK__ === onBack) delete bridgeWindow.__AOI_REPEATABILITY_BACK__;
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
