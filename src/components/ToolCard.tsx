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
  onOpen: () => void;
};

export default function ToolCard({ index, id, title, description, tags, icon, isActive, onOpen }: ToolCardProps) {
  const cls = ['tool-card', isActive ? 'active-card' : ''].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      id={id}
      role="button"
      tabIndex={0}
      aria-label={`${isActive ? '收起' : '打开'}${title}`}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
    >
      <span className="tape" aria-hidden="true">{index}</span>
      <div className="tool-illustration">{icon}</div>
      <div className="tool-copy">
        <span className="tiny-star" aria-hidden="true">★</span>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="tool-card-footer">
          <div className="tags">
            {tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <span className="open-button" aria-hidden="true"><ArrowIcon /></span>
        </div>
      </div>
    </div>
  );
}
