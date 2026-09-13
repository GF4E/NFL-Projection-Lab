export const integer=(n:number|null|undefined)=>n==null||!Number.isFinite(n)?'—':String(Math.round(n)||0);
export const integerText=(s:string)=>s.replace('by at least 0.1 displayed point','at the reporting threshold').replace(/-?\d+\.\d+/g,n=>integer(Number(n)));
export const pointShare=(away:number,home:number)=>{const a=Math.max(0,away),h=Math.max(0,home);return a+h>0?a/(a+h):.5;};
