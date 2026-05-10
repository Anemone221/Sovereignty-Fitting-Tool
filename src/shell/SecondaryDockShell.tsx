import { evesov } from '@/api/evesov';
import { useOpsec } from '@/state/opsecStore';
import { useUi } from '@/state/uiStore';
import 'dockview-core/dist/styles/dockview.css';
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
} from 'dockview-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityBar } from './ActivityBar';
import { PANELS, addOrFocusPanel, components } from './dockComponents';
import { PanelTab } from './PanelTab';

interface SecondaryDockShellProps {
  initialPanelId: string;
}


export function SecondaryDockShell({ initialPanelId }: SecondaryDockShellProps) {
  const apiRef = useRef<DockviewApi | null>(null);
  const [active, setActive] = useState<string | null>(initialPanelId);
  const [docking, setDocking] = useState(false);
  const hydrateActivePlan = useUi((s) => s.hydrateActivePlan);
  const setSelectedSystemLocal = useUi((s) => s.setSelectedSystemLocal);
  const hydrateOpsec = useOpsec((s) => s.hydrate);

  useEffect(() => {
    void hydrateActivePlan();
    void hydrateOpsec();
    void evesov.windows.self().then((id) => {
      (window as unknown as { __evesovWindowId?: number }).__evesovWindowId = id;
    });
  }, [hydrateActivePlan, hydrateOpsec]);

  useEffect(() => {
    return evesov.events.on('plan-active-changed', () => {
      void hydrateActivePlan();
    });
  }, [hydrateActivePlan]);

  useEffect(() => {
    return evesov.events.on('selected-system-changed', (payload) => {
      const { systemId } = payload as { systemId: number };
      setSelectedSystemLocal(systemId);
    });
  }, [setSelectedSystemLocal]);

  const popOut = useCallback((panelId: string) => {
    void evesov.windows.openPanel(panelId);
  }, []);

  const addOrFocus = useCallback((panelId: string) => {
    const api = apiRef.current;
    if (!api) return;
    addOrFocusPanel(api, panelId);
  }, []);

  useEffect(() => {
    return evesov.events.on('add-panel-requested', (payload) => {
      const { panelId } = payload as { panelId: string };
      addOrFocus(panelId);
    });
  }, [addOrFocus]);

  const reportPanels = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const ids = api.panels.map((p) => p.id);
    void evesov.windows.registerPanels(ids);
  }, []);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      const def = PANELS[initialPanelId];
      if (def) {
        event.api.addPanel({
          id: def.id,
          component: def.componentId,
          title: def.title,
        });
      }
      reportPanels();
      event.api.onDidLayoutChange(reportPanels);
      event.api.onDidActivePanelChange((panel) => {
        if (panel) setActive(panel.id);
      });
    },
    [initialPanelId, reportPanels],
  );

  const handleDockBack = async () => {
    setDocking(true);
    try {
      await evesov.windows.dockBack(-1);
    } finally {
      setDocking(false);
    }
  };

  return (
    <div className="dock-shell dock-shell--secondary">
      <ActivityBar active={active} onActivate={addOrFocus} onPopOut={popOut} />
      <div className="dock-shell__main secondary-dock">
        <div className="secondary-dock__bar">
          <button
            type="button"
            className="secondary-dock__dock-btn"
            onClick={handleDockBack}
            disabled={docking}
            title="Dock back to main window"
          >
            ⤓ Dock back
          </button>
        </div>
        <DockviewReact
          components={components}
          defaultTabComponent={PanelTab}
          onReady={onReady}
          className="dockview-theme-abyss dock-shell__dockview"
        />
      </div>
    </div>
  );
}
