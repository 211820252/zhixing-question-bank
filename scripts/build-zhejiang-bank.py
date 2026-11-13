"""Build the reviewed Zhejiang bank from converted Word HTML (see imports/zhejiang)."""
from __future__ import annotations
import collections
import hashlib
import json
import re
from lxml import html
from zhejiang_extract import ROOT, ALLOWED, parse_modern
from zhejiang_early import parse_early


def validate(rows, sources):
    assert len(rows) == 514, f'Expected 514 questions, got {len(rows)}'
    assert len({q['id'] for q in rows}) == len(rows), 'Duplicate question IDs'
    used_images = set()
    counts = []
    for source in sources:
        paper = [q for q in rows if q['id'].startswith(source['key']+'-')]
        expected = (33 if source['year'] <= 2019 else 30 if source['year'] <= 2022 else 24 if source['key'] == 'zj-2024-01' else 25)
        assert [q['number'] for q in paper] == list(range(1, expected+1)), source['key']
        counts.append({**source, 'questions': len(paper), 'types': dict(collections.Counter(q['type'] for q in paper))})
    for q in rows:
        assert q['stem'] and q['answer'], f'Empty question or answer: {q["id"]}'
        assert not re.search(r'【\s*(答案|解析|详解)\s*】', q['stem']), f'Answer leaked: {q["id"]}'
        if q['type'] in ('single', 'multiple'):
            assert len(q['options']) == len(q['optionsHtml']) == 4, q['id']
            assert re.fullmatch('[A-D]' if q['type']=='single' else '[A-D]{2,4}',q['answer']), q['id']
            assert not any(re.search(r'【\s*(答案|解析|详解)\s*】',v) for v in q['options']), q['id']
        assert q['type'] in ('single','multiple','subjective'), q['id']
        for rich in [q['stemHtml'],q['answerHtml'],q['explanationHtml'],*q['optionsHtml']]:
            fragment = html.fragment_fromstring(rich or '<span></span>',create_parent='div')
            for el in fragment.iter():
                assert el.tag in ALLOWED, (q['id'],el.tag)
                assert set(el.attrib) <= {'src','alt','width','height','loading','colspan','rowspan'}, (q['id'],el.attrib)
                if el.tag == 'img':
                    src = el.get('src','')
                    assert re.fullmatch(r'assets/zhejiang/[\w.-]+\.(png|gif|jpg|jpeg|webp)',src), (q['id'],src)
                    assert (ROOT/src).is_file(), (q['id'],src)
                    used_images.add(src)
    return counts, used_images


def main():
    sources = sorted(json.loads((ROOT/'imports/zhejiang/sources.json').read_text()),key=lambda source:(source['year'],source['month']))
    rows=[]
    for source in sources:
        rows.extend(parse_early(source) if source['year']<=2020 else parse_modern(source))
    counts, images = validate(rows,sources)
    data = json.dumps(rows,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
    (ROOT/'zhejiang-data.js').write_text('// Reviewed Zhejiang biology papers. Original IDs in data.js are unchanged.\nwindow.QUESTION_BANK = (window.QUESTION_BANK || []).concat('+data+');\n')
    manifest = {
        'questionCount':len(rows),'types':dict(collections.Counter(q['type'] for q in rows)),
        'papers':counts,'images':len(images),
        'originalBankSHA256':hashlib.sha256((ROOT/'data.js').read_bytes()).hexdigest(),
        'notes':[{'id':q['id'],'note':q['sourceNote'],'url':q.get('sourceUrl',q.get('sourceURL'))} for q in rows if q.get('sourceNote')],
    }
    (ROOT/'imports/zhejiang/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(f'Validated {len(rows)} questions in {len(counts)} papers, {len(images)} images; old bank untouched.')

if __name__=='__main__':
    main()
