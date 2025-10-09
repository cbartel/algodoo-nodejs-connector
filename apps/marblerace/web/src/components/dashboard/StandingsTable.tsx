import { Table } from 'marblerace-ui-kit';
import React from 'react';

import type { MutableRefObject } from 'react';

export interface StandRow { id: string; name: string; total: number; colorHex: string }

export default function StandingsTable({ standings, nameRefs, tableRef, limit = 10 }:
  { standings: StandRow[]; nameRefs: MutableRefObject<Record<string, HTMLElement | null>>; tableRef: MutableRefObject<HTMLDivElement | null>; limit?: number }) {
  return (
    <div style={{ minHeight: 0, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: '#9df', fontWeight: 700 }}>Standings</span>
        <span style={{ color: '#7b8a9a', fontSize: 12 }}>Top {limit}</span>
      </div>
      <div ref={tableRef as any} style={{ fontSize: 13, lineHeight: 1.1 }}>
        <Table
          headers={["#", "Player", "Total"]}
          rows={standings.slice(0, limit).map((p: any, i: number) => [
            i+1,
            <span
              key={`${p.id||p.name}-name`}
              ref={(el) => { if (el) nameRefs.current[String(p.id||p.name)] = el; }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span title="player color" style={{ width: 10, height: 10, borderRadius: '50%', border: '3px solid #333', display: 'inline-block', background: p.colorHex }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{p.name}</span>
            </span>,
            p.total
          ])}
        />
      </div>
    </div>
  );
}
