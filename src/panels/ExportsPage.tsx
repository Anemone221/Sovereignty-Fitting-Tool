import { useCallback, useEffect, useMemo, useState } from 'react';
import { evesov } from '@/api/evesov';
import { OpsecPill } from '@/components/OpsecPill';
import { useUi } from '@/state/uiStore';
import {
  useOpsec,
  FLAG_KEYS,
  FLAG_LABELS,
  type OpsecFlags,
  activeFlagLabels
} from '@/state/opsecStore';
import { useExportRegistry, type ExportablePanel } from '@/state/exportRegistry';
import { buildExportFilename } from '@/data/exportFilename';
import {
  buildDokuWikiPage,
  WIKI_SECTIONS,
  WIKI_SECTION_LABELS,
  type WikiSection
} from '@/data/dokuwiki';
import type {
  ExportLogEntry,
  MoonScan,
  StructureNode,
  WorkforceTransfer
} from '@shared/index';

const PANEL_ROWS: { id: ExportablePanel; label: string; hint: string }[] = [
  { id: 'matrix', label: 'Assignment Matrix', hint: 'Per-system upgrades grid' },
  { id: 'sites', label: 'Sites Overview', hint: 'Site totals across plan' },
  { id: 'regionMap', label: 'Region Map', hint: 'Whichever region is currently displayed' },
  { id: 'inspector', label: 'Plan Inspector', hint: 'Plan-wide rollup grouped by constellation' }
];

const WIKI_PREF_PREFIX = 'exports.wiki.';

const WIKI_DEFAULTS: Record<WikiSection, boolean> = {
  summary: true,
  matrix: true,
  sitesCombat: true,
  sitesMining: true,
  sitesCombined: false,
  systems: true,
  structures: true,
  moons: false,
  workforce: true
};

export function ExportsPage(): JSX.Element {
  const activePlanId = useUi((s) => s.activePlanId);
  const focusPanel = useUi((s) => s.focusPanel);
  const flags = useOpsec((s) => s.flags);
  const preset = useOpsec((s) => s.preset);
  const userPresets = useOpsec((s) => s.userPresets);
  const setFlag = useOpsec((s) => s.setFlag);
  const applyPreset = useOpsec((s) => s.applyPreset);
  const applyUserPreset = useOpsec((s) => s.applyUserPreset);
  const saveUserPreset = useOpsec((s) => s.saveUserPreset);
  const deleteUserPreset = useOpsec((s) => s.deleteUserPreset);
  const clearAll = useOpsec((s) => s.clearAll);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetNameDraft, setPresetNameDraft] = useState('');
  const [presetError, setPresetError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'overwrite'; name: string }
    | { kind: 'delete'; name: string }
    | null
  >(null);
  const handlers = useExportRegistry((s) => s.handlers);
  const [selected, setSelected] = useState<Record<ExportablePanel, boolean>>({
    matrix: false,
    sites: false,
    regionMap: false,
    inspector: false
  });
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<ExportLogEntry[]>([]);
  const [dnaMessage, setDnaMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const refreshLog = useCallback(async () => {
    setLog(await evesov.exports.list(activePlanId ?? null));
  }, [activePlanId]);

  useEffect(() => {
    void refreshLog();
  }, [refreshLog]);

  const triggerExport = useCallback(
    async (panel: ExportablePanel) => {
      const handler = useExportRegistry.getState().handlers[panel];
      if (!handler) {
        focusPanel(panel);
        alert(`Open the ${panel} panel first, then re-trigger the export.`);
        return;
      }
      try {
        await handler();
      } finally {
        await refreshLog();
      }
    },
    [focusPanel, refreshLog]
  );

  const onExportSelected = useCallback(async () => {
    const checked = (Object.keys(selected) as ExportablePanel[]).filter((k) => selected[k]);
    if (checked.length === 0) return;
    setBusy(true);
    try {
      for (const panel of checked) {
        await triggerExport(panel);
      }
    } finally {
      setBusy(false);
    }
  }, [selected, triggerExport]);

  const onExportDna = useCallback(async () => {
    if (activePlanId === null) return;
    try {
      const { dna } = await evesov.exports.exportDna(activePlanId);
      await navigator.clipboard.writeText(dna);
      setDnaMessage({ kind: 'ok', text: `Copied compact DNA to clipboard (${dna.length} chars).` });
      await refreshLog();
    } catch (err) {
      setDnaMessage({ kind: 'err', text: (err as Error).message });
    }
  }, [activePlanId, refreshLog]);

  const onExportDnaText = useCallback(async () => {
    if (activePlanId === null) return;
    try {
      const { dna } = await evesov.exports.exportDnaText(activePlanId);
      await navigator.clipboard.writeText(dna);
      setDnaMessage({ kind: 'ok', text: `Copied text DNA to clipboard (${dna.length} chars).` });
      await refreshLog();
    } catch (err) {
      setDnaMessage({ kind: 'err', text: (err as Error).message });
    }
  }, [activePlanId, refreshLog]);

  const [moonMessage, setMoonMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const onExportMoonScans = useCallback(async () => {
    if (activePlanId === null) return;
    try {
      const { data } = await evesov.exports.exportMoonScans(activePlanId);
      await navigator.clipboard.writeText(data);
      setMoonMessage({ kind: 'ok', text: `Copied moon scan data to clipboard (${data.length} chars).` });
    } catch (err) {
      setMoonMessage({ kind: 'err', text: (err as Error).message });
    }
  }, [activePlanId]);

  const onImportMoonScans = useCallback(async () => {
    try {
      const text = (await navigator.clipboard.readText())?.trim() ?? '';
      if (!text.startsWith('ESOVMS1')) {
        setMoonMessage({ kind: 'err', text: 'Clipboard does not contain moon scan data (expected ESOVMS1).' });
        return;
      }
      const result = await evesov.exports.importMoonScans(text);
      setMoonMessage({ kind: 'ok', text: `Imported ${result.moonsImported} moon entries across ${result.systemCount} systems.` });
    } catch (err) {
      setMoonMessage({ kind: 'err', text: (err as Error).message });
    }
  }, []);

  const onImportDna = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text?.trim() ?? '';
      const recognised =
        trimmed.startsWith('ESOV1') || trimmed.startsWith('ESOV2B') || trimmed.startsWith('ESOV2T');
      if (!recognised) {
        setDnaMessage({
          kind: 'err',
          text: 'Clipboard does not contain a recognised DNA string (ESOV1, ESOV2B, or ESOV2T).'
        });
        return;
      }
      const result = await evesov.exports.importDna(trimmed);
      setDnaMessage({ kind: 'ok', text: `Imported plan "${result.name}" (id ${result.planId}).` });
      await refreshLog();
    } catch (err) {
      setDnaMessage({ kind: 'err', text: (err as Error).message });
    }
  }, [refreshLog]);

  const onDeleteLog = useCallback(
    async (id: number) => {
      await evesov.exports.deleteLog(id);
      await refreshLog();
    },
    [refreshLog]
  );

  const [wikiSections, setWikiSections] = useState<Record<WikiSection, boolean>>(WIKI_DEFAULTS);
  const [wikiMessage, setWikiMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [wikiPreview, setWikiPreview] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all(WIKI_SECTIONS.map((k) => evesov.prefs.get(WIKI_PREF_PREFIX + k))).then(
      (vals) => {
        setWikiSections((prev) => {
          const next = { ...prev };
          WIKI_SECTIONS.forEach((k, i) => {
            if (vals[i] !== null) next[k] = vals[i] === '1';
          });
          return next;
        });
      }
    );
  }, []);

  const onWikiSectionChange = useCallback((key: WikiSection, value: boolean) => {
    setWikiSections((prev) => ({ ...prev, [key]: value }));
    void evesov.prefs.set(WIKI_PREF_PREFIX + key, value ? '1' : '0');
  }, []);

  const buildWikiPage = useCallback(async (): Promise<{ text: string; planName: string }> => {
    if (activePlanId === null) throw new Error('No active plan.');
    const got = await evesov.plans.get(activePlanId);
    if (!got) throw new Error('Plan not found.');

    const needRollup =
      wikiSections.summary || wikiSections.systems || wikiSections.workforce;
    const needMatrix =
      wikiSections.matrix ||
      wikiSections.sitesCombat ||
      wikiSections.sitesMining ||
      wikiSections.sitesCombined;

    const rollup = needRollup ? await evesov.plans.summary(activePlanId) : null;
    const matrix = needMatrix ? await evesov.plans.matrix(activePlanId) : null;

    let structures: StructureNode[] = [];
    if (wikiSections.structures) {
      structures = await evesov.structures.list(activePlanId);
    }

    let transfers: WorkforceTransfer[] = [];
    if (wikiSections.workforce) {
      transfers = await evesov.plans.getWorkforceTransfers(activePlanId);
    }

    // moonScans.list() is global, so narrow it to the plan's own systems.
    let moons: MoonScan[] = [];
    if (wikiSections.moons) {
      const planSystemIds = new Set(await evesov.plans.getSystemIds(activePlanId));
      moons = (await evesov.moonScans.list()).filter((m) => planSystemIds.has(m.systemId));
    }

    const text = buildDokuWikiPage({
      planName: got.plan.name,
      regions: got.plan.regions,
      generatedAt: new Date(),
      sections: wikiSections,
      opsec: flags,
      opsecPreset: preset,
      rollup,
      matrix,
      structures,
      moons,
      transfers
    });
    return { text, planName: got.plan.name };
  }, [activePlanId, wikiSections, flags, preset]);

  const onPreviewWiki = useCallback(async () => {
    try {
      const { text } = await buildWikiPage();
      setWikiPreview(text);
      setWikiMessage(null);
    } catch (err) {
      setWikiPreview(null);
      setWikiMessage({ kind: 'err', text: (err as Error).message });
    }
  }, [buildWikiPage]);

  const onCopyWiki = useCallback(async () => {
    try {
      const { text } = await buildWikiPage();
      await navigator.clipboard.writeText(text);
      setWikiMessage({ kind: 'ok', text: `Copied DokuWiki page to clipboard (${text.length} chars).` });
    } catch (err) {
      setWikiMessage({ kind: 'err', text: (err as Error).message });
    }
  }, [buildWikiPage]);

  const onSaveWiki = useCallback(async () => {
    if (activePlanId === null) return;
    try {
      const { text, planName } = await buildWikiPage();
      const filename = buildExportFilename({ planName, panel: 'wiki', ext: 'txt' });
      const result = await evesov.exports.captureText(filename, text, {
        planId: activePlanId,
        planName,
        panel: 'wiki',
        opsecPreset: preset
      });
      if (!result.saved) {
        setWikiMessage({ kind: 'ok', text: 'Save cancelled.' });
        return;
      }
      setWikiMessage({ kind: 'ok', text: `Saved to ${result.path}` });
      await refreshLog();
    } catch (err) {
      setWikiMessage({ kind: 'err', text: (err as Error).message });
    }
  }, [activePlanId, buildWikiPage, preset, refreshLog]);

  const opsecActive = useMemo(() => activeFlagLabels(flags), [flags]);

  if (activePlanId === null) {
    return <div className="exports exports--empty">Activate a plan to use exports.</div>;
  }

  return (
    <div className="exports">
      <section className="exports__card" id="exports-png-card">
        <header className="exports__card-header">
          <h3>Export PNG</h3>
          <div className="exports__card-actions">
            <OpsecPill />
            <button
              type="button"
              className="exports__btn"
              disabled={busy || Object.values(selected).every((v) => !v)}
              onClick={onExportSelected}
            >
              Export selected
            </button>
          </div>
        </header>
        <table className="exports__panel-table">
          <thead>
            <tr>
              <th></th>
              <th>Panel</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {PANEL_ROWS.map((row) => {
              const mounted = Boolean(handlers[row.id]);
              return (
                <tr key={row.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected[row.id]}
                      onChange={(e) => setSelected((s) => ({ ...s, [row.id]: e.target.checked }))}
                      disabled={!mounted}
                    />
                  </td>
                  <td>
                    <div className="exports__panel-name">{row.label}</div>
                    <div className="exports__panel-hint">{row.hint}</div>
                  </td>
                  <td>
                    <span className={`exports__status exports__status--${mounted ? 'on' : 'off'}`}>
                      {mounted ? 'Mounted' : 'Open the panel first'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="exports__btn exports__btn--small"
                      disabled={!mounted || busy}
                      onClick={() => void triggerExport(row.id)}
                    >
                      Export
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="exports__card" id="exports-opsec-card">
        <header className="exports__card-header">
          <h3>Op-sec</h3>
          <div className="exports__card-actions">
            <span className="exports__preset-label">Preset:</span>
            <select
              className="exports__preset-select"
              value={preset}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'none') void clearAll();
                else if (value === 'public' || value === 'internal') void applyPreset(value);
                else if (value === 'custom') return;
                else void applyUserPreset(value);
              }}
            >
              <optgroup label="Built-in">
                <option value="none">None</option>
                <option value="public">Public share</option>
                <option value="internal">Internal share</option>
              </optgroup>
              {userPresets.length > 0 && (
                <optgroup label="My presets">
                  {userPresets.map((up) => (
                    <option key={up.name} value={up.name}>
                      {up.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {preset === 'custom' && <option value="custom">Custom (unsaved)</option>}
            </select>
            {savingPreset ? (
              <>
                <input
                  type="text"
                  className="exports__preset-name-input"
                  value={presetNameDraft}
                  placeholder="Preset name"
                  autoFocus
                  onChange={(e) => {
                    setPresetNameDraft(e.target.value);
                    setPresetError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSavingPreset(false);
                      setPresetError(null);
                    }
                  }}
                />
                <button
                  type="button"
                  className="exports__preset"
                  onClick={async () => {
                    const name = presetNameDraft.trim();
                    if (!name) {
                      setPresetError('Name required');
                      return;
                    }
                    if (['public', 'internal', 'none', 'custom'].includes(name.toLowerCase())) {
                      setPresetError('Reserved name');
                      return;
                    }
                    const existing = userPresets.some((p) => p.name === name);
                    if (existing) {
                      setConfirmAction({ kind: 'overwrite', name });
                      return;
                    }
                    try {
                      await saveUserPreset(name);
                      setSavingPreset(false);
                      setPresetNameDraft('');
                      setPresetError(null);
                    } catch (err) {
                      setPresetError(err instanceof Error ? err.message : 'Save failed');
                    }
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="exports__preset"
                  onClick={() => {
                    setSavingPreset(false);
                    setPresetNameDraft('');
                    setPresetError(null);
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="exports__preset"
                  onClick={() => {
                    const seed = userPresets.some((p) => p.name === preset) ? preset : '';
                    setPresetNameDraft(seed);
                    setSavingPreset(true);
                  }}
                  title="Save current flags as a named preset"
                >
                  Save as…
                </button>
                {userPresets.some((p) => p.name === preset) && (
                  <button
                    type="button"
                    className="exports__preset"
                    onClick={() => setConfirmAction({ kind: 'delete', name: preset })}
                  >
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        </header>
        {confirmAction && (
          <div className="exports__opsec-confirm">
            <span className="exports__opsec-confirm-text">
              {confirmAction.kind === 'overwrite'
                ? `Overwrite preset "${confirmAction.name}"?`
                : `Delete preset "${confirmAction.name}"?`}
            </span>
            <button
              type="button"
              className="exports__preset exports__preset--active"
              onClick={async () => {
                const action = confirmAction;
                setConfirmAction(null);
                try {
                  if (action.kind === 'overwrite') {
                    await saveUserPreset(action.name);
                    setSavingPreset(false);
                    setPresetNameDraft('');
                    setPresetError(null);
                  } else {
                    await deleteUserPreset(action.name);
                  }
                } catch (err) {
                  setPresetError(err instanceof Error ? err.message : 'Operation failed');
                }
              }}
            >
              {confirmAction.kind === 'overwrite' ? 'Overwrite' : 'Delete'}
            </button>
            <button
              type="button"
              className="exports__preset"
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </button>
          </div>
        )}
        {presetError && (
          <div className="exports__opsec-summary exports__opsec-summary--error">{presetError}</div>
        )}
        <div className="exports__opsec-grid">
          {(Object.keys(FLAG_KEYS) as (keyof OpsecFlags)[]).map((key) => (
            <label key={key} className="exports__opsec-row">
              <input
                type="checkbox"
                checked={flags[key]}
                onChange={(e) => void setFlag(key, e.target.checked)}
              />
              <span>{FLAG_LABELS[key]}</span>
            </label>
          ))}
        </div>
        <div className="exports__opsec-summary">
          {opsecActive.length === 0
            ? 'No redaction active. PNG exports will reveal full plan data.'
            : `${opsecActive.length} redaction${opsecActive.length === 1 ? '' : 's'} active.`}
        </div>
      </section>

      <section className="exports__card" id="exports-dna-card">
        <header className="exports__card-header">
          <h3>Share plan (DNA)</h3>
        </header>
        <div className="exports__dna-actions">
          <button type="button" className="exports__btn" onClick={() => void onExportDna()}>
            Export DNA → clipboard
          </button>
          <button type="button" className="exports__btn" onClick={() => void onExportDnaText()}>
            Copy as text
          </button>
          <button type="button" className="exports__btn" onClick={() => void onImportDna()}>
            Import from clipboard
          </button>
        </div>
        {dnaMessage && (
          <div className={`exports__dna-message exports__dna-message--${dnaMessage.kind}`}>
            {dnaMessage.text}
          </div>
        )}
        <p className="exports__dna-hint">
          The compact form starts with <code>ESOV2B</code>; the readable text form starts with{' '}
          <code>ESOV2T</code>. Older <code>ESOV1</code> strings still import. Imported plans are
          validated against your local seed database; unknown systems or upgrades are rejected.
        </p>
      </section>

      <section className="exports__card" id="exports-wiki-card">
        <header className="exports__card-header">
          <h3>DokuWiki page</h3>
          <div className="exports__card-actions">
            <OpsecPill />
            <button type="button" className="exports__btn" onClick={() => void onCopyWiki()}>
              Copy to clipboard
            </button>
            <button type="button" className="exports__btn" onClick={() => void onSaveWiki()}>
              Save as .txt
            </button>
            <button
              type="button"
              className="exports__btn exports__btn--small"
              onClick={() =>
                wikiPreview === null ? void onPreviewWiki() : setWikiPreview(null)
              }
            >
              {wikiPreview === null ? 'Preview' : 'Hide preview'}
            </button>
          </div>
        </header>
        <div className="exports__wiki-grid">
          {WIKI_SECTIONS.map((key) => (
            <label key={key} className="exports__wiki-row">
              <input
                type="checkbox"
                checked={wikiSections[key]}
                onChange={(e) => onWikiSectionChange(key, e.target.checked)}
              />
              <span>{WIKI_SECTION_LABELS[key]}</span>
            </label>
          ))}
        </div>
        {wikiMessage && (
          <div className={`exports__wiki-message exports__wiki-message--${wikiMessage.kind}`}>
            {wikiMessage.text}
          </div>
        )}
        {wikiPreview !== null && <pre className="exports__wiki-preview">{wikiPreview}</pre>}
        <p className="exports__dna-hint">
          Generates one DokuWiki page for the active plan. Op-sec redactions apply — system
          names become <code>System-N</code> and hidden resources render as <code>—</code>.
          Saving writes a <code>.txt</code> and records a <code>text-wiki</code> row in the
          export log; copying to the clipboard does not.
        </p>
      </section>

      <section className="exports__card" id="exports-moon-card">
        <header className="exports__card-header">
          <h3>Moon scans</h3>
        </header>
        <div className="exports__dna-actions">
          <button type="button" className="exports__btn" onClick={() => void onExportMoonScans()}>
            Export → clipboard
          </button>
          <button type="button" className="exports__btn" onClick={() => void onImportMoonScans()}>
            Import from clipboard
          </button>
        </div>
        {moonMessage && (
          <div className={`exports__dna-message exports__dna-message--${moonMessage.kind}`}>
            {moonMessage.text}
          </div>
        )}
        <p className="exports__dna-hint">
          Exports moon scan data for all systems in this plan's scope. Starts with{' '}
          <code>ESOVMS1</code>. Importing merges data into the local moon scans database —
          existing entries are updated, no plan data is modified.
        </p>
      </section>

      <section className="exports__card" id="exports-log-card">
        <header className="exports__card-header">
          <h3>Export log</h3>
          <button type="button" className="exports__btn exports__btn--small" onClick={() => void refreshLog()}>
            Refresh
          </button>
        </header>
        {log.length === 0 ? (
          <div className="exports__log-empty">No exports yet for this plan.</div>
        ) : (
          <table className="exports__log">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Panel</th>
                <th>System</th>
                <th>File</th>
                <th>Op-sec</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {log.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.exportedAt).toLocaleString()}</td>
                  <td>{row.exportType}</td>
                  <td>{row.panel ?? '—'}</td>
                  <td>{row.systemName ?? '—'}</td>
                  <td className="exports__log-file" title={row.filename ?? ''}>
                    {row.filename ?? '—'}
                  </td>
                  <td>{row.opsecPreset ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="exports__btn exports__btn--small"
                      onClick={() => void onDeleteLog(row.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
