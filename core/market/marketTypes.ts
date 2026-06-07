// Constants for the market sync + profitability pipeline.
//
// Type IDs and reprocessing yields are hardcoded per the approved plan
// (so-we-want-to-radiant-penguin.md). Yields are per 100 units (= 1000 m^3)
// of moon ore at 100% efficiency. Multiply by structure efficiency at the
// calculation site (0.40 Metenox, 0.96 Athanor/Tatara).
//
// NOTE: yield numbers are tunable; if CCP rebalances or you find a
// discrepancy with in-game reprocessing, edit the table below and re-run.

export const FORGE_REGION_ID = 10000002;

// Moon goo type IDs. Stable since the 2018 moon-mining revamp.
export const GOO_TYPE_IDS = {
  // R4
  hydrocarbons: 16633,
  silicates: 16634,
  evaporiteDeposits: 16635,
  atmosphericGases: 16636,
  // R8
  cobalt: 16640,
  scandium: 16639,
  titanium: 16638,
  tungsten: 16637,
  // R16
  cadmium: 16641,
  chromium: 16642,
  platinum: 16644,
  vanadium: 16643,
  // R32
  caesium: 16646,
  hafnium: 16648,
  mercury: 16647,
  technetium: 16649,
  // R64
  dysprosium: 16650,
  neodymium: 16651,
  promethium: 16652,
  thulium: 16653,
} as const;

export type GooKey = keyof typeof GOO_TYPE_IDS;

export const FUEL_BLOCK_TYPE_ID = 4051;     // Nitrogen Fuel Block
export const MAGMATIC_GAS_TYPE_ID = 81143;  // Magmatic Gas

// All four racial fuel blocks burn at the same rate. Nitrogen is the price
// baseline; a future improvement could pick the cheapest of the four.
export const ALL_FUEL_BLOCK_TYPE_IDS = [4051, 4246, 4247, 4312] as const;

// Map keys match the canonical ore names in moonScans.ts ORE_TIERS so the
// existing substring matcher there can be reused for variant ores.
export const MOON_ORE_YIELDS: Record<string, Partial<Record<GooKey, number>>> = {
  // R4
  Bitumens:    { hydrocarbons: 65, atmosphericGases: 35 },
  Coesite:     { silicates: 65, hydrocarbons: 35 },
  Sylvite:     { evaporiteDeposits: 65, atmosphericGases: 35 },
  Zeolites:    { atmosphericGases: 65, evaporiteDeposits: 35 },
  // R8
  Cobaltite:   { cobalt: 40, atmosphericGases: 60 },
  Euxenite:    { scandium: 40, hydrocarbons: 60 },
  Scheelite:   { tungsten: 40, evaporiteDeposits: 60 },
  Titanite:    { titanium: 40, silicates: 60 },
  // R16
  Chromite:    { chromium: 21, hydrocarbons: 79 },
  Otavite:     { cadmium: 21, atmosphericGases: 79 },
  Sperrylite:  { platinum: 21, silicates: 79 },
  Vanadinite:  { vanadium: 21, evaporiteDeposits: 79 },
  // R32
  Carnotite:   { technetium: 10, cobalt: 10, atmosphericGases: 80 },
  Cinnabar:    { mercury: 10, silicates: 90 },
  Pollucite:   { caesium: 10, hydrocarbons: 90 },
  Zircon:      { hafnium: 10, evaporiteDeposits: 90 },
  // R64
  Loparite:    { promethium: 22, mercury: 8, hydrocarbons: 70 },
  Monazite:    { neodymium: 22, chromium: 8, atmosphericGases: 70 },
  Xenotime:    { dysprosium: 22, vanadium: 8, hydrocarbons: 70 },
  Ytterbite:   { thulium: 22, cadmium: 8, silicates: 70 },
};

export const ORE_VOLUME_M3 = 10;
export const DRILL_RATE_M3_PER_HOUR = 30_000;

export const EFFICIENCY = {
  Metenox: 0.40,
  Athanor: 0.96,
  Tatara: 0.96,
} as const;

export const FUEL_PER_HOUR = {
  Metenox: { fuelBlocks: 5, magmaticGas: 200 },
  Athanor: { fuelBlocks: 5, magmaticGas: 0 },
  Tatara:  { fuelBlocks: 5, magmaticGas: 0 },
} as const;

// Type IDs the market sync needs to download.
export function allTrackedTypeIds(): number[] {
  const ids = new Set<number>();
  for (const id of Object.values(GOO_TYPE_IDS)) ids.add(id);
  for (const id of ALL_FUEL_BLOCK_TYPE_IDS) ids.add(id);
  ids.add(MAGMATIC_GAS_TYPE_ID);
  return Array.from(ids);
}
