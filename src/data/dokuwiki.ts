import { compareSites, siteEffectsFor } from '@/data/effects';
import { CATEGORY_ORDER, categoryOf } from '@/data/upgradeCategories';
import type { OpsecFlags } from '@/state/opsecStore';
import { upgradeTypeKey } from '@shared/upgradeTypes';
import type {
  MoonScan,
  PlanMatrix,
  PlanRollup,
  PlanRollupRow,
  StructureNode,
  WorkforceTransfer,
} from '@shared/index';

export const WIKI_SECTIONS = [
  'summary',
  'matrix',
  'sitesCombat',
  'sitesMining',
  'sitesCombined',
  'systems',
  'structures',
  'moons',
  'workforce',
] as const;

export type WikiSection = (typeof WIKI_SECTIONS)[number];

export const WIKI_SECTION_LABELS: Record<WikiSection, string> = {
  summary: 'Summary totals',
  matrix: 'Assignment matrix',
  sitesCombat: 'Combat site matrix',
  sitesMining: 'Mining site matrix',
  sitesCombined: 'Combined site matrix',
  systems: 'Systems by constellation',
  structures: 'Structures',
  moons: 'Moon scans',
  workforce: 'Workforce routing & ALN',
};

export interface DokuWikiInput {
  planName: string;
  regions: string[];
  generatedAt: Date;
  sections: Record<WikiSection, boolean>;
  opsec: OpsecFlags;
  opsecPreset: string;
  rollup: PlanRollup | null;
  matrix: PlanMatrix | null;
  structures: StructureNode[];
  moons: MoonScan[];
  transfers: WorkforceTransfer[];
}

const REDACTED = '—';

type Align = 'left' | 'right';

/** DokuWiki headings are inverted: more '=' means a bigger heading. */
function wikiHeading(level: 1 | 2 | 3 | 4 | 5, text: string): string {
  const marker = '='.repeat(7 - level);
  return `${marker} ${text} ${marker}`;
}

/**
 * An unescaped '|' or '^' terminates a table cell, so both are wrapped in
 * DokuWiki's nowiki markers. Newlines become DokuWiki's forced line break.
 */
function wikiCell(text: string): string {
  return text
    .replace(/\|/g, '%%|%%')
    .replace(/\^/g, '%%^%%')
    .replace(/\r?\n/g, ' \\\\ ');
}

/** Leading whitespace right-aligns a DokuWiki cell; trailing whitespace left-aligns it. */
function pad(text: string, align: Align): string {
  return align === 'right' ? `  ${text} ` : ` ${text} `;
}

function wikiTable(
  headers: string[],
  rows: string[][],
  align: Align[] = [],
): string[] {
  const alignFor = (i: number): Align => align[i] ?? 'left';
  const head = `^${headers.map((h, i) => pad(wikiCell(h), alignFor(i))).join('^')}^`;
  const body = rows.map(
    (r) => `|${r.map((c, i) => pad(wikiCell(c), alignFor(i))).join('|')}|`,
  );
  return [head, ...body];
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

function fmtPercent(consumed: number, available: number): string {
  if (available <= 0) return REDACTED;
  return `${Math.round((consumed / available) * 100)}%`;
}

function fmtSec(sec: number | null): string {
  return sec === null ? '?' : sec.toFixed(2);
}

/**
 * Stable `System-N` aliases for op-sec. Built from matrix order first so the
 * numbering matches what AssignmentMatrix and SitesOverview show on screen.
 */
function buildSystemAliases(input: DokuWikiInput): Map<number, string> {
  const aliases = new Map<number, string>();
  const assign = (id: number) => {
    if (!aliases.has(id)) aliases.set(id, `System-${aliases.size + 1}`);
  };
  input.matrix?.systems.forEach((s) => assign(s.id));
  input.rollup?.systemBalances.forEach((s) => assign(s.systemId));
  return aliases;
}

function isSupercapUpgrade(name: string): boolean {
  return name === 'Supercapital Construction Facilities';
}

function isSystemEffectUpgrade(name: string): boolean {
  return upgradeTypeKey(name) === 'stability';
}

function upgradeVisible(name: string, opsec: OpsecFlags): boolean {
  if (opsec.hideSupercaps && isSupercapUpgrade(name)) return false;
  if (opsec.hideSystemEffects && isSystemEffectUpgrade(name)) return false;
  return true;
}

function compareUpgrades(a: string, b: string): number {
  const ai = CATEGORY_ORDER.indexOf(categoryOf(a));
  const bi = CATEGORY_ORDER.indexOf(categoryOf(b));
  if (ai !== bi) return ai - bi;
  return a.localeCompare(b);
}

interface Renderer {
  name: (systemId: number, real: string) => string;
  opsec: OpsecFlags;
}

function makeRenderer(input: DokuWikiInput): Renderer {
  const aliases = buildSystemAliases(input);
  return {
    opsec: input.opsec,
    name: (systemId, real) =>
      input.opsec.hideSystemNames ? (aliases.get(systemId) ?? real) : real,
  };
}

function renderHeader(input: DokuWikiInput, redacted: boolean): string[] {
  const lines = [wikiHeading(1, `Sov plan: ${input.planName}`), ''];
  const regions = input.regions.length > 0 ? input.regions.join(', ') : 'none';
  lines.push(`**Regions:** ${regions}\\\\`);
  lines.push(`**Generated:** ${input.generatedAt.toISOString()}\\\\`);
  if (redacted) {
    lines.push(
      `**Op-sec:** redacted using the //${input.opsecPreset}// preset — some values are shown as ${REDACTED}.`,
    );
  }
  lines.push('');
  return lines;
}

function renderSummary(input: DokuWikiInput, r: Renderer): string[] {
  const rollup = input.rollup;
  if (!rollup) return [];
  const t = rollup.totals;
  const showPercent = !(
    r.opsec.powerHidePercent &&
    r.opsec.workforceHidePercent &&
    r.opsec.hideGasIceBalance
  );

  const row = (
    label: string,
    consumed: number,
    available: number,
    hideCount: boolean,
    hidePercent: boolean,
  ): string[] => {
    const cells = [
      label,
      hideCount ? REDACTED : fmtNum(consumed),
      hideCount ? REDACTED : fmtNum(available),
    ];
    if (showPercent) {
      cells.push(hidePercent ? REDACTED : fmtPercent(consumed, available));
    }
    return cells;
  };

  const headers = ['Resource', 'Consumed', 'Available'];
  const align: Align[] = ['left', 'right', 'right'];
  if (showPercent) {
    headers.push('Used');
    align.push('right');
  }

  const rows = [
    row(
      'Power',
      t.consumedPower,
      t.availablePower,
      r.opsec.powerHideCount,
      r.opsec.powerHidePercent,
    ),
    row(
      'Workforce',
      t.consumedWorkforce,
      t.availableWorkforce,
      r.opsec.workforceHideCount,
      r.opsec.workforceHidePercent,
    ),
    row(
      'Superionic Ice/h',
      t.consumedIce,
      t.availableIce,
      r.opsec.hideGasIceBalance,
      r.opsec.hideGasIceBalance,
    ),
    row(
      'Magmatic Gas/h',
      t.consumedGas,
      t.availableGas,
      r.opsec.hideGasIceBalance,
      r.opsec.hideGasIceBalance,
    ),
  ];

  const lines = [wikiHeading(2, 'Summary'), '', ...wikiTable(headers, rows, align), ''];
  lines.push(`**Systems in plan:** ${rollup.systemBalances.length}\\\\`);
  lines.push(`**Over budget:** ${rollup.unbalancedSystems.length}\\\\`);
  lines.push(`**One-time startup fuel:** ${fmtNum(t.startupFuel)}`);
  lines.push('');
  return lines;
}

function renderMatrix(input: DokuWikiInput, r: Renderer): string[] {
  const matrix = input.matrix;
  if (!matrix || matrix.systems.length === 0) return [];

  const present = new Set<string>();
  for (const s of matrix.systems) {
    for (const u of s.upgrades) {
      if (upgradeVisible(u.name, r.opsec)) present.add(u.name);
    }
  }
  const columns = Array.from(present).sort(compareUpgrades);
  if (columns.length === 0) return [];

  const rows = matrix.systems.map((s) => {
    const installedByName = new Map(s.upgrades.map((u) => [u.name, u.installed]));
    const cells = columns.map((c) => {
      if (!installedByName.has(c)) return '';
      return installedByName.get(c) === true ? '●' : '○';
    });
    return [r.name(s.id, s.name), ...cells];
  });

  const align: Align[] = ['left', ...columns.map((): Align => 'right')];
  return [
    wikiHeading(2, 'Assignment matrix'),
    '',
    ...wikiTable(['System', ...columns], rows, align),
    '',
    `//● installed · ○ planned//`,
    '',
  ];
}

/**
 * Threat Detection Arrays are the only source of combat anomalies and Prospecting
 * Arrays the only source of ore sites, so the upgrade's category is the split.
 * Every other upgrade yields no grants at all (see `siteEffectsFor`).
 */
type SiteKind = 'combat' | 'mining';

function siteKindOf(upgradeName: string): SiteKind | null {
  const category = categoryOf(upgradeName);
  if (category === 'Military') return 'combat';
  if (category === 'Industry') return 'mining';
  return null;
}

function renderSiteMatrix(
  input: DokuWikiInput,
  r: Renderer,
  heading: string,
  kinds: ReadonlySet<SiteKind>,
): string[] {
  const matrix = input.matrix;
  if (!matrix || matrix.systems.length === 0) return [];

  const columnSet = new Set<string>();
  const totals = new Map<string, number>();
  const perSystem: { id: number; name: string; sites: Map<string, number> }[] = [];

  for (const s of matrix.systems) {
    const sites = new Map<string, number>();
    for (const u of s.upgrades) {
      if (!upgradeVisible(u.name, r.opsec)) continue;
      const kind = siteKindOf(u.name);
      if (kind === null || !kinds.has(kind)) continue;
      for (const g of siteEffectsFor(u.name, s.securityStatus)) {
        sites.set(g.site, (sites.get(g.site) ?? 0) + g.count);
        columnSet.add(g.site);
        totals.set(g.site, (totals.get(g.site) ?? 0) + g.count);
      }
    }
    if (sites.size > 0) perSystem.push({ id: s.id, name: s.name, sites });
  }
  if (perSystem.length === 0) return [];

  const columns = Array.from(columnSet).sort(compareSites);
  const rows = perSystem.map((s) => [
    r.name(s.id, s.name),
    ...columns.map((c) => {
      const n = s.sites.get(c) ?? 0;
      return n === 0 ? '' : String(n);
    }),
  ]);
  rows.push([
    '**Total**',
    ...columns.map((c) => `**${totals.get(c) ?? 0}**`),
  ]);

  const align: Align[] = ['left', ...columns.map((): Align => 'right')];
  return [
    wikiHeading(2, heading),
    '',
    ...wikiTable(['System', ...columns], rows, align),
    '',
  ];
}

const COMBAT_ONLY: ReadonlySet<SiteKind> = new Set<SiteKind>(['combat']);
const MINING_ONLY: ReadonlySet<SiteKind> = new Set<SiteKind>(['mining']);
const ALL_SITES: ReadonlySet<SiteKind> = new Set<SiteKind>(['combat', 'mining']);

function renderSitesCombat(input: DokuWikiInput, r: Renderer): string[] {
  return renderSiteMatrix(input, r, 'Combat sites', COMBAT_ONLY);
}

function renderSitesMining(input: DokuWikiInput, r: Renderer): string[] {
  return renderSiteMatrix(input, r, 'Mining sites', MINING_ONLY);
}

function renderSitesCombined(input: DokuWikiInput, r: Renderer): string[] {
  return renderSiteMatrix(input, r, 'All sites', ALL_SITES);
}

function renderSystemBalance(row: PlanRollupRow, r: Renderer): string[] {
  const showPercent = !(
    r.opsec.powerHidePercent &&
    r.opsec.workforceHidePercent &&
    r.opsec.hideGasIceBalance
  );
  const headers = ['Resource', 'Consumed', 'Available'];
  const align: Align[] = ['left', 'right', 'right'];
  if (showPercent) {
    headers.push('Used');
    align.push('right');
  }

  const line = (
    label: string,
    consumed: number,
    available: number,
    hideCount: boolean,
    hidePercent: boolean,
  ): string[] => {
    const cells = [
      label,
      hideCount ? REDACTED : fmtNum(consumed),
      hideCount ? REDACTED : fmtNum(available),
    ];
    if (showPercent) {
      cells.push(hidePercent ? REDACTED : fmtPercent(consumed, available));
    }
    return cells;
  };

  return wikiTable(
    headers,
    [
      line(
        'Power',
        row.consumedPower,
        row.availablePower,
        r.opsec.powerHideCount,
        r.opsec.powerHidePercent,
      ),
      line(
        'Workforce',
        row.consumedWorkforce,
        row.availableWorkforce,
        r.opsec.workforceHideCount,
        r.opsec.workforceHidePercent,
      ),
      line(
        'Superionic Ice/h',
        row.consumedIce,
        row.availableIce,
        r.opsec.hideGasIceBalance,
        r.opsec.hideGasIceBalance,
      ),
      line(
        'Magmatic Gas/h',
        row.consumedGas,
        row.availableGas,
        r.opsec.hideGasIceBalance,
        r.opsec.hideGasIceBalance,
      ),
    ],
    align,
  );
}

function renderSystems(input: DokuWikiInput, r: Renderer): string[] {
  const rollup = input.rollup;
  if (!rollup || rollup.systemBalances.length === 0) return [];

  const byConstellation = new Map<string, PlanRollupRow[]>();
  for (const row of rollup.systemBalances) {
    const key = `${row.regionName} / ${row.constellationName}`;
    const list = byConstellation.get(key);
    if (list) list.push(row);
    else byConstellation.set(key, [row]);
  }

  const lines = [wikiHeading(2, 'Systems'), ''];
  for (const [constellation, rows] of byConstellation) {
    lines.push(wikiHeading(3, constellation), '');
    for (const row of rows) {
      const name = r.name(row.systemId, row.systemName);
      lines.push(wikiHeading(4, `${name} (${fmtSec(row.securityStatus)})`), '');

      const upgrades = row.upgrades
        .filter((u) => upgradeVisible(u, r.opsec))
        .sort(compareUpgrades);
      if (upgrades.length === 0) {
        lines.push('//No upgrades assigned.//', '');
      } else {
        for (const u of upgrades) lines.push(`  * ${u}`);
        lines.push('');
      }

      if (!row.balanced) lines.push('**Over budget.**', '');
      lines.push(...renderSystemBalance(row, r), '');
    }
  }
  return lines;
}

function renderStructures(input: DokuWikiInput, r: Renderer): string[] {
  const rows: string[][] = [];
  for (const node of input.structures) {
    for (const s of node.structures) {
      rows.push([
        r.name(node.systemId, node.systemName),
        s.structureType,
        s.name ?? '',
        s.location ?? '',
      ]);
    }
  }
  if (rows.length === 0) return [];
  return [
    wikiHeading(2, 'Structures'),
    '',
    ...wikiTable(['System', 'Type', 'Name', 'Location'], rows),
    '',
  ];
}

function renderMoons(input: DokuWikiInput, r: Renderer): string[] {
  if (r.opsec.hideMoonScans || input.moons.length === 0) return [];

  const bySystem = new Map<number, MoonScan[]>();
  for (const scan of input.moons) {
    const list = bySystem.get(scan.systemId);
    if (list) list.push(scan);
    else bySystem.set(scan.systemId, [scan]);
  }

  const lines = [wikiHeading(2, 'Moon scans'), ''];
  for (const [systemId, scans] of bySystem) {
    lines.push(wikiHeading(3, r.name(systemId, scans[0].systemName)), '');
    const rows = scans
      .slice()
      .sort((a, b) => a.moonNumber - b.moonNumber || a.oreType.localeCompare(b.oreType))
      .map((s) => [
        `Moon ${s.moonNumber}`,
        s.planetName ?? '',
        s.oreType,
        `${(s.orePercent * 100).toFixed(1)}%`,
      ]);
    lines.push(
      ...wikiTable(['Moon', 'Planet', 'Ore', 'Share'], rows, [
        'left',
        'left',
        'left',
        'right',
      ]),
      '',
    );
  }
  return lines;
}

function renderWorkforce(input: DokuWikiInput, r: Renderer): string[] {
  const lines: string[] = [];

  if (!r.opsec.hideTransferRoute && input.transfers.length > 0) {
    const rows = input.transfers.map((t) => [
      r.name(t.sourceSystemId, t.sourceName),
      r.name(t.destSystemId, t.destName),
      t.exportAllUnused
        ? 'all unused'
        : r.opsec.workforceHideCount
          ? REDACTED
          : fmtNum(t.transferAmount),
    ]);
    lines.push(
      wikiHeading(3, 'Workforce transfers'),
      '',
      ...wikiTable(['From', 'To', 'Amount'], rows, ['left', 'left', 'right']),
      '',
    );
  }

  // ALN links are the textual form of the map's bridge lines, so they follow
  // hideJumpBridges rather than the importer/exporter hideTransferRoute flag.
  const alnRows: string[][] = [];
  if (!r.opsec.hideJumpBridges) {
    for (const row of input.rollup?.systemBalances ?? []) {
      const link = row.alnLink;
      if (!link || link.linkedSystemId === null) continue;
      alnRows.push([
        r.name(row.systemId, row.systemName),
        r.name(link.linkedSystemId, link.linkedSystemName),
      ]);
    }
  }
  if (alnRows.length > 0) {
    lines.push(
      wikiHeading(3, 'Advanced Logistics Network links'),
      '',
      ...wikiTable(['System', 'Linked to'], alnRows),
      '',
    );
  }

  if (lines.length === 0) return [];
  return [wikiHeading(2, 'Workforce routing'), '', ...lines];
}

const SECTION_RENDERERS: Record<
  WikiSection,
  (input: DokuWikiInput, r: Renderer) => string[]
> = {
  summary: renderSummary,
  matrix: renderMatrix,
  sitesCombat: renderSitesCombat,
  sitesMining: renderSitesMining,
  sitesCombined: renderSitesCombined,
  systems: renderSystems,
  structures: renderStructures,
  moons: renderMoons,
  workforce: renderWorkforce,
};

export function buildDokuWikiPage(input: DokuWikiInput): string {
  const r = makeRenderer(input);
  const redacted = Object.values(input.opsec).some(Boolean);

  const lines = renderHeader(input, redacted);
  for (const section of WIKI_SECTIONS) {
    if (!input.sections[section]) continue;
    lines.push(...SECTION_RENDERERS[section](input, r));
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
