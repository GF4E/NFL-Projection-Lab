// @vitest-environment jsdom
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {GameCardBoard} from '../src/components/game-card-board';
import fixtures from './fixtures/game-card-v3.json';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const board={default_week:1,card_records:{'1':[{label:'MODEL',text:'1–1–0'},{label:'PRICE',text:'0–1–0'},{label:'RULES',text:'0–0–0'},{label:'OURS',text:'0–1–1'}]},games:[{game_id:'2026_01_SF_LA',week:1,season:2026,status:'FINAL',home_team:'Los Angeles Rams',away_team:'San Francisco 49ers',home_abbr:'LA',away_abbr:'SF',card_v3:fixtures['G6-sf']}]};
it('renders shared records, preserves historical grades, expands the measured sheet',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>board})));const {container}=render(<GameCardBoard/>);await screen.findByText('SF +3.5');expect(container.textContent).not.toMatch(/Jarrett|Gabe/);expect(screen.getByText('OURS')).toBeTruthy();expect(screen.getByText('WIN')).toBeTruthy();expect(screen.getAllByText('LOSS').length).toBeGreaterThan(0);expect(container.querySelector('.gc-nr')?.textContent).toBe('NOT_RECORDED');fireEvent.click(screen.getByRole('button',{name:'Expand ↓'}));expect(screen.getByText('Our number')).toBeTruthy();expect(screen.getByText('4 · Efficiency')).toBeTruthy();expect(screen.queryByLabelText('Personal edit code')).toBeNull();});
