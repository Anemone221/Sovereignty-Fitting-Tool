import { AssignmentMatrix } from '@/panels/AssignmentMatrix';
import { AuditPanel } from '@/panels/AuditPanel';
import { ExportsPage } from '@/panels/ExportsPage';
import { MoonScansPage } from '@/panels/MoonScansPage';
import { PlanInspector } from '@/panels/PlanInspector';
import { PlansPanel } from '@/panels/PlansPanel';
import { RegionMap } from '@/panels/RegionMap';
import { SettingsPage } from '@/panels/SettingsPage';
import { SitesOverview } from '@/panels/SitesOverview';
import { StructuresPage } from '@/panels/StructuresPage';
import { SystemDetail } from '@/panels/SystemDetail';
import { TreeExplorer } from '@/panels/TreeExplorer';
import { UpgradeCatalog } from '@/panels/UpgradeCatalog';
import type { DockviewApi, IDockviewPanelProps } from 'dockview-react';

export const components: Record<
  string,
  React.FunctionComponent<IDockviewPanelProps>
> = {
  treeExplorer: () => <TreeExplorer />,
  systemDetail: () => <SystemDetail />,
  upgradeCatalog: () => <UpgradeCatalog />,
  plansPanel: () => <PlansPanel />,
  planInspector: () => <PlanInspector />,
  assignmentMatrix: () => <AssignmentMatrix />,
  sitesOverview: () => <SitesOverview />,
  structuresPage: () => <StructuresPage />,
  regionMap: () => <RegionMap />,
  exportsPage: () => <ExportsPage />,
  moonScansPage: () => <MoonScansPage />,
  auditPanel: () => <AuditPanel />,
  settingsPage: () => <SettingsPage />,
};

export interface PanelDefinition {
  id: string;
  componentId: string;
  title: string;
  position?: Parameters<DockviewApi['addPanel']>[0]['position'];
}

export const PANELS: Record<string, PanelDefinition> = {
  tree: { id: 'tree', componentId: 'treeExplorer', title: 'Universe' },
  system: { id: 'system', componentId: 'systemDetail', title: 'System' },
  plans: { id: 'plans', componentId: 'plansPanel', title: 'Plans' },
  inspector: { id: 'inspector', componentId: 'planInspector', title: 'Plan Inspector' },
  matrix: { id: 'matrix', componentId: 'assignmentMatrix', title: 'Matrix' },
  sites: { id: 'sites', componentId: 'sitesOverview', title: 'Sites' },
  upgrades: { id: 'upgrades', componentId: 'upgradeCatalog', title: 'Upgrades' },
  structures: { id: 'structures', componentId: 'structuresPage', title: 'Structures' },
  regionMap: { id: 'regionMap', componentId: 'regionMap', title: 'Map' },
  moonScans: { id: 'moonScans', componentId: 'moonScansPage', title: 'Moon Scans' },
  exports: { id: 'exports', componentId: 'exportsPage', title: 'Exports' },
  audit: { id: 'audit', componentId: 'auditPanel', title: 'Audit' },
  settings: { id: 'settings', componentId: 'settingsPage', title: 'Settings' },
};

export function addOrFocusPanel(api: DockviewApi, panelId: string): void {
  const def = PANELS[panelId];
  if (!def) return;
  const existing = api.getPanel(def.id);
  if (existing) {
    existing.api.setActive();
    return;
  }
  api.addPanel({
    id: def.id,
    component: def.componentId,
    title: def.title,
    position: def.position,
  });
}
