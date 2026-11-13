"""Reviewed splits for Zhejiang biology papers from 2017 to 2020."""
from __future__ import annotations
import copy,json,re
from lxml import etree,html
from zhejiang_extract import load_blocks,text,make_question,ROOT
REVIEW = {'zj-2017-04': {'choiceCount': 28,
                'referenceOnly': False,
                'ranges': [(5, 7, 10, 'A'),
                           (10, 12, 15, 'A'),
                           (15, 18, 21, 'C'),
                           (21, 23, 26, 'B'),
                           (26, 28, 32, 'B'),
                           (32, 34, 37, 'C'),
                           (37, 39, 42, 'C'),
                           (42, 47, 50, 'D'),
                           (50, 55, 58, 'D'),
                           (58, 61, 64, 'A'),
                           (64, 69, 72, 'D'),
                           (72, 77, 80, 'D'),
                           (80, 85, 88, 'D'),
                           (88, 99, 102, 'B'),
                           (102, 107, 110, 'B'),
                           (110, 122, 125, 'C'),
                           (125, 131, 134, 'C'),
                           (134, 139, 142, 'D'),
                           (142, 147, 150, 'C'),
                           (150, 163, 166, 'D'),
                           (166, 171, 174, 'B'),
                           (174, 179, 182, 'B'),
                           (182, 194, 197, 'D'),
                           (197, 203, 206, 'A'),
                           (206, 211, 214, 'D'),
                           (214, 216, 219, 'A'),
                           (219, 224, 227, 'B'),
                           (227, 243, 246, 'C'),
                           (249, 262, 268, ''),
                           (268, 286, 292, ''),
                           (292, 311, 318, ''),
                           (318, 355, 360, ''),
                           (360, 377, 386, '')]},
 'zj-2017-11': {'choiceCount': 28,
                'referenceOnly': False,
                'ranges': [(10, 12, 13, 'D'),
                           (13, 15, 16, 'A'),
                           (16, 18, 19, 'B'),
                           (19, 22, 23, 'D'),
                           (23, 28, 29, 'B'),
                           (29, 31, 32, 'D'),
                           (32, 35, 36, 'C'),
                           (36, 41, 42, 'B'),
                           (42, 47, 48, 'A'),
                           (48, 53, 54, 'D'),
                           (54, 57, 58, 'B'),
                           (58, 63, 64, 'C'),
                           (64, 69, 70, 'C'),
                           (70, 75, 76, 'A'),
                           (76, 79, 80, 'B'),
                           (80, 85, 86, 'A'),
                           (86, 91, 92, 'D'),
                           (92, 98, 99, 'D'),
                           (99, 104, 105, 'C'),
                           (105, 110, 111, 'D'),
                           (111, 116, 117, 'C'),
                           (117, 122, 123, 'A'),
                           (123, 132, 133, 'A'),
                           (133, 135, 136, 'B'),
                           (136, 141, 142, 'C'),
                           (142, 147, 148, 'C'),
                           (148, 153, 154, 'B'),
                           (154, 160, 163, 'D'),
                           (165, 170, 171, ''),
                           (171, 180, 182, ''),
                           (182, 191, 199, ''),
                           (199, 213, 215, ''),
                           (215, 228, 235, '')]},
 'zj-2018-04': {'choiceCount': 28,
                'referenceOnly': True,
                'ranges': [(2, 2, 4, 'D'),
                           (4, 4, 6, 'A'),
                           (6, 6, 9, 'B'),
                           (9, 9, 11, 'D'),
                           (11, 11, 12, 'C'),
                           (12, 12, 14, 'A'),
                           (14, 14, 16, 'C'),
                           (16, 16, 18, 'D'),
                           (18, 18, 20, 'B'),
                           (20, 20, 22, 'C'),
                           (22, 22, 23, 'A'),
                           (23, 23, 24, 'B'),
                           (24, 24, 26, 'B'),
                           (26, 26, 28, 'C'),
                           (28, 28, 30, 'A'),
                           (30, 30, 32, 'B'),
                           (32, 32, 34, 'C'),
                           (34, 34, 37, 'D'),
                           (37, 37, 39, 'D'),
                           (39, 39, 42, 'B'),
                           (42, 42, 44, 'A'),
                           (44, 44, 45, 'B'),
                           (45, 45, 47, 'D'),
                           (47, 47, 49, 'D'),
                           (49, 49, 51, 'B'),
                           (51, 51, 52, 'D'),
                           (52, 52, 53, 'A'),
                           (53, 53, 54, 'A'),
                           (55, 55, 56, ''),
                           (56, 56, 57, ''),
                           (57, 57, 58, ''),
                           (58, 58, 65, ''),
                           (65, 65, 74, '')]},
 'zj-2018-11': {'choiceCount': 28,
                'referenceOnly': False,
                'ranges': [(44, 49, 51, 'A'),
                           (51, 54, 56, 'B'),
                           (56, 60, 62, 'C'),
                           (62, 67, 69, 'C'),
                           (69, 74, 75, 'D'),
                           (75, 80, 82, 'D'),
                           (82, 87, 89, 'A'),
                           (89, 94, 96, 'A'),
                           (96, 99, 100, 'A'),
                           (100, 105, 107, 'B'),
                           (107, 113, 115, 'B'),
                           (115, 120, 122, 'C'),
                           (122, 127, 129, 'D'),
                           (129, 135, 136, 'C'),
                           (136, 141, 143, 'D'),
                           (143, 150, 152, 'B'),
                           (152, 157, 158, 'D'),
                           (158, 163, 165, 'C'),
                           (165, 171, 173, 'D'),
                           (173, 178, 180, 'B'),
                           (180, 185, 187, 'C'),
                           (187, 193, 195, 'B'),
                           (195, 200, 202, 'A'),
                           (202, 207, 209, 'B'),
                           (209, 216, 218, 'C'),
                           (218, 224, 225, 'B'),
                           (225, 230, 232, 'C'),
                           (232, 239, 240, 'B'),
                           (241, 245, 248, ''),
                           (248, 255, 259, ''),
                           (259, 267, 273, ''),
                           (273, 286, 298, ''),
                           (298, 309, 316, '')]},
 'zj-2019-04': {'choiceCount': 28,
                'referenceOnly': False,
                'ranges': [(40, 45, 47, 'B'),
                           (47, 51, 53, 'D'),
                           (53, 56, 58, 'C'),
                           (58, 63, 65, 'B'),
                           (65, 68, 70, 'A'),
                           (70, 73, 75, 'A'),
                           (75, 80, 82, 'C'),
                           (82, 87, 89, 'A'),
                           (89, 94, 96, 'C'),
                           (96, 104, 106, 'D'),
                           (106, 111, 113, 'B'),
                           (113, 118, 120, 'B'),
                           (120, 125, 127, 'D'),
                           (127, 132, 134, 'D'),
                           (134, 141, 143, 'D'),
                           (143, 148, 150, 'D'),
                           (150, 152, 154, 'A'),
                           (154, 161, 163, 'C'),
                           (163, 168, 170, 'B'),
                           (170, 178, 180, 'C'),
                           (180, 185, 187, 'D'),
                           (187, 192, 194, 'A'),
                           (194, 199, 201, 'D'),
                           (201, 209, 211, 'A'),
                           (211, 216, 218, 'D'),
                           (218, 226, 228, 'A'),
                           (228, 233, 235, 'A'),
                           (235, 242, 244, 'B'),
                           (245, 252, 254, ''),
                           (254, 257, 260, ''),
                           (260, 266, 269, ''),
                           (269, 282, 287, ''),
                           (287, 297, 305, '')]},
 'zj-2020-01': {'choiceCount': 25,
                'referenceOnly': False,
                'ranges': [(2, 4, 12, 'A'),
                           (12, 17, 25, 'B'),
                           (25, 28, 36, 'C'),
                           (36, 39, 44, 'B'),
                           (44, 46, 53, 'A'),
                           (53, 56, 61, 'B'),
                           (61, 66, 74, 'D'),
                           (74, 80, 88, 'D'),
                           (88, 93, 101, 'B'),
                           (101, 106, 114, 'A'),
                           (114, 119, 128, 'D'),
                           (128, 134, 142, 'D'),
                           (142, 147, 155, 'A'),
                           (155, 162, 175, 'C'),
                           (175, 180, 188, 'C'),
                           (188, 193, 201, 'A'),
                           (201, 206, 214, 'D'),
                           (214, 219, 228, 'D'),
                           (228, 234, 243, 'D'),
                           (243, 248, 256, 'C'),
                           (256, 261, 275, 'A'),
                           (275, 280, 295, 'B'),
                           (295, 301, 311, 'C'),
                           (311, 316, 326, 'C'),
                           (326, 333, 342, 'C'),
                           (343, 347, 358, ''),
                           (358, 363, 371, ''),
                           (371, 376, 384, ''),
                           (384, 394, 408, ''),
                           (408, 423, 433, '')]},
 'zj-2020-07': {'choiceCount': 25,
                'referenceOnly': False,
                'ranges': [(36, 39, 41, 'A'),
                           (41, 46, 48, 'B'),
                           (48, 52, 54, 'D'),
                           (54, 59, 61, 'C'),
                           (61, 66, 68, 'A'),
                           (68, 73, 75, 'C'),
                           (75, 80, 82, 'C'),
                           (82, 87, 89, 'B'),
                           (89, 95, 97, 'D'),
                           (97, 102, 104, 'C'),
                           (104, 109, 111, 'B'),
                           (111, 116, 118, 'D'),
                           (118, 123, 125, 'D'),
                           (125, 130, 132, 'A'),
                           (132, 137, 139, 'C'),
                           (139, 142, 144, 'A'),
                           (144, 149, 151, 'D'),
                           (151, 156, 158, 'B'),
                           (158, 163, 165, 'A'),
                           (165, 170, 172, 'B'),
                           (172, 178, 180, 'B'),
                           (180, 185, 187, 'D'),
                           (187, 193, 195, 'A'),
                           (195, 200, 202, 'D'),
                           (202, 208, 210, 'A'),
                           (211, 215, 217, ''),
                           (217, 221, 224, ''),
                           (224, 231, 236, ''),
                           (236, 245, 249, ''),
                           (249, 262, 267, '')]}}

CORRECTIONS = {
 ('zj-2017-11',5): {
  'answer':'C',
  'sourceNote':'已勘误：原Word将B着色为答案，但同题公开解析明确选C，且与本卷原文解析一致，正确项为“高龄生育会提高遗传病的发病风险”。此处答案改为C。',
  'sourceUrl':'https://zy.21cnjy.com/20406612',
  'verificationUrls':['https://zy.21cnjy.com/20406612','https://www.yeyulingfeng.com/wendang/208393.html'],
 },
 ('zj-2017-04',13): {
  'replace':('错误的是','正确的是'),
  'sourceNote':'已勘误：原Word题干误写“错误的是”。经二一教育所发布的同题真题及解析核实，应为“正确的是”，答案D；保留原Word的选项与解析。',
  'sourceUrl':'https://zy.21cnjy.com/20403523',
 },
 ('zj-2017-04',20): {
  'replace':('该实验为证明','该实验未证明'),
  'sourceNote':'已勘误：原Word的D项“该实验为证明”应为“该实验未证明”。经二一教育所发布的同题真题及公开解析核实，题干问正确项，答案仍为D；保留原Word的其余内容和解析。',
  'sourceUrl':'https://zy.21cnjy.com/25606576',
  'verificationUrls':['https://zy.21cnjy.com/25606576','https://www.yeyulingfeng.com/wendang/91292490.html'],
 },
 ('zj-2019-04',25): {
  'sourceNote':'已核实：新浪教育转载的原卷题干问“下列推测错误的是”，原卷参考答案为D，与所提供Word一致。三次复制后被标记DNA单链占7/8，D项的3/4为错误推测；题干、选项和答案沿用原Word。',
  'sourceUrl':'https://edu.sina.com.cn/gaokao/2019-04-13/doc-ihvhiqax2050671-p5.shtml',
 },
}

def paragraph(s):
 p=etree.Element('p');p.text=s;return p

def strip_number(node,number):
 slots=node.xpath('.//text()');raw=''.join(str(x) for x in slots)
 match=re.match(r'^\s*((?:\d\s*){1,2})[.．、]\s*',raw)
 if not match or int(re.sub(r'\s','',match[1]))!=number:return
 left=match.end()
 for slot in slots:
  if left<=0:break
  value=str(slot);cut=min(left,len(value));left-=cut
  parent=slot.getparent()
  if slot.is_tail:parent.tail=value[cut:]
  else:parent.text=value[cut:]

def question_nodes(nodes,number):
 """Keep floating diagrams while repairing anchors inside question/option labels."""
 result=copy.deepcopy(nodes)
 for n in list(result):
  floats=[im for im in n.xpath('.//img') if im.get('align') in ('left','right')]
  if not floats:continue
  moved=[]
  for im in floats:
   parent=im.getparent();tail=im.tail;previous=im.getprevious()
   if tail:
    if previous is not None:previous.tail=(previous.tail or '')+tail
    else:parent.text=(parent.text or '')+tail
   parent.remove(im);im.tail=None;p=etree.Element('p');p.append(im);moved.append(p)
  insert=result.index(n)+1 if n is result[0] else result.index(n)
  result[insert:insert]=moved
 for nd in result:
  for el in nd.iter():
   if el.text:el.text=re.sub(r'([A-D])\s+([.．、])',r'\1\2',el.text)
 strip_number(result[0],number)
 return result

def parse_recovered_2018(meta,nodes,recovered):
 """Bind published original question images to the local Word answer explanations."""
 assert [q['number'] for q in recovered]==list(range(1,34))
 result=[]
 for item,(start,_split,end,answer) in zip(recovered,REVIEW['zj-2018-04']['ranges']):
  number=item['number'];tail=nodes[start:end]
  e=next((i for i,n in enumerate(tail) if re.match(r'^【(?:解析|分析|详解|考点)】',text(n))),len(tail))
  prompt='题干与选项见原卷图。 A. 见题图A B. 见题图B C. 见题图C D. 见题图D' if number<=28 else '题干、图表与全部子问见原卷图。'
  answer_nodes,explanation_nodes=tail[:e],tail[e:]
  if number==32:
   # Part (I) explanation precedes the source's separate Part (II) answers.
   answer_nodes=nodes[58:61]+nodes[62:65];explanation_nodes=nodes[61:62]
  q=make_question(meta,number,[paragraph(prompt)],answer_nodes,explanation_nodes,kind=item['type'],correct_answer=answer or None)
  for field in ['stem','stemHtml','options','optionsHtml','sourceUrl','source']:
   q[field]=item[field]
  q['sourceNote']='所提供Word仅含答案解析；题干与选项补自浙江省教育考试院原卷（经新浪教育转载）。原卷图片保留题干、图表及全部子问，答案解析沿用所提供Word。'
  result.append(q)
 return result

def parse_early(meta):
 key=meta['key'];cfg=REVIEW[key];nodes=load_blocks(key)
 if cfg['referenceOnly']:
  recovered_file=ROOT/'imports/zhejiang/2018-04-questions.json'
  if not recovered_file.exists():recovered_file=ROOT/'.work/recovered-2018-04/questions.json'
  if recovered_file.exists():return parse_recovered_2018(meta,nodes,json.loads(recovered_file.read_text()))
  q=make_question(meta,0,[paragraph('2018年4月浙江生物答案与解析（原材料缺少题干，含第1—33题参考答案）')],[],nodes[:74],kind='reference')
  q['id']=key+'-reference';q['sourceNote']='所提供Word仅含28道选择题、5道非选择题的答案解析，没有题干。作为参考资料收录，不参与判分。'
  return [q]
 result=[]
 for number,(start,split,end,answer) in enumerate(cfg['ranges'],1):
  stem=question_nodes(nodes[start:split],number);tail=nodes[split:end]
  correction=CORRECTIONS.get((key,number),{})
  if correction.get('replace'):
   old,new=correction['replace'];matches=0
   for nd in stem:
    for el in nd.iter():
     for field in ('text','tail'):
      value=getattr(el,field)
      if value and old in value:
       matches+=value.count(old);setattr(el,field,value.replace(old,new))
   assert matches==1,(key,number,'source correction no longer matches',matches)
  answer=correction.get('answer',answer)
  if key=='zj-2020-01' and number==16:
   # The source option B punctuation is an otherwise blank 3x9 GIF.
   for nd in stem:
    for el in nd.iter():
     if el.text and el.text.strip()=='B':el.text=el.text.replace('B','B.',1)
  if key=='zj-2017-11':
   if number<=cfg['choiceCount']:
    answer_nodes=[];explanation_nodes=tail
   else:
    e=next((i for i,n in enumerate(tail) if re.match(r'^解析[：\s]',text(n))),len(tail))
    answer_nodes=copy.deepcopy(tail[:e]);explanation_nodes=tail[e:]
    if answer_nodes:strip_number(answer_nodes[0],number)
   if number==6:
    stem.append(paragraph('A．见上图A B．见上图B C．见上图C D．见上图D'))
  else:
   e=next((i for i,n in enumerate(tail) if re.match(r'^(?:【(?:解析|分析|详解|考点)】|解析[：\s])',text(n))),len(tail))
   answer_nodes=tail[:e];explanation_nodes=tail[e:]
  q=make_question(meta,number,stem,answer_nodes,explanation_nodes,'single' if number<=cfg['choiceCount'] else 'subjective',correct_answer=answer or None)
  for field in ('sourceNote','sourceUrl','verificationUrls'):
   if field in correction:q[field]=correction[field]
  result.append(q)
 return result

if __name__=='__main__':
 sources=json.loads((ROOT/'.work/sources.json').read_text());rows=[]
 for meta in sources:
  if meta['key'] in REVIEW:
   questions=parse_early(meta);rows.extend(questions)
   print(meta['key'],len(questions),'records')
 (ROOT/'.work/early.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
