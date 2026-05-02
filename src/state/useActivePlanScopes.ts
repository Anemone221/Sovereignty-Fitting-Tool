import { useCallback, useEffect, useState } from 'react';
import { evesov } from '@/api/evesov';
import { useUi } from './uiStore';
import type { PlanScope } from '@shared/index';

export function scopeKey(type: PlanScope['scopeType'], id: number): string {
  return `${type}:${id}`;
}

export interface ActivePlanScopes {
  scopes: PlanScope[];
  capitalSystemIds: number[];
  has: (type: PlanScope['scopeType'], id: number) => boolean;
  isCapital: (systemId: number) => boolean;
  toggle: (type: PlanScope['scopeType'], id: number) => Promise<void>;
}

export function useActivePlanScopes(): ActivePlanScopes {
  const activePlanId = useUi((s) => s.activePlanId);
  const [scopes, setScopes] = useState<PlanScope[]>([]);
  const [capitalSystemIds, setCapitalSystemIds] = useState<number[]>([]);

  const refresh = useCallback(async () => {
    if (activePlanId === null) {
      setScopes([]);
      setCapitalSystemIds([]);
      return;
    }
    const got = await evesov.plans.get(activePlanId);
    setScopes(got?.scopes ?? []);
    setCapitalSystemIds(got?.capitalSystemIds ?? []);
  }, [activePlanId]);

  useEffect(() => {
    void refresh();
    const off = evesov.events.on('plan-changed', () => {
      void refresh();
    });
    return off;
  }, [refresh]);

  const set = new Set(scopes.map((s) => scopeKey(s.scopeType, s.scopeId)));

  const toggle = useCallback(
    async (type: PlanScope['scopeType'], id: number) => {
      if (activePlanId === null) return;
      const got = await evesov.plans.get(activePlanId);
      const current = got?.scopes ?? [];
      const key = scopeKey(type, id);
      const next = current.some((s) => scopeKey(s.scopeType, s.scopeId) === key)
        ? current.filter((s) => scopeKey(s.scopeType, s.scopeId) !== key)
        : [...current, { scopeType: type, scopeId: id }];
      await evesov.plans.setScopes(activePlanId, next);
    },
    [activePlanId]
  );

  const capitalSet = new Set(capitalSystemIds);

  return {
    scopes,
    capitalSystemIds,
    has: (type, id) => set.has(scopeKey(type, id)),
    isCapital: (systemId) => capitalSet.has(systemId),
    toggle
  };
}
