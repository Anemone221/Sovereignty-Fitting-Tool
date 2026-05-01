import html2canvas from 'html2canvas';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evesov } from '@/api/evesov';
import { FormatBar } from '@/components/FormatBar';
import { upgradeSymbols } from '@/data/upgradeSymbols';
import { useUi } from '@/state/uiStore';
import type { PlanMatrix, Upgrade } from '@shared/index';

const FMT_KEYS = ['colorSystems', 'upgradeSymbols', 'verticalHeaders', 'hideUnused', 'showInstalled'] as const;
type FmtKey = (typeof FMT_KEYS)[number];

const FMT_LABELS: Record<FmtKey, string> = {
  colorSystems: 'Color systems',
  upgradeSymbols: 'Symbols',
  verticalHeaders: 'Vertical headers',
  hideUnused: 'Hide unused',
  showInstalled: 'Show installed'
};

const FMT_PREF_PREFIX = 'matrix.fmt.';

function heatClass(ratio: number): string {
  if (ratio > 1) return 'matrix__system-cell--heat-over';
  if (ratio >= 0.8) return 'matrix__system-cell--heat-warn';
  return 'matrix__system-cell--heat-ok';
}

export function AssignmentMatrix() {
  const activePlanId = useUi((s) => s.activePlanId);
  const selectSystem = useUi((s) => s.selectSystem);
  const [matrix, setMatrix] = useState<PlanMatrix | null>(null);
  const [allUpgrades, setAllUpgrades] = useState<Upgrade[]>([]);
  const [fmt, setFmt] = useState<Record<FmtKey, boolean>>({
    colorSystems: false,
    upgradeSymbols: false,
    verticalHeaders: false,
    hideUnused: false,
    showInstalled: false
  });
  const matrixRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void evesov.data.upgrades().then(setAllUpgrades);
  }, []);

  useEffect(() => {
    void Promise.all(FMT_KEYS.map((k) => evesov.prefs.get(FMT_PREF_PREFIX + k))).then((vals) => {
      setFmt((prev) => {
        const next = { ...prev };
        FMT_KEYS.forEach((k, i) => {
          if (vals[i] !== null) next[k] = vals[i] === '1';
        });
        return next;
      });
    });
  }, []);

  const onFmtChange = useCallback((key: FmtKey, value: boolean) => {
    setFmt((prev) => ({ ...prev, [key]: value }));
    void evesov.prefs.set(FMT_PREF_PREFIX + key, value ? '1' : '0');
  }, []);

  const refresh = useCallback(async () => {
    if (activePlanId === null) {
      setMatrix(null);
      return;
    }
    const m = await evesov.plans.matrix(activePlanId);
    setMatrix(m);
  }, [activePlanId]);

  useEffect(() => {
    void refresh();
    const off = evesov.events.on('plan-changed', () => {
      void refresh();
    });
    return off;
  }, [refresh]);

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    if (!matrix) return m;
    for (const s of matrix.systems) {
      for (const u of s.upgrades) m.set(u.name, (m.get(u.name) ?? 0) + 1);
    }
    return m;
  }, [matrix]);

  const columns = useMemo(() => {
    const all = allUpgrades.map((u) => u.name);
    if (!fmt.hideUnused) return all;
    return all.filter((n) => (totals.get(n) ?? 0) > 0);
  }, [allUpgrades, fmt.hideUnused, totals]);

  const onExportPng = useCallback(async () => {
    if (!matrixRef.current) return;
    const canvas = await html2canvas(matrixRef.current, { backgroundColor: '#1a1a1a' });
    const dataUrl = canvas.toDataURL('image/png');
    const filename = `matrix-${activePlanId ?? 'plan'}-${Date.now()}.png`;
    await evesov.exports.capturePng(filename, dataUrl);
  }, [activePlanId]);

  if (activePlanId === null) {
    return <div className="overview overview--empty">Activate a plan to see its assignment matrix.</div>;
  }
  if (!matrix) return <div className="overview overview--empty">Loading…</div>;
  if (matrix.systems.length === 0) {
    return <div className="overview overview--empty">No systems in plan yet. Add scopes from the Universe tree or assign upgrades from System detail.</div>;
  }

  const vertical = fmt.verticalHeaders;
  const headerCellClass = `matrix__headers-cell${vertical ? ' matrix__headers-cell--vertical' : ''}`;
  const colTextClass = `matrix__col-text${vertical ? ' matrix__col-text--vertical' : ''}`;
  const cornerClass = `matrix__sticky-col matrix__corner${vertical ? ' matrix__corner--vertical' : ''}`;
  const tableClass = `matrix${vertical ? ' matrix--vertical' : ''}`;

  return (
    <div className="overview">
      <header className="overview__header">
        <h2>Assignment matrix</h2>
        <span className="overview__meta">
          {matrix.systems.length} systems · {columns.length} upgrades
        </span>
      </header>
      <FormatBar keys={FMT_KEYS} labels={FMT_LABELS} values={fmt} onChange={onFmtChange} />
      <div className="format-bar__actions">
        <button type="button" onClick={onExportPng}>Export PNG</button>
      </div>
      <div className="matrix__scroll" ref={matrixRef}>
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={cornerClass}>System</th>
              <th className={headerCellClass} colSpan={columns.length}>
                <div className={`matrix__headers-row${vertical ? ' matrix__headers-row--vertical' : ''}`}>
                  {columns.map((c) => {
                    const label = fmt.upgradeSymbols ? upgradeSymbols[c] ?? c : c;
                    return (
                      <div key={c} className="matrix__header-slot">
                        <span className={colTextClass}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </th>
            </tr>
            <tr className="matrix__totals-row">
              <th className="matrix__sticky-col matrix__totals-label">Totals</th>
              {columns.map((c) => {
                const t = totals.get(c) ?? 0;
                return (
                  <th key={c} className="matrix__totals-cell">
                    {t > 0 ? t : ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.systems.map((s) => {
              const installedMap = new Map(s.upgrades.map((u) => [u.name, u.installed]));
              const worst = Math.max(s.usage.power, s.usage.workforce, s.usage.ice, s.usage.gas);
              const heat = fmt.colorSystems ? ` ${heatClass(worst)}` : '';
              return (
                <tr key={s.id}>
                  <td className={`matrix__sticky-col matrix__system-cell${heat}`}>
                    <div className="matrix__system-name-row">
                      <button className="inspector__system" onClick={() => selectSystem(s.id)} type="button">
                        {s.name}
                      </button>
                      {s.status !== 'local' && (
                        <span className={`status-tag status-tag--${s.status}`} title={`Workforce: ${s.status}`}>
                          {s.status}
                        </span>
                      )}
                    </div>
                    <div className="matrix__system-meta">
                      {s.constellationName}
                      <span className="matrix__region"> / {s.regionName}</span>
                    </div>
                  </td>
                  {columns.map((c) => {
                    const has = installedMap.has(c);
                    const installed = installedMap.get(c) === true;
                    let glyph = '';
                    if (has) {
                      glyph = fmt.showInstalled ? (installed ? '●' : '○') : '●';
                    }
                    return (
                      <td key={c} className={`matrix__cell${has ? ' matrix__cell--on' : ''}`}>
                        {glyph}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
