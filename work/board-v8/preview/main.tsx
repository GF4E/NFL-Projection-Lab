import React from 'react';import {createRoot} from 'react-dom/client';import {BoardViewV8} from '../../../src/components/board-v8';import {board,evidence,books} from '../../../tests/board-v8-fixture';
const data=location.search.includes('live')?await fetch('/live.json').then(r=>r.json() as Promise<{board:typeof board;evidence:typeof evidence;books:typeof books}>):{board,evidence,books};
if(location.search.includes('thresholds')){data.board.games=[{...board.games[1],projection:{...board.games[1].projection!,margin:6,total:50.5}},{...board.games[1],game_id:'near',projection:{...board.games[1].projection!,margin:5.9,total:50.4}}];data.books.games.near={...data.books.games.final};}
createRoot(document.getElementById('root')!).render(<BoardViewV8 {...data}/>);
