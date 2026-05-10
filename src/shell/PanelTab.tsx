import { evesov } from '@/api/evesov';
import type { WindowInfo } from '@shared/index';
import { DockviewDefaultTab, type IDockviewPanelHeaderProps } from 'dockview-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ACTIVITY_LABELS } from './ActivityBar';

export function PanelTab(props: IDockviewPanelHeaderProps) {
  const [open, setOpen] = useState(false);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void evesov.windows.list().then(setWindows);
    const onDocClick = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      if (buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const panelId = props.api.id;
  const myWindowId = (window as unknown as { __evesovWindowId?: number }).__evesovWindowId;

  const sendTo = async (targetId: number) => {
    setOpen(false);
    const ok = await evesov.windows.sendPanelTo(targetId, panelId);
    if (ok) props.api.close();
  };

  const sendToNew = async () => {
    setOpen(false);
    await evesov.windows.openPanel(panelId);
    props.api.close();
  };

  const others = windows.filter((w) => w.id !== myWindowId);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setAnchor({ top: rect.bottom, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  };

  return (
    <div className="panel-tab">
      <DockviewDefaultTab {...props} />
      <button
        ref={buttonRef}
        type="button"
        className="panel-tab__menu"
        title="Send panel to another window"
        aria-label="Send panel to another window"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={toggle}
      >
        ⋮
      </button>
      {open && anchor &&
        createPortal(
          <div
            ref={popoverRef}
            className="panel-tab__popover"
            style={{ top: anchor.top, right: anchor.right }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="panel-tab__popover-header">Send to…</div>
            {others.length === 0 && (
              <div className="panel-tab__popover-empty">No other windows</div>
            )}
            {others.map((w) => (
              <button
                key={w.id}
                type="button"
                className="panel-tab__popover-item"
                onClick={() => sendTo(w.id)}
              >
                {w.isMain ? 'Main window' : describeWindow(w)}
              </button>
            ))}
            <div className="panel-tab__popover-divider" />
            <button
              type="button"
              className="panel-tab__popover-item"
              onClick={sendToNew}
            >
              New window
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

function describeWindow(w: WindowInfo): string {
  if (w.panelIds.length === 0) return `Window ${w.id}`;
  const labels = w.panelIds.map((id) => ACTIVITY_LABELS[id] ?? id);
  if (labels.length <= 2) return labels.join(', ');
  return `${labels[0]} +${labels.length - 1}`;
}
