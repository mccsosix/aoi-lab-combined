import { useEffect, useRef } from 'react';

export type HelpSection = { heading?: string; items: string[] };

export type HelpContent = {
  title: string;
  intro: string;
  sections?: HelpSection[];
  note?: string;
};

export function HelpButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="help-btn" onClick={onClick} aria-haspopup="dialog" aria-label={label}>
      ?
    </button>
  );
}

export function HelpModal({ open, onClose, content }: { open: boolean; onClose: () => void; content: HelpContent }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const current = panel.current;
    current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !current) return;
      const items = [...current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="help-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div ref={panel} className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-modal-title">
        <header>
          <div>
            <span className="help-modal-kicker">// HOW TO USE</span>
            <h2 id="help-modal-title">{content.title}</h2>
          </div>
          <button className="help-modal-close" type="button" onClick={onClose} aria-label={`关闭${content.title}使用说明`}>×</button>
        </header>

        <p className="help-modal-intro">{content.intro}</p>

        {content.sections?.map((section, i) => (
          <section className="help-modal-section" key={i}>
            {section.heading && <h3>{section.heading}</h3>}
            <ul>
              {section.items.map((item, j) => <li key={j}>{item}</li>)}
            </ul>
          </section>
        ))}

        {content.note && (
          <aside className="help-modal-note">
            <b aria-hidden="true">!</b>
            <span>{content.note}</span>
          </aside>
        )}
      </div>
    </div>
  );
}
