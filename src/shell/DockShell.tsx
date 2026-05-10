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
import { DEFAULT_PANELS_KEY, parseDefaultPanels } from './defaultPanels';
import { PANELS, addOrFocusPanel, components } from './dockComponents';
import { PanelTab } from './PanelTab';

const LAYOUT_KEY = 'dock.layout.v1';
const ACTIVE_KEY = 'dock.active.v1';

export function DockShell() {
    const apiRef = useRef<DockviewApi | null>(null);
    const [active, setActive] = useState<string | null>('system');
    const persistTimer = useRef<number | null>(null);
    const hydrateActivePlan = useUi((s) => s.hydrateActivePlan);
    const registerFocusPanel = useUi((s) => s.registerFocusPanel);
    const activePlanId = useUi((s) => s.activePlanId);
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
        let cancelled = false;
        const sync = async () => {
            if (activePlanId == null) {
                document.title = 'Sov Fitting Tool (SFT)';
                return;
            }
            const list = await evesov.plans.list();
            if (cancelled) return;
            const plan = list.find((p) => p.id === activePlanId);
            document.title = plan
                ? `${plan.name} — Sov Fitting Tool (SFT)`
                : 'Sov Fitting Tool (SFT)';
        };
        void sync();
        const off = evesov.events.on('plan-changed', () => {
            void sync();
        });
        return () => {
            cancelled = true;
            off();
        };
    }, [activePlanId]);

    const popOut = useCallback((panelId: string) => {
        void evesov.windows.openPanel(panelId);
    }, []);

    const addOrFocus = useCallback((panelId: string) => {
        const api = apiRef.current;
        if (!api) return;
        addOrFocusPanel(api, panelId);
    }, []);

    useEffect(() => {
        registerFocusPanel((panelId) => addOrFocus(panelId));
        return () => registerFocusPanel(null);
    }, [registerFocusPanel, addOrFocus]);

    useEffect(() => {
        return evesov.events.on('selected-system-changed', (payload) => {
            const { systemId } = payload as { systemId: number };
            setSelectedSystemLocal(systemId);
        });
    }, [setSelectedSystemLocal]);

    useEffect(() => {
        return evesov.events.on('focus-panel-requested', (payload) => {
            const { panelId } = payload as { panelId: string };
            addOrFocus(panelId);
        });
    }, [addOrFocus]);

    useEffect(() => {
        return evesov.events.on('add-panel-requested', (payload) => {
            const { panelId } = payload as { panelId: string };
            addOrFocus(panelId);
        });
    }, [addOrFocus]);

    const onReady = useCallback(async (event: DockviewReadyEvent) => {
        apiRef.current = event.api;

        const saved = await evesov.prefs.get(LAYOUT_KEY);
        let restored = false;
        if (saved) {
            try {
                event.api.fromJSON(JSON.parse(saved));
                restored = true;
            } catch (err) {
                console.warn('Failed to restore dock layout:', err);
            }
        }

        if (!restored) {
            event.api.addPanel({ id: 'tree', component: 'treeExplorer', title: 'Universe' });
            event.api.addPanel({
                id: 'plans',
                component: 'plansPanel',
                title: 'Plans',
                position: { referencePanel: 'tree', direction: 'below' },
            });
            event.api.addPanel({
                id: 'system',
                component: 'systemDetail',
                title: 'System',
                position: { referencePanel: 'tree', direction: 'right' },
            });
            event.api.addPanel({
                id: 'inspector',
                component: 'planInspector',
                title: 'Plan Inspector',
                position: { referencePanel: 'system', direction: 'right' },
            });
            const sys = event.api.getPanel('system');
            sys?.api.setActive();
        }

        const defaultPanelsRaw = await evesov.prefs.get(DEFAULT_PANELS_KEY);
        const defaultPanelIds = parseDefaultPanels(defaultPanelsRaw);
        for (const panelId of defaultPanelIds) {
            const def = PANELS[panelId];
            if (!def) continue;
            if (!event.api.getPanel(def.id)) {
                event.api.addPanel({
                    id: def.id,
                    component: def.componentId,
                    title: def.title,
                    position: def.position,
                });
            }
        }

        const savedActive = await evesov.prefs.get(ACTIVE_KEY);
        if (savedActive) setActive(savedActive);

        const persist = () => {
            if (persistTimer.current !== null)
                window.clearTimeout(persistTimer.current);
            persistTimer.current = window.setTimeout(() => {
                try {
                    void evesov.prefs.set(
                        LAYOUT_KEY,
                        JSON.stringify(event.api.toJSON()),
                    );
                } catch (err) {
                    console.warn('Failed to save dock layout:', err);
                }
            }, 250);
        };

        event.api.onDidLayoutChange(persist);
        event.api.onDidActivePanelChange((panel) => {
            if (panel) {
                setActive(panel.id);
                void evesov.prefs.set(ACTIVE_KEY, panel.id);
            }
        });
    }, []);

    useEffect(
        () => () => {
            if (persistTimer.current !== null)
                window.clearTimeout(persistTimer.current);
        },
        [],
    );

    return (
        <div className="dock-shell">
            <ActivityBar active={active} onActivate={addOrFocus} onPopOut={popOut} />
            <div className="dock-shell__main">
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
