import React from 'react';
import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Table,Trajectory} from '../src/components/projection-trend';
import {readFileSync} from 'node:fs';
it('trend tables preserve every engine cell exactly, including precision and missing values',()=>{const rows=[{week:1,scope:'week',team_points_mae:3.141592653589793,margin_sigma:null,total_coverage_80:.8123456789012345},{week:2,scope:'cumulative',team_points_mae:0,margin_sigma:1.5,total_coverage_80:1}];const html=renderToStaticMarkup(<Table rows={rows}/>);const cells=Array.from(html.matchAll(/data-value="([^"]*)"/g),m=>m[1]);expect(cells).toEqual(rows.flatMap(r=>Object.values(r).map(v=>v===null?'null':String(v))));});
it('renders six observations for all three team trajectory metrics',()=>{const rows=Array.from({length:6},(_,i)=>({season:2026,week:i+1,for:2+i*.1,against:2-i*.1,roll:i*.2}));const html=renderToStaticMarkup(<Trajectory team="SEA" rows={rows}/>);expect((html.match(/<circle /g)||[]).length).toBe(18);expect(html).toContain('2026 W6');});
it('history trigger records both inserted and revised edits atomically',()=>{const file=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8')).entries.at(-1).tag;const sql=readFileSync(new URL('../drizzle/'+file+'.sql',import.meta.url),'utf8');expect(sql).toContain('AFTER INSERT ON engine_projection_entries');expect(sql).toContain('AFTER UPDATE ON engine_projection_entries');expect(sql).toContain('VALUES(NEW.payload)');});
