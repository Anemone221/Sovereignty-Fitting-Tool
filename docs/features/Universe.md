# Universe explorer

## Purpose

The left-sidebar tree view of all of New Eden, presented as **region → constellation → system**. Lets the user filter by name, sov-eligibility, or claim status; click a system to focus it in `SystemDetail`; toggle each row in or out of the active plan's scope; mark a system as the plan's capital; and explode a region/constellation scope into per-system scopes.

## Schema

- `regions(id, name, faction_id)`, `constellations(id, region_id, name, faction_id)`, `systems(id, constellation_id, region_id, name, security_status, security_class)`.
- `system_budget` view — `sov_eligible` flag per system.
- `plan_scopes(plan_id, scope_type IN ('region','constellation','system'), scope_id)` — written by the scope toggle and explode action.
- `plan_capital_systems(plan_id, system_id)` — capital flag per plan.

## IPC

- `data.tree` — full hierarchy with `sovEligible` per system (~500 KB JSON).
- `plans.get(planId)` — returns `scopes` and `capitalSystemIds`.
- `plans.setScopes(planId, scopes[])` — toggle a scope at any level; cascades drop child rows when a parent is removed.
- `plans.explodeScope(planId, scopeType, scopeId)` — replace a region/constellation scope with per-system scopes for every sov-eligible child.
- `plans.removeSystem(planId, systemId)` — auto-explodes the parent if the system is only implicitly scoped (drops parent, inserts per-system scopes for siblings minus this one).
- `plans.setCapital(planId, systemId, isCapital)` — clears any prior capital then inserts; one-capital-per-plan enforced in IPC.
- Mutations broadcast `plan-changed`.

## Critical files

- `src/panels/TreeExplorer.tsx`
- `src/state/useActivePlanScopes.ts` — exposes `scopes`, `capitalSystemIds`, `has`, `isCapital`, `toggle`.
- `electron/ipc/data.ts` (`data.tree`)
- `electron/ipc/plans.ts` (`plans.setScopes`, `plans.explodeScope`, `plans.removeSystem`, `plans.setCapital`)
- `electron/db/schema.ts` — `plan_scopes`, `plan_capital_systems`

## Key decisions

- Tree fetched once and rendered fully in the renderer; filters are client-side. Switch to lazy loading if perf becomes an issue at New Eden's scale (~8500 systems).
- A constellation/system inherits its parent's scope ("implicit"); the per-row scope toggle is disabled in that case. To prune individuals out of a parent scope, use Explode (or rely on the Inspector × auto-explode).
- Text filter behaviour: matching ancestor keeps its full subtree; non-matching ancestors are pruned to just matching descendants.
- Sov-only and Claimed-only filters compose with the text filter and are persisted in `preferences` (`tree.sovOnly`, `tree.claimedOnly`).
- Count bar (`claimed / total` per region/constellation) is derived from the **unfiltered** tree so it always reflects the universe truth, not the current view. Turns green when `claimed === total`.
- Inside each constellation, systems split into **Claimed** / **Unclaimed** / **Other** (non-sov) sub-groups. Each group's open state is persisted globally (`tree.group.*`), defaults: Claimed open, Unclaimed open, Other closed. Groups force-open while filtering.
- Capital flag rendered as a yellow ⚑ glyph on the system row; set/cleared via right-click context menu. Setting a new capital clears the previous one (enforced in IPC).
- Explode is a separate `⤬` button on explicitly-scoped region/constellation rows. Hidden when the row is unscoped or implicit. Operates on sov-eligible children only.

## Implemented

- Region → constellation → system tree with text, sov-only, and claimed-only filters (filters persisted across reload).
- Per-row scope toggle with explicit/implicit states.
- Claim count bar (`claimed/total`) with `--full` modifier.
- Claimed / Unclaimed / Other sub-groups inside each constellation, with per-group collapse persisted across reload.
- Capital flag (⚑) with right-click "Set as capital" / "Clear capital".
- Explode region/constellation scope into per-system scopes (`⤬` button).
- Inspector `×` auto-explodes the parent scope when a system is only implicitly scoped.

## Not implemented

- Balance-state indicator per system row (over budget / capacity remaining / not in plan) — only sov eligibility is currently shown.
- Capital ⚑ mirrored in `SystemDetail` header.
- Bulk multi-select (e.g. shift-click a range of systems to scope/unscope at once).
