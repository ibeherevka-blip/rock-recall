import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {round, record, createQuizChoices} from '../docs/engine.mjs';
const kinds=['covers','photos','vocals','translations','debuts','facts'];
const cards=kinds.flatMap(kind=>Array.from({length:14},(_,i)=>({id:`${kind}-${i}`,kind,group:`g${i}`,answer:`a${i}`,pool:'artists'})));
const rng=()=>0.42;
test('mixed quiz balances topics including side projects, returning plain cards',()=>{
 const side={id:'side',kind:'sideProjects',prompt:'Which project?',answer:'Project'};
 const r=round([...cards,side],'mix','quiz',10,{},rng);
 assert.equal(r.length,10); assert.equal(new Set(r.map(x=>x.id)).size,10);
 const counts=kinds.map(k=>r.filter(x=>x.kind===k).length);
 assert.equal(Math.min(...counts),1); assert.equal(Math.max(...counts),2);
 assert.ok(r.includes(side)); assert.ok(r.every(c=>!('format' in c)));
});
test('single-topic study uses recall and puts due cards before new',()=>{
 const r=round(cards,'photos','study',10,{'photos-9':{due:0},'photos-8':{due:Date.now()+1e8}},rng);
 assert.equal(r[0].id,'photos-9'); assert.ok(r.every(x=>x.kind==='photos'&&x.id!=='photos-8'));
});
test('side-project quiz selects only side-project cards',()=>{
 const side={id:'side',kind:'sideProjects',prompt:'Which project?',clue:'A clue',answer:'Project'};
 assert.deepEqual(round([...cards,side],'sideProjects','quiz',10,{},rng),[side]);
});
test('missed cards remain due and mastered cards are spaced',()=>{
 const p={};record(p,'x',false,100);assert.equal(p.x.due,100);record(p,'x',true,100);const due=p.x.due;assert.ok(due>100);record(p,'x',true,due);assert.ok(p.x.due-due>due-100);assert.equal(p.x.seen,3);
});
test('quiz excludes aliases, duplicate labels and other side projects of the same act',()=>{
 const side={kind:'sideProjects',pool:'projects',group:'Band',answer:'Project A',aliases:['Project Alpha']};
 const cards=[side,{...side,answer:'Other Valid Project'}];
 const choices=createQuizChoices({cards,pools:{projects:['Project A','Project A!','Project Alpha','Other Valid Project','One','Two','Three','One!']}})(side,rng);
 assert.deepEqual(new Set(choices.map(x=>x.replace(/!/g,''))),new Set(['Project A','One','Two','Three']));
});
test('all published cards get four distinct options including the correct answer',()=>{
 const deck=JSON.parse(readFileSync(new URL('../docs/deck.json',import.meta.url),'utf8'));
 const make=createQuizChoices(deck);
 for(const card of deck.cards){
  const choices=make(card,rng);
  assert.equal(new Set(choices).size,4,card.id);
  assert.ok(choices.includes(card.answer),card.id);
 }
});
