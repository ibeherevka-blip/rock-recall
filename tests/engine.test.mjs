import test from 'node:test';
import assert from 'node:assert/strict';
import {round, options, isAnswer, record} from '../docs/engine.mjs';
const kinds=['covers','photos','vocals','translations','debuts','facts'];
const cards=kinds.flatMap(kind=>Array.from({length:14},(_,i)=>({id:`${kind}-${i}`,kind,group:`g${i}`,answer:`a${i}`,pool:'artists'})));
const rng=()=>0.42;
test('mixed quiz balances all six topics and includes both formats',()=>{
 const r=round(cards,'mix','quiz',10,{},rng);
 assert.equal(r.length,10); assert.equal(new Set(r.map(x=>x.id)).size,10);
 const counts=kinds.map(k=>r.filter(x=>x.kind===k).length);
 assert.equal(Math.min(...counts),1); assert.equal(Math.max(...counts),2);
 assert.equal(r.filter(x=>x.format==='choice').length,5);
});
test('single-topic study uses recall and puts due cards before new',()=>{
 const r=round(cards,'photos','study',10,{'photos-9':{due:0},'photos-8':{due:Date.now()+1e8}},rng);
 assert.equal(r[0].id,'photos-9'); assert.ok(r.every(x=>x.kind==='photos'&&x.format==='recall'&&x.id!=='photos-8'));
});
test('four options are unique and avoid alternative answers',()=>{
 const c={...cards[0],aliases:['a1']}; const out=options(c,{artists:['a0','a1','a2','a3','a4','a4']},rng);
 assert.equal(new Set(out).size,4); assert.ok(out.includes('a0')); assert.ok(!out.includes('a1'));
});
test('typed answers accept punctuation, accents, years via aliases, not substrings',()=>{
 assert.ok(isAnswer('  Guns N’ Roses ',{answer:"Guns N' Roses"}));
 assert.ok(isAnswer('Beyonce',{answer:'Beyoncé'}));
 assert.ok(isAnswer('дебют',{answer:'Дебют (1990)',aliases:['Дебют']}));
 assert.ok(!isAnswer('Guns',{answer:"Guns N' Roses"}));
});
test('missed cards remain due and mastered cards are spaced',()=>{
 const p={};record(p,'x',false,100);assert.equal(p.x.due,100);record(p,'x',true,100);const due=p.x.due;assert.ok(due>100);record(p,'x',true,due);assert.ok(p.x.due-due>due-100);assert.equal(p.x.seen,3);
});
