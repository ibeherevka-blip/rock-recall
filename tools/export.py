"""Read only the dedicated English-rock profiles and export a static question bank."""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
import re

from PIL import Image, ImageOps

EMBED = re.compile(r'!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]')
SECTIONS = re.compile(r'^## ([^\n]+)\n(.*?)(?=^#{1,2} |\Z)', re.M | re.S)
ALBUMS = re.compile(r'^### ([^\n]+)\n(.*?)(?=^### |\Z)', re.M | re.S)
TITLES = {'debuts':'Дебютный альбом','vocals':'Солист','facts':'Интересные факты','covers':'Студийные альбомы','sideProjects':'Сайд-проекты участников'}
SIDE_ROW = re.compile(r'^(.*?)\s+—\s+\*\*(.+?)\*\*:\s*(.+)$')
SOURCE_NOTE = re.compile(r'\s*\(\[(?:источник|источники)\]\(<https?://[^>]+>\)\)\s*$', re.I)
UNCERTAIN = re.compile(r'^(?:нет\b|неизвестно\b|не указан\w*\b|уточняется\b|отсутствует\b|n/a\b)', re.I)
IMAGE_SUFFIXES = {'.jpg','.jpeg','.png','.webp','.avif','.gif','.bmp','.tiff'}


def clean(text):
    text = EMBED.sub('', text)
    text = re.sub(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', lambda m:m[2] or m[1], text)
    text = re.sub(r'\[([^\]]+)\]\((?:<[^>]*>|[^)]*)\)', r'\1', text)
    text = re.sub(r'<!--.*?-->', '', text)
    return ' '.join(text.replace('**','').replace('`','').split()).strip()


def items(section):
    return [m.strip() for m in re.findall(r'^[-*] (.+)', section, re.M)]


def key(text):
    return re.sub(r'[^\w]+', '', text.casefold())


def accepted(text):
    return bool(text and text not in {'—','-','?'} and not UNCERTAIN.match(text))


def side_project(group, raw):
    row = SIDE_ROW.fullmatch(raw)
    if not row:
        return None
    project, member = map(clean, row.groups()[:2])
    detail = clean(SOURCE_NOTE.sub('', row[3]))
    if not all(map(accepted, (project, member, detail))):
        return None
    short = re.sub(r'\s*\([^)]*\)\s*$', '', project).strip()
    # A member's name is itself the answer on some solo-project cards.
    names = {project, short} - {''}
    mask = re.compile(r'(?<!\w)(?:'+'|'.join(map(re.escape, sorted(names,key=lambda x:(-len(x),x))))+r')(?!\w)', re.I)
    display_member = 'этот участник' if mask.search(member) else member
    prompt = f'Как называется проект? {group} · {display_member}'
    if mask.search(group):
        prompt = f'Как называется проект? Участник: {display_member}'
    return project, member, prompt, mask.sub('…', detail), detail


def build(vault, out, limit=None):
    vault, out = vault.resolve(), out.resolve()
    if out == vault or out.is_relative_to(vault):
        raise ValueError('Export destination must be outside the source vault')
    out.mkdir(parents=True,exist_ok=True)
    (out/'assets').mkdir(exist_ok=True)
    images = defaultdict(list)
    for p in vault.rglob('*'):
        if not any(part.startswith('.') for part in p.relative_to(vault).parts) and p.suffix.lower() in IMAGE_SUFFIXES and p.is_file() and p.resolve().is_relative_to(vault):
            images[p.name].append(p)
    artist_rows=[]
    for p in sorted((vault/'Artists').glob('*.md'),key=lambda x:x.name.casefold()):
        if p.is_symlink(): continue
        text=p.read_text(encoding='utf-8-sig')
        sections={kind: body for title,body in SECTIONS.findall(text) for kind,label in TITLES.items() if title.strip().endswith(label)}
        if 'debuts' in sections or 'vocals' in sections: artist_rows.append((p.stem,text,sections))
    if limit is not None: artist_rows=artist_rows[:limit]
    cards=[]; pools=defaultdict(set); assets={}; issues=[]; ids=set()

    def image(group,embed):
        if not embed: return None
        ref=embed[1].strip(); path=(vault/ref).resolve()
        if path.is_relative_to(vault) and path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES and not any(x.startswith('.') for x in path.relative_to(vault).parts):
            pass
        elif '/' not in ref and len(images[ref])==1:
            path=images[ref][0].resolve()
        else:
            issues.append({'group':group,'type':'unresolved-image','ref':ref});return None
        target='assets/'+sha256(path.relative_to(vault).as_posix().encode()).hexdigest()[:24]+'.webp'
        assets[target]=path
        return target

    def add(group,kind,prompt,answer,pool,*,aliases=(),detail='',asset=None,identity='',exclude=(),clue=''):
        if not accepted(answer):return
        cid=sha256(f'{group}\x1f{kind}\x1f{identity}'.encode()).hexdigest()[:24]
        if cid in ids:return
        ids.add(cid)
        card=dict(id=cid,kind=kind,group=group,prompt=prompt,answer=answer,pool=pool)
        if aliases:card['aliases']=list(dict.fromkeys(x for x in aliases if accepted(x) and key(x)!=key(answer)))
        if detail:card['detail']=detail
        if clue:card['clue']=clue
        if asset:card['image']=asset
        if exclude:card['exclude']=list(exclude)
        cards.append(card);pools[pool].add(answer)

    for group,text,sections in artist_rows:
        head=re.split(r'^## ',text,maxsplit=1,flags=re.M)[0]
        alias_line=re.search(r'^aliases:\s*\[(.*)\]\s*$',head,re.M)
        aliases=tuple(s.strip().strip('\"\'') for s in alias_line[1].split(',')) if alias_line else ()
        photo=image(group,EMBED.search(head))
        if photo:add(group,'photos','Кто на фото?',group,'artists',aliases=aliases,asset=photo)
        studio=[]
        for title,body in ALBUMS.findall(sections.get('covers','')):
            title=clean(title)
            if not accepted(title):continue
            studio.append((title,image(group,EMBED.search(body))))
        for title,asset in studio:
            if asset:add(group,'covers','Как называется этот альбом?',title,'albums',asset=asset,detail=group,identity=title+'|'+asset)
        debounce=items(sections.get('debuts',''))
        if debounce:
            raw=clean(debounce[0]); title=re.sub(r'\s*\((?:19|20)\d{2}[^)]*\)\s*$','',raw).strip(); title=re.sub(r'^«(.+)»$',r'\1',title)
            if accepted(title):
                add(group,'debuts',f'Как называется дебютный альбом {group}?',title,'debuts',aliases=[raw],detail=raw if raw!=title else '')
                if key(title) not in {key(t) for t,a in studio}:
                    art=image(group,EMBED.search(debounce[0]))
                    if art and art not in {a for t,a in studio}:
                        add(group,'covers','Как называется этот альбом?',title,'albums',asset=art,detail=group,identity=title+'|'+art)
        vocals=items(sections.get('vocals',''))
        if vocals:
            raw=clean(vocals[0]); main=re.sub(r'\s*\([^)]*\)\s*$','',raw).strip()
            if accepted(main):add(group,'vocals',f'Кто указан как вокалист у {group}?',main,'vocalists',aliases=[raw],detail=raw if raw!=main else '')
        trans=re.search(r'^\*\*Название по-русски:\*\*\s*(.+)$',head,re.M)
        if trans:
            raw=clean(trans[1]); short=re.match(r'^«([^»]+)»\s*(?:[—–-]|[.]?$)',raw)
            if short:add(group,'translations',f'Как переводится название {group}?',short[1],'translations',aliases=[raw],detail=raw if raw!=short[1] else '')
            elif accepted(raw):add(group,'translations',f'Что означает название {group}?',raw,'translations',detail='Сверь смысл с ответом из базы.')
        for raw in items(sections.get('facts','')):
            fact=re.sub(r'^(?:🎸\s*)?\[Фишка для квиза\]\s*','',clean(raw),flags=re.I)
            if len(fact)<15:continue
            for name in sorted({group,*aliases},key=len,reverse=True):
                if len(name)>=3:fact=re.sub(r'(?<!\w)'+re.escape(name)+r'(?!\w)','[…] ',fact,flags=re.I)
            add(group,'facts','О ком этот факт?',group,'artists',aliases=aliases,detail=' '.join(fact.split()),identity=clean(raw))
        for raw in items(sections.get('sideProjects','')):
            side = side_project(group, raw)
            if not side:
                issues.append({'group':group,'type':'unparsed-side-project'})
                continue
            project,member,prompt,clue,detail = side
            add(group,'sideProjects',prompt,project,'projects',identity=project+'|'+member,clue=clue,detail=detail)

    def bake(item):
        target,source=item
        try:
            with Image.open(source) as frame:
                frame=ImageOps.exif_transpose(frame).convert('RGB')
                frame.thumbnail((560,560),Image.Resampling.LANCZOS)
                frame.save(out/target,'WEBP',quality=84,method=0)
            return None
        except (OSError,ValueError,Image.DecompressionBombError):
            return target

    used={c['image'] for c in cards if 'image' in c}
    with ThreadPoolExecutor(max_workers=4) as workers:
        failed={x for x in workers.map(bake,((name,assets[name]) for name in sorted(used))) if x}
    if failed:
        issues.extend({'group':c['group'],'type':'invalid-image','ref':c['image']} for c in cards if c.get('image') in failed)
        cards=[c for c in cards if c.get('image') not in failed]
    allow={c['image'] for c in cards if 'image' in c}
    for p in (out/'assets').glob('*.webp'):
        if re.fullmatch('[a-f0-9]{24}\\.webp',p.name) and 'assets/'+p.name not in allow:p.unlink()
    data={'schema':1,'meta':{'artists':len(artist_rows),'counts':dict(Counter(c['kind'] for c in cards)),'images':len(allow)},'cards':cards,'pools':{k:sorted(v,key=str.casefold) for k,v in pools.items()}}
    (out/'deck.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    return {**data,'issues':issues}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vault',required=True,type=Path)
    parser.add_argument('--out',type=Path,default=Path('docs'))
    parser.add_argument('--report',type=Path,default=Path('export-report.local.json'))
    parser.add_argument('--limit',type=int)
    args=parser.parse_args()
    data=build(args.vault,args.out,args.limit)
    args.report.write_text(json.dumps({'meta':data['meta'],'issues':data['issues']},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({**data['meta'],'issues':len(data['issues'])},ensure_ascii=False))
