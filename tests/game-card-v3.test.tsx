import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {GameCard} from '../src/components/game-card-v3';
import type {Card} from '../src/domain/game-card-v3';
import fixtures from './fixtures/game-card-v3.json';
import {validShared,footballOnly} from '../src/server/card-entry';
describe('Game Card v3 final states',()=>{for(const [name,value] of Object.entries(fixtures)){for(const width of [390,1280])it(`${name} at ${width}`,()=>{const html=renderToStaticMarkup(<div className="gc-root" style={{width}}><GameCard card={value as unknown as Card}/></div>);expect(html).toMatchSnapshot();expect(html).not.toMatch(/Jarrett|Gabe|BetMGM|Caesars|FanDuel|DraftKings|Add to slip|Choose another side or book|break-even|\bEV\b/);expect(html).toContain('Line:');expect(html).toContain('tabindex="0"');});}
 it('NOT_RECORDED is never graded as a loss',()=>{for(const name of ['G6-sea','G6-sf','G7-missed'] as const){const c=fixtures[name];for(const t of Object.values(c.tiles)){if(t.pick===null)expect(t.grade).toBe('NOT_RECORDED');}}});
 it('football input rejects forbidden content',()=>{const entry={spread:-3,total:44,confidence:3,tags:['trenches'],text:'Our pass rush can disrupt their protection'};expect(validShared(entry)).toBe(true);for(const bad of ['price','book','cents','break-even','EV','cushion','reference','filter','stale','Jarrett','Gabe','$']){expect(footballOnly(bad)).toBe(false);expect(validShared({...entry,text:bad})).toBe(false);}});
 it('accepts only finite inputs and confidence levels',()=>{expect(validShared({spread:NaN,total:44,confidence:7,tags:['trenches'],text:''})).toBe(false);});
});
