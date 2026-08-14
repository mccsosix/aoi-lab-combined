import { useState } from 'react';
import { HelpModal, type HelpContent } from './HelpModal';

type ToolWorkbenchNavProps = {
  index: string;
  title: string;
  description: string;
  help: HelpContent;
  onBack: () => void;
};

export default function ToolWorkbenchNav({ index, title, description, help, onBack }: ToolWorkbenchNavProps) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="workbench-nav" role="navigation" aria-label={`${title}工作台导航`}>
      <button className="workbench-back" type="button" onClick={onBack} aria-label="返回工具箱">
        <span className="workbench-back-arrow" aria-hidden="true">←</span>
        <span>返回工具箱</span>
      </button>

      <div className="workbench-current">
        <span className="workbench-index" aria-hidden="true">{index}</span>
        <div className="workbench-current-copy">
          <span className="workbench-crumb">工具箱 / {index}</span>
          <strong>{title}</strong>
          <small>{description}</small>
        </div>
      </div>

      <div className="workbench-actions">
        <button className="help-btn" type="button" onClick={() => setHelpOpen(true)} aria-haspopup="dialog" aria-label={`查看${title}使用说明`}>?</button>
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} content={help} />
    </div>
  );
}
