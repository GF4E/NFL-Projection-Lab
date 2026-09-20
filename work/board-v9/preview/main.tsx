import React from 'react';import {createRoot} from 'react-dom/client';import {BoardViewV9} from '../../../src/components/board-v9';import {board as original,evidence} from '../../../tests/board-v8-fixture';import {context} from '../../../tests/board-v9-fixture';
const board={...original,games:original.games.map(g=>({...g,team_colors:{...g.team_colors,DET:'#0076B6',BUF:'#00338D',BAL:'#9E7C0C',NO:'#D3BC8D'}}))};
const data=location.search.includes('live')?await fetch('/live.json').then(r=>r.json() as Promise<{board:typeof board;evidence:typeof evidence;context:typeof context}>):{board,evidence,context};
createRoot(document.getElementById('root')!).render(<BoardViewV9 {...data}/>);
