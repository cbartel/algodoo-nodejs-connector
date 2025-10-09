import type { MutableRefObject } from 'react';
export interface StandRow {
    id: string;
    name: string;
    total: number;
    colorHex: string;
}
export default function StandingsTable({ standings, nameRefs, tableRef, limit }: {
    standings: StandRow[];
    nameRefs: MutableRefObject<Record<string, HTMLElement | null>>;
    tableRef: MutableRefObject<HTMLDivElement | null>;
    limit?: number;
}): import("react/jsx-runtime").JSX.Element;
