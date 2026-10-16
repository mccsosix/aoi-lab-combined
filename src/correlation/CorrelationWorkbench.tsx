import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import * as XLSX from 'xlsx';
import correlationHtml from './correlation-v13.html?raw';

type CorrelationWorkbenchProps = {
  onBack: () => void;
};

type CorrelationBridgeWindow = Window & {
  __AOI_CORRELATION_ROOT__?: ShadowRoot;
  __AOI_CORRELATION_BACK__?: () => void;
};

// 集成进 AOI LAB 工作台后，隐藏自身的品牌条与返回按钮（由共享导航栏提供），
// 并让纸张容器铺满工作台宽度。
const EMBED_STYLE = `
:host { display:block; width:100%; min-width:0; color:var(--ink); }
.correlation-embed { min-width:0; color:var(--ink); font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif; }
.correlation-embed .lab-topbar { display:none !important; }
.correlation-embed #backBtn { display:none !important; }
.correlation-embed .container {
  max-width:none !important;
  width:100%;
  margin:0 !important;
}
`;

// 隔离脚本内部通过 document.getElementById / querySelector(All) 查找元素，
// 用一个代理把这三类查询路由到 Shadow DOM，其余（createElement、body、addEventListener 等）转发到真实 document。
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
  const bridgeWindow = window as CorrelationBridgeWindow;
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.replaceChildren();

  const parsed = new DOMParser().parseFromString(correlationHtml, 'text/html');
  const originalStyle = Array.from(parsed.querySelectorAll('style')).map((node) => node.textContent || '').join('\n');
  const script = Array.from(parsed.querySelectorAll('script')).map((node) => node.textContent || '').join('\n');
  parsed.querySelectorAll('script').forEach((node) => node.remove());

  const style = document.createElement('style');
  style.textContent = `${originalStyle.replace(/:root\s*\{/g, ':host {')}\n${EMBED_STYLE}`;

  const wrapper = document.createElement('div');
  wrapper.className = 'correlation-embed';
  wrapper.innerHTML = parsed.body.innerHTML;

  shadow.append(style, wrapper);
  bridgeWindow.__AOI_CORRELATION_ROOT__ = shadow;
  bridgeWindow.__AOI_CORRELATION_BACK__ = onBack;

  // 以参数注入 echarts / xlsx / 代理 document，使隔离脚本无需依赖 CDN 与真实 DOM。
  new Function('echarts', 'XLSX', 'document', script)(echarts, XLSX, buildDocumentProxy(shadow));

  return () => {
    if (bridgeWindow.__AOI_CORRELATION_ROOT__ === shadow) delete bridgeWindow.__AOI_CORRELATION_ROOT__;
    if (bridgeWindow.__AOI_CORRELATION_BACK__ === onBack) delete bridgeWindow.__AOI_CORRELATION_BACK__;
    shadow.replaceChildren();
  };
}

export default function CorrelationWorkbench({ onBack }: CorrelationWorkbenchProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    // 延迟一个微任务，避免 React StrictMode 开发态首轮 effect 重复启动命令式旧应用。
    queueMicrotask(() => {
      if (disposed || !hostRef.current) return;
      try {
        cleanup = mountLegacyPage(hostRef.current, onBack);
      } catch (err) {
        console.error('Correlation workbench failed to initialize', err);
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
      <section className="correlation-tool-host">
        <div className="correlation-load-error" role="alert">
          <strong>相关性判断加载失败</strong>
          <span>{error}</span>
          <div style={{ marginTop: 16 }}>
            <button className="tool-panel-close" type="button" onClick={onBack}>返回工作台</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="correlation-tool-host">
      <div ref={hostRef} />
    </section>
  );
}
