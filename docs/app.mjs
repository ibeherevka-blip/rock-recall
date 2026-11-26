import {round, record} from './engine.mjs?v=2';

const TOPICS={mix:'Микс',covers:'Обложки',photos:'Фото групп',vocals:'Вокалисты',translations:'Переводы',debuts:'Дебюты',facts:'Факты',sideProjects:'Сайд-проекты'};
const MODES={study:'Учить',quiz:'Квиз'};
const KEY='rock-recall-v1';
const app=document.querySelector('#app');
const state={topic:'mix',mode:'study',progress:{}};
try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&typeof s==='object'){if(Object.hasOwn(TOPICS,s.topic))state.topic=s.topic;if(Object.hasOwn(MODES,s.mode))state.mode=s.mode;if(s.progress&&typeof s.progress==='object'&&!Array.isArray(s.progress))state.progress=s.progress;}}catch{}
let deck, session, canSave=true;
const num=n=>n.toLocaleString('ru');
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{canSave=false;}}
function el(tag,text,cls){const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;}
function btn(text,fn,cls=''){const node=el('button',text,cls);node.type='button';node.addEventListener('click',fn);return node;}
function row(cls,...nodes){const box=el('div','',cls);box.append(...nodes);return box;}
function paint(...nodes){app.replaceChildren(...nodes);app.querySelector('h1')?.setAttribute('tabindex','-1');app.querySelector('h1')?.focus({preventScroll:true});if(window.scrollY>20)window.scrollTo(0,0);}
function showArt(c,forReview=false){const art=el('img','','art');art.src=c.image;art.alt=forReview?`${c.answer}`:c.kind==='covers'?'Обложка альбома для этого вопроса':'Фото исполнителя для этого вопроса';if(forReview)art.loading='lazy';art.decoding='async';return art;}
function pick(title,field,values){const box=el('fieldset');box.append(el('legend',title));const choices=row(field==='topic'?'topics':'modes');for(const [value,label] of Object.entries(values)){
 const wrap=el('label','','pill');const input=el('input');input.type='radio';input.name=field;input.value=value;input.checked=state[field]===value;
 input.addEventListener('change',()=>{state[field]=value;save();updateHome();});wrap.append(input,el('span',label));choices.append(wrap);
 }box.append(choices);return box;}
function matches(c){return state.topic==='mix'||c.kind===state.topic;}
function updateHome(){
 const total=state.topic==='mix'?deck.cards.length:deck.meta.counts[state.topic]??0;
 const hasMissed=deck.cards.some(c=>matches(c)&&state.progress[c.id]?.last===false);
 document.querySelector('#home-help').textContent=state.mode==='study'?'Вспомни ответ, открой карточку и отметь, знал ли ты его. Ошибки повторятся.':'10 карточек без повторов в раунде. Вспомни ответ и оцени себя.';
 document.querySelector('#topic-count').textContent=`В этой подборке: ${num(total)} карточек.`;
 document.querySelector('#repeat').hidden=!hasMissed;
 document.querySelector('#start').textContent=state.mode==='study'?'Начать тренировку':'Начать квиз';
}
function home(){
 const start=btn('Начать',()=>startSession(false),'primary');start.id='start';
 const again=btn('Повторить ошибки',()=>startSession(true));again.id='repeat';
 const help=el('p','','muted');help.id='home-help';
 const count=el('p','','muted');count.id='topic-count';count.setAttribute('aria-live','polite');
 paint(el('span',`${num(deck.meta.artists)} исполнителей · ${num(deck.cards.length)} карточек`,'eyebrow'),el('h1','Вспомни рок.'),el('p','Узнавай обложки, лица и истории из своей коллекции.','intro'),pick('01 — Тема','topic',TOPICS),pick('02 — Режим','mode',MODES),help,row('actions',start,again),count,...(canSave?[]:[el('p','Браузер не разрешил сохранить прогресс.','no')]));updateHome();
}
function startSession(onlyMissed){
 const mode=onlyMissed?'study':state.mode;
 const cards=round(deck.cards,state.topic,mode,10,state.progress,Math.random,Date.now(),onlyMissed);
 session={mode,onlyMissed,queue:cards.map(card=>({card,retry:false})),index:0,base:cards.length,seen:0,results:[]};
 if(!cards.length){paint(el('h1','Нет карточек для повторения'),row('actions',btn('К темам',home,'primary')));return;}
 question();
}
function header(item){
 const label=item.retry?'Повтор ошибки':`${session.seen+1} / ${session.base}`;
 return [row('topline',el('span',`${MODES[session.mode]} · ${TOPICS[item.card.kind]}`,'chip'),btn('К темам',home)),row('topline',el('span',label,'count')),progressBar()];
}
function progressBar(){const b=el('div','','bar');b.setAttribute('aria-hidden','true');const fill=el('span');fill.style.width=`${100*session.seen/session.base}%`;b.append(fill);return b;}
function question(){
 if(session.index>=session.queue.length){finish();return;}
 const item=session.queue[session.index], c=item.card;
 const title=el('h1',c.prompt,'question');
 const stuff=[...header(item),title];
 if(c.image)stuff.push(showArt(c));
 if(c.kind==='facts')stuff.push(el('p',c.detail,'fact'));
 if(c.clue)stuff.push(el('p',c.clue,'fact'));
 const out=el('section');out.id='answer-area';stuff.push(out);
 out.append(btn('Показать ответ',reveal,'primary'));
 paint(...stuff);
}
function reveal(){
 const out=document.querySelector('#answer-area');
 const item=session.queue[session.index];const c=item.card;
 const box=el('div','','feedback');box.setAttribute('role','status');
 box.append(el('p','Ответ','muted'),el('p',c.answer));
 if(c.detail&&c.kind!=='facts')box.append(el('p',c.detail,'muted'));
 const actions=row('actions',btn('Не знал',()=>advance(false)),btn('Знал',()=>advance(true),'primary'));
 out.replaceChildren(box,actions);actions.querySelector('button').focus({preventScroll:true});
}
function advance(correct){
 const item=session.queue[session.index];const c=item.card;
 record(state.progress,c.id,correct);save();
 if(!item.retry){session.seen++;session.results.push({c,correct});}
 if(!correct&&!item.retry&&session.mode==='study')session.queue.splice(Math.min(session.queue.length,session.index+4),0,{card:c,retry:true});
 session.index++;question();
}
function finish(){
 const wrong=session.results.filter(x=>!x.correct);
 const n=session.results.length;
 const lines=[el('span',`${MODES[session.mode]} · ${TOPICS[state.topic]}`,'eyebrow'),el('h1',`${n-wrong.length} из ${n}`),el('p','Верных ответов с первой попытки. Повторы не меняют результат раунда.','intro')];
 if(wrong.length){const list=el('ol','','result-list');for(const {c} of wrong){const li=el('li');li.append(el('p',c.kind==='facts'?c.detail:c.prompt));if(c.clue)li.append(el('p',c.clue,'muted'));if(c.image)li.append(showArt(c,true));li.append(el('p',`${c.answer}${c.kind==='covers'?` — ${c.detail}`:''}`,'yes'));list.append(li);}lines.push(el('h2','Разбор ошибок','empty'),list);}
 lines.push(row('actions',btn('Ещё раунд',()=>startSession(session.onlyMissed),'primary'),btn('К темам',home)));
 paint(...lines);
}
async function load(){try{const response=await fetch('./deck.json?v=2');if(!response.ok)throw new Error('deck');deck=await response.json();if(deck.schema!==1||!Array.isArray(deck.cards))throw new Error('schema');home();}catch{paint(el('h1','Не удалось загрузить карточки'),el('p','Проверь подключение и попробуй ещё раз.','muted'),row('actions',btn('Повторить',load,'primary')));}}
load();
