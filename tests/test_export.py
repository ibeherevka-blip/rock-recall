import tempfile
import unittest
from pathlib import Path
from PIL import Image
from tools.export import build

PROFILE='''# Example
**Название по-русски:** «Пример» — перевод.
![[Photos/example.jpg]]
## 💿 Дебютный альбом
- ![[cover.jpg]] Example One (1999)
## 🎤 Солист
- Jane Doe (на дебюте)
## 💡 Интересные факты
- 🎸 **[Фишка для квиза]** Первый проверочный факт.
## 💿 Студийные альбомы
### Example One
![[Covers/Studio/cover.jpg|220]]
### Example Two
![[Covers/Studio/two.jpg|220]]
## 🧩 Сайд-проекты участников
- [[Side Name|The Side Name]] — **Jane Doe**: Jane Doe создала The Side Name в 2000 году ([источник](<https://example.org/>)).
- **Solo Artist (сольный проект)** — **Solo Artist**: сольная карьера.
## 🃏 Карточки для квиза
<!--SR:!2026-06-09,4,272-->
'''

class ExportTests(unittest.TestCase):
 def test_exports_six_topics_assets_and_never_obsidian_metadata(self):
  with tempfile.TemporaryDirectory() as root:
   root=Path(root); v=root/'vault'; a=v/'Artists'; a.mkdir(parents=True)
   (a/'Example.md').write_text(PROFILE,encoding='utf8');(a/'1Category.md').write_text('# Index',encoding='utf8')
   for name in ['Photos/example.jpg','Covers/Studio/cover.jpg','Covers/Studio/two.jpg']:
    p=v/name;p.parent.mkdir(parents=True,exist_ok=True);Image.new('RGB',(700,700)).save(p)
   data=build(v,root/'site'); cards=data['cards']; kinds={c['kind'] for c in cards}
   self.assertEqual(kinds,{'covers','photos','vocals','translations','debuts','facts','sideProjects'})
   side=[c for c in cards if c['kind']=='sideProjects']
   self.assertEqual([c['answer'] for c in side],['The Side Name','Solo Artist (сольный проект)'])
   self.assertIn('Jane Doe',side[0]['prompt']);self.assertIn('2000',side[0]['clue'])
   self.assertNotIn('Side Name',side[0]['clue']);self.assertNotIn('https',str(side))
   self.assertNotIn('Solo Artist',side[1]['prompt'])
   self.assertEqual(sum(c['kind']=='covers' for c in cards),2)
   self.assertEqual(next(c for c in cards if c['kind']=='debuts')['answer'],'Example One')
   self.assertEqual(next(c for c in cards if c['kind']=='vocals')['answer'],'Jane Doe')
   self.assertEqual(data['meta']['artists'],1)
   self.assertNotIn('<!--SR',str(data));self.assertNotIn('vault/',str(data))
   for c in cards:
    if 'image' in c:
     with Image.open(root/'site'/c['image']) as im: self.assertLessEqual(max(im.size),560)
 def test_missing_asset_is_logged_and_does_not_make_a_broken_question(self):
  with tempfile.TemporaryDirectory() as root:
   root=Path(root);v=root/'vault';a=v/'Artists';a.mkdir(parents=True)
   (a/'Example.md').write_text(PROFILE,encoding='utf8')
   data=build(v,root/'site');self.assertGreater(len(data['issues']),0)
   self.assertFalse(any(c['kind'] in {'covers','photos'} for c in data['cards']))
