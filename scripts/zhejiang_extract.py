"""Extract Word HTML while preserving diagrams, tables and scientific notation."""
from __future__ import annotations
import copy, hashlib, html as escape, json, re
from pathlib import Path
from lxml import etree, html
ROOT=Path(__file__).resolve().parent.parent
HTML_DIR=ROOT/'.work/html'
ASSET_DIR=ROOT/'assets/zhejiang'
ALLOWED={'p','div','span','b','strong','i','em','u','sub','sup','br','table','thead','tbody','tr','td','th','img','ul','ol','li'}
def text(node):
 return re.sub(r'\s+',' ',''.join(node.itertext())).strip()
def load_blocks(key):
 tree=html.parse(str(HTML_DIR/f'{key}.html'))
 return [n for n in tree.find('.//body') if n.get('title') not in ('header','footer')]
def image_path(src):
 original=(HTML_DIR/src).resolve()
 if original.parent!=HTML_DIR.resolve() or not original.is_file(): raise ValueError(f'Missing or unsafe image: {src}')
 if original.suffix.lower() not in ('.png','.gif','.jpg','.jpeg','.webp'): raise ValueError(f'Unsupported image: {src}')
 raw=original.read_bytes();dest=ASSET_DIR/f'{hashlib.sha256(raw).hexdigest()[:24]}{original.suffix.lower()}'
 dest.parent.mkdir(parents=True,exist_ok=True)
 if not dest.exists(): dest.write_bytes(raw)
 return dest.relative_to(ROOT).as_posix()
def clean_node(node):
 node=copy.deepcopy(node)
 for el in list(node.iter()):
  if not isinstance(el.tag,str):
   if el.getparent() is not None:el.getparent().remove(el)
   continue
  if el.tag in ('script','style','iframe','object','embed'):
   el.drop_tree();continue
  if el.tag=='img':
   src=image_path(el.get('src',''));width,height=el.get('width'),el.get('height');el.attrib.clear()
   el.set('src',src);el.set('alt','原题图表');el.set('loading','lazy')
   for name,value in [('width',width),('height',height)]:
    if value and value.isdigit() and 0<int(value)<5000:el.set(name,value)
  else:
   attrs={k:el.get(k) for k in ('colspan','rowspan') if el.tag in ('td','th') and (el.get(k) or '').isdigit()}
   el.attrib.clear()
   for key,value in attrs.items():el.set(key,value)
  if el.text:el.text=re.sub(r'\s+',' ',el.text)
  if el.tail:el.tail=re.sub(r'\s+',' ',el.tail)
 for el in reversed(list(node.iterdescendants())):
  if isinstance(el.tag,str) and el.tag not in ALLOWED:el.drop_tag()
 if node.tag not in ALLOWED:node.tag='div'
 return node
def rich_root(nodes):
 root=etree.Element('div')
 for node in nodes:
  clean=clean_node(node);clean.tail='\n';root.append(clean)
 return root
def linear(node):
 if node.tag=='img':return '\ufffc'
 if node.tag=='br':return '\n'
 return (node.text or '')+''.join(linear(c)+(c.tail or '') for c in node)
def slice_rich(root,start=0,end=None):
 end=len(linear(root)) if end is None else end;cursor=0
 def piece(value):
  nonlocal cursor
  a,b=max(0,start-cursor),min(len(value),end-cursor);cursor+=len(value)
  return escape.escape(value[a:b]) if a<b else ''
 def visit(node,outer=True):
  nonlocal cursor
  if node.tag in ('img','br'):
   include=start<=cursor<end;cursor+=1
   return etree.tostring(node,encoding='unicode',method='html',with_tail=False) if include else ''
  inside=piece(node.text or '')
  for child in node:inside+=visit(child)+piece(child.tail or '')
  if not inside:return ''
  if not outer:return inside
  attrs=''.join(f' {k}="{escape.escape(v,quote=True)}"' for k,v in node.attrib.items())
  return f'<{node.tag}{attrs}>{inside}</{node.tag}>'
 return visit(root,False).strip()
def plain(rich):
 if not rich:return ''
 d=html.fragment_fromstring(rich,create_parent='div')
 for img in d.xpath('.//img'):img.tail='［图表］'+(img.tail or '')
 return re.sub(r'[ \t]+',' ',''.join(d.itertext())).strip()
def make_question(meta,number,question_nodes,answer_nodes,explanation_nodes,kind='single',correct_answer=None):
 qroot=rich_root(question_nodes);qtext=linear(qroot)
 beginning=re.match(r'^\s*\d{1,2}(?:[.．、]|\s)\s*',qtext);start=beginning.end() if beginning else 0
 aroot=rich_root(answer_nodes);at=linear(aroot)
 prefix=re.match(r'^\s*(?:\d{1,2}[.．、]\s*)?(?:【答案】|答案[：:]?|参考答案[：:]?)\s*',at)
 ah=slice_rich(aroot,prefix.end() if prefix else 0);eh=slice_rich(rich_root(explanation_nodes));sh=slice_rich(qroot,start)
 oh=[];options=[];answer=correct_answer or plain(ah)
 if kind in ('single','multiple'):
  markers=list(re.finditer(r'(?<!\S)([A-D])(?:[.．、]|\ufffc|(?=\s+[\u4e00-\u9fff\ufffc]))',qtext[start:]));four=None
  chosen=[]
  for marker in markers:
   if len(chosen)<4 and marker.group(1)=='ABCD'[len(chosen)]:chosen.append(marker)
  if len(chosen)==4:four=chosen
  if not four:raise ValueError(f'{meta["key"]} Q{number}: could not split four options: {qtext[:160]}')
  sh=slice_rich(qroot,start,start+four[0].start())
  for i,m in enumerate(four):
   stop=start+four[i+1].start() if i<3 else len(qtext);v=slice_rich(qroot,start+m.end(),stop);oh.append(v);options.append(plain(v) or f'选项{m.group(1)}（见图）')
  match=re.match(r'\s*([A-D](?:[、,，\s]*[A-D])*)',answer)
  if not match:raise ValueError(f'{meta["key"]} Q{number}: missing answer: {answer[:100]}')
  answer=''.join(sorted(set(re.findall('[A-D]',match.group(1)))))
  if len(answer)>1:kind='multiple'
 return dict(id=f'{meta["key"]}-q{number:02d}',subject='浙江生物真题',chapter=f'{meta["year"]}年{meta["month"]}月',number=number,type=kind,questionType={'single':'单项选择题','multiple':'多项选择题','subjective':'非选择题','reference':'解析资料'}[kind],source=meta['filename'],stem=plain(sh),stemHtml=sh,options=options,optionsHtml=oh,answer=answer,answerHtml=ah,explanation=plain(eh),explanationHtml=eh)
def parse_modern(meta):
 nodes=load_blocks(meta['key']);choices=19 if meta['key']=='zj-2024-01' else (25 if meta['year']<=2022 else 20);total=choices+5;starts=[];cursor=next((i+1 for i,n in enumerate(nodes) if re.match(r'^(?:一[、．].*选择题|选择题部分)',text(n))),0)
 for number in range(1,total+1):
  candidates=[i for i in range(cursor,len(nodes)) if re.match(rf'^{number}(?:[.．]|\s)\s*',text(nodes[i]))]
  if number<=choices:
   def has_options(i):
    sample=' '.join(text(n) for n in nodes[i:i+12]);sample=re.split(r'【答案】|【解析】',sample)[0]
    return bool(re.search(r'A(?:[.．]|\s).*B(?:[.．]|\s).*C(?:[.．]|\s).*D(?:[.．]|\s)',sample))
   candidates=[i for i in candidates if has_options(i)]
  if not candidates:raise ValueError(f'{meta["key"]}: missing complete question {number}')
  starts.append(candidates[0]);cursor=candidates[0]+1
 passages=[]
 for i,n in enumerate(nodes):
  if re.match(r'^阅读下列材料',text(n)):
   first=next(x for x in starts if x>i)
   end=next(j for j in range(first,len(nodes)) if re.match(r'^【\s*答案\s*】',text(nodes[j])))
   passages.append((i,first,end))
 result=[]
 for number,start in enumerate(starts,1):
  stop=starts[number] if number<len(starts) else len(nodes)
  a=next((i for i in range(start,len(nodes)) if re.match(r'^【\s*答案\s*】',text(nodes[i]))),None)
  if a is None:raise ValueError(f'{meta["key"]} Q{number}: no answer delimiter')
  groupstop=next((x for x in starts if x>a),len(nodes))
  groupstop=min([i for i,_,_ in passages if a<i<groupstop]+[groupstop])
  e=next((i for i in range(a+1,groupstop) if re.match(r'^【\s*(解析|分析|详解)\s*】',text(nodes[i]))),groupstop)
  qnodes=nodes[start:min(a,stop)]
  for p,first,last in passages:
   if first<=start<last:qnodes=nodes[p:first]+qnodes
  anodes=nodes[a:e];enodes=nodes[e:groupstop]
  enodes=[n for n in enodes if not re.match(r'^(?:[一二三四五]、)?(?:非选择题|选择题)部分|^二、非选择题',text(n))]
  correct=None
  if number<=choices:
   at=' '.join(text(n) for n in anodes)
   grouped=re.findall(r'(\d{1,2})[.．]\s*([A-D])',at)
   if grouped:correct=dict(grouped).get(str(number))
  question=make_question(meta,number,qnodes,anodes,enodes,'single' if number<=choices else 'subjective',correct)
  if correct:
   # A shared answer block must not reveal answers to neighboring questions.
   question['answerHtml']=f'<p>{escape.escape(correct)}</p>'
   eroot=rich_root(enodes);etext=linear(eroot)
   details=list(re.finditer(r'【\s*(\d{1,2})\s*题详解\s*】',etext))
   own=next((i for i,m in enumerate(details) if int(m.group(1))==number),None)
   if own is not None:
    question['explanationHtml']=slice_rich(eroot,0,details[0].start())+slice_rich(eroot,details[own].start(),details[own+1].start() if own+1<len(details) else len(etext))
    question['explanation']=plain(question['explanationHtml'])
  result.append(question)
 return result
if __name__=='__main__':
 sources=json.loads((ROOT/'.work/sources.json').read_text());rows=[]
 for meta in sources:
  if meta['year']>=2021:
   q=parse_modern(meta);print(meta['key'],len(q),'questions');rows.extend(q)
 (ROOT/'.work/modern.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
