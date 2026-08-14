"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Modal({ open, title, children, onClose, wide = false }: { open: boolean; title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const current = panel.current;
    current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !current) return;
      const items = [...current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')];
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener?.focus(); };
  }, [onClose, open]);
  if (!open) return null;
  return (
    <div className="fov-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panel} className={`fov-modal ${wide ? "fov-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="fov-modal-title">
        <header><h2 id="fov-modal-title">{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label={`关闭${title}`}>×</button></header>
        {children}
      </div>
    </div>
  );
}
