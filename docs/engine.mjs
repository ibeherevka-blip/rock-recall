const day=86400000;
export const normalize=s=>String(s??'').normalize('NFKD').toLowerCase().replace(/ё/g,'е').replace(/\p{M}/gu,'').replace(/&/g,'and').replace(/[^\p{L}\p{N}]/gu,'');
export function isAnswer(text,card){const key=normalize(text);return Boolean(key)&&[card.answer,...(card.aliases??[])].some(x=>normalize(x)===key);}
export function shuffle(list,rng=Math.random){const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
export function options(card,pools,rng=Math.random){const seen=new Set([card.answer,...(card.aliases??[]),...(card.exclude??[])].map(normalize));const out=[card.answer];for(const value of shuffle(pools[card.pool]??[],rng)){const key=normalize(value);if(!key||seen.has(key))continue;seen.add(key);out.push(value);if(out.length===4)break;}return out.length===4?shuffle(out,rng):[];}
export function round(cards,topic,mode,limit,progress={},rng=Math.random,now=Date.now(),onlyMissed=false){
 const byKind=new Map();const old=new Map();const played=new Set();const result=[];
 for(const c of shuffle(cards,rng)){
  if(topic!=='mix'&&c.kind!==topic)continue;
  const state=progress[c.id];
  if(onlyMissed&&state?.last!==false)continue;
  const map=mode==='study'&&state?.due>now&&!onlyMissed?old:byKind;
  if(!map.has(c.kind))map.set(c.kind,[]);map.get(c.kind).push(c);
 }
 if(mode==='study')for(const bucket of byKind.values())bucket.sort((a,b)=>Number(Boolean(progress[b.id]))-Number(Boolean(progress[a.id])));
 function take(map){const buckets=shuffle([...map.values()],rng);for(let pass=0;result.length<limit;pass++){
  let more=false;for(const b of buckets){if(result.length>=limit)break;const c=b[pass];if(!c)continue;more=true;if(played.has(c.id))continue;played.add(c.id);result.push(c);}
  if(!more)break;
 }}
 take(byKind);if(result.length===0&&!onlyMissed)take(old);
 const offset=rng()<.5?0:1;
 return result.map((c,i)=>({...c,format:mode==='quiz'&&(i+offset)%2===0?'choice':'recall'}));
}
export function record(progress,id,correct,now=Date.now()){
 const old=progress[id]??{};const streak=correct?(old.streak??0)+1:0;
 progress[id]={seen:(old.seen??0)+1,streak,last:correct,due:now+(correct?Math.min(90,2**(streak-1))*day:0)};
 return progress[id];
}
