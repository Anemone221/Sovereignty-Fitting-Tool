import { describe, expect, it } from 'vitest';
import { parseStructureList, typeFromColumn } from './structureListParser.js';

// Copied from EVE's corporation Structures window (columns are tab-separated).
const SAMPLE = [
    'State',
    '',
    'Region',
    '',
    'System',
    '',
    'Name',
    '',
    'Corporation',
    '',
    'Type',
    '',
    'Fuel',
    'LP\tLP Allowed',
    'Next State In',
    'Group\tSync',
    'Shield (Vulnerable)\tPure Blind\tB8EN-S',
    "B8EN-S - Squad V's Pain",
    'TEST Infrastructure as a Service logo',
    'TEST Infrastructure as a Service',
    'Fortizar\t3w 5d 11h\tNo\tNo\t-\t-',
    'Synced',
    'Shield (Vulnerable)\tPure Blind\tEL8-4Q',
    'EL8-4Q - Constellation Center',
    'TEST Infrastructure as a Service logo',
    'TEST Infrastructure as a Service',
    'Fortizar\t1mo 1w 3d\tNo\tNo\t-\t-',
    'Synced',
    'Shield (Vulnerable)\tDeklein\tCCP-US',
    'CCP-US - 11-1',
    'TEST Infrastructure as a Service logo',
    'TEST Infrastructure as a Service',
    'Metenox Moon Drill\t3w 1d 12h\tNo\tNo\t-\t-',
    'Synced',
].join('\n');

describe('parseStructureList', () => {
    it('parses the sample paste into system, name and type', () => {
        expect(parseStructureList(SAMPLE)).toEqual([
            { systemName: 'B8EN-S', name: "B8EN-S - Squad V's Pain", typeText: 'Fortizar', line: 17 },
            { systemName: 'EL8-4Q', name: 'EL8-4Q - Constellation Center', typeText: 'Fortizar', line: 23 },
            { systemName: 'CCP-US', name: 'CCP-US - 11-1', typeText: 'Metenox Moon Drill', line: 29 },
        ]);
    });

    it('handles CRLF line endings', () => {
        const rows = parseStructureList(SAMPLE.replace(/\n/g, '\r\n'));
        expect(rows.map((r) => r.name)).toEqual([
            "B8EN-S - Squad V's Pain",
            'EL8-4Q - Constellation Center',
            'CCP-US - 11-1',
        ]);
        expect(rows[2].typeText).toBe('Metenox Moon Drill');
    });

    it('accepts runs of spaces instead of tabs', () => {
        expect(parseStructureList(SAMPLE.replace(/\t/g, '    '))).toEqual(
            parseStructureList(SAMPLE),
        );
    });

    it('parses a space-separated paste with eight structures', () => {
        const S = '    ';
        const structure = (state: string, region: string, system: string, name: string, typeLine: string) => [
            [state, region, system].join(S),
            name,
            'TEST Infrastructure as a Service logo',
            'TEST Infrastructure as a Service',
            typeLine,
            'Synced',
        ];
        const text = [
            ...SAMPLE.split('\n').slice(0, 16).map((l) => l.replace(/\t/g, S)),
            ...structure('Shield (Vulnerable)', 'Pure Blind', 'B8EN-S', "B8EN-S - Squad V's Pain", ['Fortizar', '3w 5d 11h', 'No', 'No', '-', '-'].join(S)),
            ...structure('Shield (Vulnerable)', 'Pure Blind', 'EL8-4Q', 'EL8-4Q - Constellation Center', ['Fortizar', '1mo 1w 3d', 'No', 'No', '-', '-'].join(S)),
            ...structure('Shield (Vulnerable)', 'Pure Blind', 'RD-G2R', 'RD-G2R - Bin Chicken Cafe DO NOT USE', ['Fortizar', '3w 5d 2h', 'No', 'No', '2d 13h 36m', '-'].join(S)),
            ...structure('Shield (Vulnerable)', 'Deklein', 'DKUK-G', 'DKUK-G - Tuda', ['Fortizar', '1w 4d 6h', 'No', 'No', '-', '-'].join(S)),
            ...structure('Shield (Vulnerable)', 'Fade', 'E-9ORY', 'E-9ORY - Oxygen 4 All', ['Fortizar', '3w 3d 2h', 'No', 'No', '-', '-'].join(S)),
            ...structure('Shield (Vulnerable)', 'Deklein', 'CCP-US', 'CCP-US - The Promised Land', ['Fortizar', '1w 1d 2h', 'No', 'No', '-', '-'].join(S)),
            ...structure('Shield (Vulnerable)', 'Pure Blind', 'R-LW2I', 'R-LW2I - Eye of Sauron', ['Fortizar', '3w 3d 20h', 'No', 'No', '-', '-'].join(S)),
            ...structure('Anchoring (Invulnerable)', 'Pure Blind', 'ZKYV-W', 'ZKYV-W - Dreddit is recruiting', ['Fortizar', '-', 'Yes', 'No', '22h 47m 6s', '-'].join(S)),
        ].join('\n');

        const rows = parseStructureList(text);
        expect(rows.map((r) => [r.systemName, r.name, r.typeText])).toEqual([
            ['B8EN-S', "B8EN-S - Squad V's Pain", 'Fortizar'],
            ['EL8-4Q', 'EL8-4Q - Constellation Center', 'Fortizar'],
            ['RD-G2R', 'RD-G2R - Bin Chicken Cafe DO NOT USE', 'Fortizar'],
            ['DKUK-G', 'DKUK-G - Tuda', 'Fortizar'],
            ['E-9ORY', 'E-9ORY - Oxygen 4 All', 'Fortizar'],
            ['CCP-US', 'CCP-US - The Promised Land', 'Fortizar'],
            ['R-LW2I', 'R-LW2I - Eye of Sauron', 'Fortizar'],
            ['ZKYV-W', 'ZKYV-W - Dreddit is recruiting', 'Fortizar'],
        ]);
    });

    it('keeps a double space inside a structure name', () => {
        const text = [
            'Shield (Vulnerable)    Deklein    CCP-US',
            'CCP-US -  Promised Land',
            'Fortizar    1w    No    No    -    -',
        ].join('\n');
        expect(parseStructureList(text)).toEqual([
            { systemName: 'CCP-US', name: 'CCP-US -  Promised Land', typeText: 'Fortizar', line: 1 },
        ]);
    });

    it('returns nothing for the header block alone', () => {
        const header = SAMPLE.split('\n').slice(0, 16).join('\n');
        expect(parseStructureList(header)).toEqual([]);
    });

    it('works without the logo line', () => {
        const text = [
            'Shield (Vulnerable)\tDeklein\tCCP-US',
            'CCP-US - 11-1',
            'TEST Infrastructure as a Service',
            'Metenox Moon Drill\t3w 1d 12h\tNo\tNo\t-\t-',
            'Synced',
        ].join('\n');
        expect(parseStructureList(text)).toEqual([
            { systemName: 'CCP-US', name: 'CCP-US - 11-1', typeText: 'Metenox Moon Drill', line: 1 },
        ]);
    });

    it('ignores a first line at the end with no name after it', () => {
        const text = SAMPLE + '\nShield (Vulnerable)\tDeklein\tCCP-US\n';
        expect(parseStructureList(text)).toHaveLength(3);
    });

    it('gives a null type when there is no Type/Fuel line', () => {
        const text = [
            'Shield (Vulnerable)\tPure Blind\tB8EN-S',
            'B8EN-S - No Type Line',
            'Synced',
            'Shield (Vulnerable)\tDeklein\tCCP-US',
            'CCP-US - 11-1',
            'Metenox Moon Drill\t3w 1d 12h',
        ].join('\n');
        const rows = parseStructureList(text);
        expect(rows).toHaveLength(2);
        expect(rows[0].typeText).toBeNull();
        expect(rows[1].typeText).toBe('Metenox Moon Drill');
    });

    it('returns nothing for the plain one-name-per-line format', () => {
        expect(parseStructureList('B8EN-S - Keepstar\nEL8-4Q - Fortizar\n')).toEqual([]);
    });
});

describe('typeFromColumn', () => {
    it('maps the Type column to type and location', () => {
        expect(typeFromColumn('Fortizar')).toEqual({ structureType: 'Fortizar', location: 'Deep' });
        expect(typeFromColumn('Metenox Moon Drill')).toEqual({ structureType: 'Metenox', location: 'Moon' });
        expect(typeFromColumn('Ansiblex Jump Bridge')).toEqual({ structureType: 'Ansiblex', location: 'Gate' });
    });

    it('gives Other for a missing or unknown type', () => {
        expect(typeFromColumn(null)).toEqual({ structureType: 'Other', location: null });
        expect(typeFromColumn('')).toEqual({ structureType: 'Other', location: null });
        expect(typeFromColumn('Upwell Cyno Jammer')).toEqual({ structureType: 'Other', location: null });
    });

    it('uses the Type column, never the name', () => {
        const text = [
            'Shield (Vulnerable)\tDeklein\tCCP-US',
            'Keepstar Party',
            'Astrahus\t1w\tNo\tNo\t-\t-',
        ].join('\n');
        const [row] = parseStructureList(text);
        expect(row.name).toBe('Keepstar Party');
        expect(typeFromColumn(row.typeText).structureType).toBe('Astrahus');
    });
});
