import { useEffect, useMemo, useState } from 'react';
import { evesov } from '@/api/evesov';
import { categoryOf } from '@/data/upgradeCategories';
import { effectFor } from '@/data/systemEffects';
import type { Upgrade } from '@shared/index';

type SortKey =
  | 'name'
  | 'type'
  | 'power'
  | 'workforce'
  | 'superionicIce'
  | 'magmaticGas'
  | 'startup';
type SortDir = 'asc' | 'desc';

const NUMERIC_KEYS: ReadonlySet<SortKey> = new Set([
  'power',
  'workforce',
  'superionicIce',
  'magmaticGas',
  'startup',
]);

export function UpgradeCatalog() {
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    void evesov.data.upgrades().then(setUpgrades);
  }, []);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? upgrades.filter((u) => u.name.toLowerCase().includes(q))
      : upgrades.slice();

    const dir = sortDir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === 'type') {
        cmp = categoryOf(a.name).localeCompare(categoryOf(b.name));
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
        if (cmp === 0) cmp = a.name.localeCompare(b.name);
      }
      return cmp * dir;
    });
    return filtered;
  }, [upgrades, filter, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(NUMERIC_KEYS.has(key) ? 'desc' : 'asc');
    }
  };

  return (
    <div className="catalog">
      <input
        type="search"
        className="catalog__filter"
        placeholder="Filter upgrades…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="catalog__body">
        <table className="grid">
          <thead>
            <tr>
              <SortHeader label="Name" sortKey="name" active={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label="Type" sortKey="type" active={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label="Power" sortKey="power" numeric active={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label="Workforce" sortKey="workforce" numeric active={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label="Ice" sortKey="superionicIce" numeric active={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label="Gas" sortKey="magmaticGas" numeric active={sortKey} dir={sortDir} onSort={onSort} />
              <SortHeader label="Startup fuel" sortKey="startup" numeric active={sortKey} dir={sortDir} onSort={onSort} />
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => {
              const eff = effectFor(u.name);
              return (
                <tr key={u.name}>
                  <td>{u.name}</td>
                  <td>{categoryOf(u.name)}</td>
                  <td className={costClass(u.power)}>{fmt(u.power)}</td>
                  <td className={costClass(u.workforce)}>{fmt(u.workforce)}</td>
                  <td className={costClass(u.superionicIce)}>{fmt(u.superionicIce)}</td>
                  <td className={costClass(u.magmaticGas)}>{fmt(u.magmaticGas)}</td>
                  <td className="num">{fmt(u.startup)}</td>
                  <td>
                    {eff ? (
                      <img
                        src={eff.icon}
                        alt={eff.label}
                        title={`${eff.label} Stability — ${eff.description}`}
                        className="effect-badge__icon"
                      />
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && upgrades.length > 0 && (
          <p className="catalog__empty">No upgrades match "{filter}".</p>
        )}
        {upgrades.length === 0 && <p className="catalog__empty">Loading…</p>}
      </div>
    </div>
  );
}

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  numeric?: boolean;
  onSort: (key: SortKey) => void;
}

function SortHeader({ label, sortKey, active, dir, numeric, onSort }: SortHeaderProps) {
  const isActive = active === sortKey;
  const arrow = isActive ? (dir === 'asc' ? ' ▲' : ' ▼') : '';
  const className = [
    numeric ? 'num' : '',
    'catalog__sort',
    isActive ? 'catalog__sort--active' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <th
      className={className}
      onClick={() => onSort(sortKey)}
      role="button"
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {arrow}
    </th>
  );
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function costClass(n: number): string {
  if (n < 0) return 'num cost-produces';
  return 'num';
}
