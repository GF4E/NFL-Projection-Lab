import fs from 'node:fs';
import assert from 'node:assert/strict';
const css=fs.readFileSync('src/styles/board-v7.css','utf8');
const token=name=>css.match(new RegExp('--v7-'+name+':(#[0-9A-Fa-f]{6})'))[1];
const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
const surface=token('ground'),bg=luminance(surface);const checks=['text','secondary','muted'].map(name=>{const value=token(name),fg=luminance(value);const ratio=(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);assert.ok(ratio>=4.5,name+' fails 4.5:1');return {token:name,value,surface,ratio}});console.log(JSON.stringify({status:'PASS',minimum:4.5,checks},null,2));
