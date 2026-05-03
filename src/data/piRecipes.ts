// AUTO-GENERATED from outside_resources/SDE_Resources/planetSchematics.jsonl.
// Re-run scripts/build-pi-recipes if CCP changes schematics.

export type PlanetType =
    | 'Barren' | 'Gas' | 'Ice' | 'Lava' | 'Oceanic' | 'Plasma' | 'Storm' | 'Temperate';

export const PLANET_TYPES: PlanetType[] = [
    'Barren', 'Gas', 'Ice', 'Lava', 'Oceanic', 'Plasma', 'Storm', 'Temperate',
];

// From the resource-distribution matrix; each planet type yields these P0 raw materials.
export const PLANET_TYPE_TO_P0: Record<PlanetType, string[]> = {
    Barren: ['Aqueous Liquids', 'Base Metals', 'Carbon Compounds', 'Microorganisms', 'Noble Metals'],
    Gas: ['Aqueous Liquids', 'Base Metals', 'Ionic Solutions', 'Noble Gas', 'Reactive Gas'],
    Ice: ['Aqueous Liquids', 'Heavy Metals', 'Microorganisms', 'Noble Gas', 'Planktic Colonies'],
    Lava: ['Base Metals', 'Felsic Magma', 'Heavy Metals', 'Non-Cs Crystals', 'Suspended Plasma'],
    Oceanic: ['Aqueous Liquids', 'Carbon Compounds', 'Complex Organisms', 'Microorganisms', 'Planktic Colonies'],
    Plasma: ['Base Metals', 'Heavy Metals', 'Ionic Solutions', 'Noble Metals', 'Non-Cs Crystals'],
    Storm: ['Aqueous Liquids', 'Ionic Solutions', 'Noble Gas', 'Reactive Gas', 'Suspended Plasma'],
    Temperate: ['Aqueous Liquids', 'Autotrophs', 'Carbon Compounds', 'Complex Organisms', 'Microorganisms'],
};

export const P0_TO_P1: Record<string, string> = {
    'Aqueous Liquids': 'Water',
    'Autotrophs': 'Industrial Fibers',
    'Base Metals': 'Reactive Metals',
    'Carbon Compounds': 'Biofuels',
    'Complex Organisms': 'Proteins',
    'Felsic Magma': 'Silicon',
    'Heavy Metals': 'Toxic Metals',
    'Ionic Solutions': 'Electrolytes',
    'Microorganisms': 'Bacteria',
    'Noble Gas': 'Oxygen',
    'Noble Metals': 'Precious Metals',
    'Non-Cs Crystals': 'Chiral Structures',
    'Planktic Colonies': 'Biomass',
    'Reactive Gas': 'Oxidizing Compound',
    'Suspended Plasma': 'Plasmoids',
};

export interface PiRecipe { name: string; tier: 1 | 2 | 3 | 4; inputs: string[] }

export const PI_RECIPES: PiRecipe[] = [
    { name: 'Bacteria', tier: 1, inputs: [] },
    { name: 'Biofuels', tier: 1, inputs: [] },
    { name: 'Biomass', tier: 1, inputs: [] },
    { name: 'Chiral Structures', tier: 1, inputs: [] },
    { name: 'Electrolytes', tier: 1, inputs: [] },
    { name: 'Industrial Fibers', tier: 1, inputs: [] },
    { name: 'Oxidizing Compound', tier: 1, inputs: [] },
    { name: 'Oxygen', tier: 1, inputs: [] },
    { name: 'Plasmoids', tier: 1, inputs: [] },
    { name: 'Precious Metals', tier: 1, inputs: [] },
    { name: 'Proteins', tier: 1, inputs: [] },
    { name: 'Reactive Metals', tier: 1, inputs: [] },
    { name: 'Silicon', tier: 1, inputs: [] },
    { name: 'Toxic Metals', tier: 1, inputs: [] },
    { name: 'Water', tier: 1, inputs: [] },
    { name: 'Biocells', tier: 2, inputs: ['Biofuels', 'Precious Metals'] },
    { name: 'Construction Blocks', tier: 2, inputs: ['Reactive Metals', 'Toxic Metals'] },
    { name: 'Consumer Electronics', tier: 2, inputs: ['Chiral Structures', 'Toxic Metals'] },
    { name: 'Coolant', tier: 2, inputs: ['Electrolytes', 'Water'] },
    { name: 'Enriched Uranium', tier: 2, inputs: ['Precious Metals', 'Toxic Metals'] },
    { name: 'Fertilizer', tier: 2, inputs: ['Bacteria', 'Proteins'] },
    { name: 'Genetically Enhanced Livestock', tier: 2, inputs: ['Biomass', 'Proteins'] },
    { name: 'Livestock', tier: 2, inputs: ['Biofuels', 'Proteins'] },
    { name: 'Mechanical Parts', tier: 2, inputs: ['Precious Metals', 'Reactive Metals'] },
    { name: 'Microfiber Shielding', tier: 2, inputs: ['Industrial Fibers', 'Silicon'] },
    { name: 'Miniature Electronics', tier: 2, inputs: ['Chiral Structures', 'Silicon'] },
    { name: 'Nanites', tier: 2, inputs: ['Bacteria', 'Reactive Metals'] },
    { name: 'Oxides', tier: 2, inputs: ['Oxidizing Compound', 'Oxygen'] },
    { name: 'Polyaramids', tier: 2, inputs: ['Industrial Fibers', 'Oxidizing Compound'] },
    { name: 'Polytextiles', tier: 2, inputs: ['Biofuels', 'Industrial Fibers'] },
    { name: 'Rocket Fuel', tier: 2, inputs: ['Electrolytes', 'Plasmoids'] },
    { name: 'Silicate Glass', tier: 2, inputs: ['Oxidizing Compound', 'Silicon'] },
    { name: 'Superconductors', tier: 2, inputs: ['Plasmoids', 'Water'] },
    { name: 'Supertensile Plastics', tier: 2, inputs: ['Biomass', 'Oxygen'] },
    { name: 'Synthetic Oil', tier: 2, inputs: ['Electrolytes', 'Oxygen'] },
    { name: 'Test Cultures', tier: 2, inputs: ['Bacteria', 'Water'] },
    { name: 'Transmitter', tier: 2, inputs: ['Chiral Structures', 'Plasmoids'] },
    { name: 'Viral Agent', tier: 2, inputs: ['Bacteria', 'Biomass'] },
    { name: 'Water-Cooled CPU', tier: 2, inputs: ['Reactive Metals', 'Water'] },
    { name: 'Biotech Research Reports', tier: 3, inputs: ['Construction Blocks', 'Livestock', 'Nanites'] },
    { name: 'Camera Drones', tier: 3, inputs: ['Rocket Fuel', 'Silicate Glass'] },
    { name: 'Condensates', tier: 3, inputs: ['Coolant', 'Oxides'] },
    { name: 'Cryoprotectant Solution', tier: 3, inputs: ['Fertilizer', 'Synthetic Oil', 'Test Cultures'] },
    { name: 'Data Chips', tier: 3, inputs: ['Microfiber Shielding', 'Supertensile Plastics'] },
    { name: 'Gel-Matrix Biopaste', tier: 3, inputs: ['Biocells', 'Oxides', 'Superconductors'] },
    { name: 'Guidance Systems', tier: 3, inputs: ['Transmitter', 'Water-Cooled CPU'] },
    { name: 'Hazmat Detection Systems', tier: 3, inputs: ['Polytextiles', 'Transmitter', 'Viral Agent'] },
    { name: 'Hermetic Membranes', tier: 3, inputs: ['Genetically Enhanced Livestock', 'Polyaramids'] },
    { name: 'High-Tech Transmitter', tier: 3, inputs: ['Polyaramids', 'Transmitter'] },
    { name: 'Industrial Explosives', tier: 3, inputs: ['Fertilizer', 'Polytextiles'] },
    { name: 'Neocoms', tier: 3, inputs: ['Biocells', 'Silicate Glass'] },
    { name: 'Nuclear Reactors', tier: 3, inputs: ['Enriched Uranium', 'Microfiber Shielding'] },
    { name: 'Planetary Vehicles', tier: 3, inputs: ['Mechanical Parts', 'Miniature Electronics', 'Supertensile Plastics'] },
    { name: 'Robotics', tier: 3, inputs: ['Consumer Electronics', 'Mechanical Parts'] },
    { name: 'Smartfab Units', tier: 3, inputs: ['Construction Blocks', 'Miniature Electronics'] },
    { name: 'Supercomputers', tier: 3, inputs: ['Consumer Electronics', 'Coolant', 'Water-Cooled CPU'] },
    { name: 'Synthetic Synapses', tier: 3, inputs: ['Supertensile Plastics', 'Test Cultures'] },
    { name: 'Transcranial Microcontroller', tier: 3, inputs: ['Biocells', 'Nanites'] },
    { name: 'Ukomi Superconductor', tier: 3, inputs: ['Superconductors', 'Synthetic Oil'] },
    { name: 'Vaccines', tier: 3, inputs: ['Livestock', 'Viral Agent'] },
    { name: 'Broadcast Node', tier: 4, inputs: ['Data Chips', 'High-Tech Transmitter', 'Neocoms'] },
    { name: 'Integrity Response Drones', tier: 4, inputs: ['Gel-Matrix Biopaste', 'Hazmat Detection Systems', 'Planetary Vehicles'] },
    { name: 'Nano-Factory', tier: 4, inputs: ['Industrial Explosives', 'Reactive Metals', 'Ukomi Superconductor'] },
    { name: 'Organic Mortar Applicators', tier: 4, inputs: ['Bacteria', 'Condensates', 'Robotics'] },
    { name: 'Recursive Computing Module', tier: 4, inputs: ['Guidance Systems', 'Synthetic Synapses', 'Transcranial Microcontroller'] },
    { name: 'Self-Harmonizing Power Core', tier: 4, inputs: ['Camera Drones', 'Hermetic Membranes', 'Nuclear Reactors'] },
    { name: 'Sterile Conduits', tier: 4, inputs: ['Smartfab Units', 'Vaccines', 'Water'] },
    { name: 'Wetware Mainframe', tier: 4, inputs: ['Biotech Research Reports', 'Cryoprotectant Solution', 'Supercomputers'] },
];

export interface ProducibleSet {
    p0: Set<string>;
    p1: Set<string>;
    p2: Set<string>;
    p3: Set<string>;
    p4: Set<string>;
}

export function producibleFromPlanets(types: (PlanetType | null)[]): ProducibleSet {
    const p0 = new Set<string>();
    for (const t of types) {
        if (!t) continue;
        const list = PLANET_TYPE_TO_P0[t];
        if (list) for (const m of list) p0.add(m);
    }
    const p1 = new Set<string>();
    for (const m of p0) {
        const out = P0_TO_P1[m];
        if (out) p1.add(out);
    }
    const known = new Set<string>([...p0, ...p1]);
    const tiers: Record<2 | 3 | 4, Set<string>> = { 2: new Set(), 3: new Set(), 4: new Set() };
    let changed = true;
    while (changed) {
        changed = false;
        for (const r of PI_RECIPES) {
            if (r.tier === 1) continue;
            if (known.has(r.name)) continue;
            if (r.inputs.every((i) => known.has(i))) {
                tiers[r.tier].add(r.name);
                known.add(r.name);
                changed = true;
            }
        }
    }
    return { p0, p1, p2: tiers[2], p3: tiers[3], p4: tiers[4] };
}

export function highestProducibleTier(s: ProducibleSet): 0 | 1 | 2 | 3 | 4 {
    if (s.p4.size > 0) return 4;
    if (s.p3.size > 0) return 3;
    if (s.p2.size > 0) return 2;
    if (s.p1.size > 0) return 1;
    return 0;
}
