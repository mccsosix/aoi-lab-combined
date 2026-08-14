import type { ReactNode } from 'react';
import { ArrowIcon } from './Icons';

type ToolCardProps = {
  index: string;
  id: string;
  title: string;
  description: string;
  tags: string[];
  icon: ReactNode;
  isActive: boolean;
  onOpen?: () => void;
  disabled?: boolean;
  statusText?: string;
};

export default function ToolCard({ index, id, title, description, tags, icon, isActive, onOpen, disabled = false, statusText }: ToolCardProps) {
  const cls = ['tool-card', isActive ? 'active-card' : '', disabled ? 'disabled-card' : ''].filter(Boolean).join(' ');
  const activate = () => { if (!disabled) onOpen?.(); };

  return (
    <div
      className={cls}
      id={id}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={disabled ? `${title}，${statusText || '开发中'}` : `${isActive ? '收起' : '打开'}${title}`}
      onClick={activate}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); activate(); } }}
    >
      <span className="tape" aria-hidden="true">{index}</span>
      <div className="tool-illustration">{icon}</div>
      <div className="tool-copy">
        <span className="tiny-star" aria-hidden="true">★</span>
        <h2>{title}</h2>
        <p>{description}</p>
        {statusText && <span className="tool-status">{statusText}</span>}
        <div className="tool-card-footer">
          <div className="tags">
            {tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <span className="open-button" aria-hidden="true">{disabled ? '—' : <ArrowIcon />}</span>
        </div>
      </div>
    </div>
  );
}
