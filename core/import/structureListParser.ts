import type { StructureLocation, StructureType } from "@shared/index";

/**
 * Parser for text copied from EVE's corporation Structures window.
 *
 * Each structure in the paste looks like:
 *
 *   State <TAB> Region <TAB> System          ← first line
 *   Name
 *   <Corp> logo                              (ignored)
 *   Corporation                              (ignored)
 *   Type <TAB> Fuel <TAB> LP <TAB> ...       ← Type column used for the type
 *   Synced                                   (ignored)
 *
 * Columns are separated by a tab, or by a run of two or more spaces: EVE
 * copies with tabs, but editors and chat apps often turn them into spaces on
 * the way. Single spaces are never a separator ("Shield (Vulnerable)",
 * "Pure Blind"). Limitation: in a space-separated paste, a name containing two
 * separate double spaces splits into three columns and is mistaken for a
 * structure's first line; tab-separated pastes are unaffected.
 *
 * A structure starts on a line with exactly three non-empty columns. The next
 * non-empty line is the name. The first line after that with two or more
 * columns is the Type/Fuel line, whose first column is the type. Everything
 * else (header labels, logo, corporation, fuel, state, sync status) is
 * ignored, so the parser does not depend on how many lines a structure takes.
 */

export interface ParsedStructureRow {
    systemName: string;
    name: string;
    /** First part of the Type/Fuel line, e.g. "Metenox Moon Drill"; null if absent. */
    typeText: string | null;
    /** 1-based line number of the structure's first line in the paste. */
    line: number;
}

const COLUMN_SEPARATOR = /\t| {2,}/;

function columns(line: string): string[] {
    return line.split(COLUMN_SEPARATOR).map((p) => p.trim());
}

function isFirstLine(line: string): boolean {
    const parts = columns(line);
    return parts.length === 3 && parts.every((p) => p.length > 0);
}

export function parseStructureList(text: string): ParsedStructureRow[] {
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const rows: ParsedStructureRow[] = [];

    let i = 0;
    while (i < lines.length) {
        if (!isFirstLine(lines[i])) {
            i++;
            continue;
        }
        const firstLineIndex = i;
        const systemName = columns(lines[i])[2];

        // Name: next non-empty line. It must not contain a tab or be another
        // structure's first line. Runs of spaces are allowed, since a player
        // may put a double space in a structure name.
        let j = i + 1;
        while (j < lines.length && lines[j] === "") j++;
        if (j >= lines.length || lines[j].includes("\t") || isFirstLine(lines[j])) {
            i++;
            continue;
        }
        const name = lines[j];

        // Type: first line with 2+ columns before the next structure's first line.
        let typeText: string | null = null;
        let k = j + 1;
        while (k < lines.length && !isFirstLine(lines[k])) {
            const parts = columns(lines[k]);
            if (parts.length >= 2) {
                typeText = parts[0] || null;
                k++;
                break;
            }
            k++;
        }

        rows.push({ systemName, name, typeText, line: firstLineIndex + 1 });
        i = k;
    }

    return rows;
}

/**
 * Keyword table shared by the name-based per-system import and the
 * Type-column mapping. Order matters: the first match wins.
 */
const TYPE_KEYWORDS: [string, StructureType, StructureLocation][] = [
    ["keepstar", "Keepstar", "Deep"],
    ["fortizar", "Fortizar", "Deep"],
    ["astrahus", "Astrahus", "Deep"],
    ["azbel", "Azbel", "Deep"],
    ["raitaru", "Raitaru", "Deep"],
    ["tenebrex", "Tenebrex", "Deep"],
    ["pharolux", "Pharolux", "Deep"],
    ["ansiblex", "Ansiblex", "Gate"],
    ["metenox", "Metenox", "Moon"],
    ["athanor", "Athanor", "Moon"],
    ["tatara", "Tatara", "Moon"],
    ["sotiyo", "Sotiyo", "Deep"],
];

export interface StructureTypeMatch {
    structureType: StructureType;
    location: StructureLocation | null;
}

export function matchStructureKeyword(text: string): StructureTypeMatch {
    const l = text.toLowerCase();
    for (const [keyword, structureType, location] of TYPE_KEYWORDS) {
        if (l.includes(keyword)) return { structureType, location };
    }
    return { structureType: "Other", location: null };
}

/**
 * Maps the paste's Type column to a structure type. Never looks at the
 * structure name: a missing or unrecognised type gives "Other".
 */
export function typeFromColumn(typeText: string | null): StructureTypeMatch {
    if (!typeText) return { structureType: "Other", location: null };
    return matchStructureKeyword(typeText);
}
