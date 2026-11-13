"""Audit modern exam extraction against original Word HTML without editing the extractor."""
from __future__ import annotations
import hashlib,json,re,sys
from collections import Counter
from pathlib import Path
from lxml import html
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import zhejiang_extract as extract

def compact(value):
 value=re.sub(r'(?<!\d)\d{1,2}[.．、]\s*','',value)
 value=re.sub(r'(?<!\w)[A-D](?:[.．、]|\s)\s*','',value)
 value=re.sub(r'【\s*答案\s*】','',value)
 return re.sub(r'[\sABCD]+','',value)

def content(fragment):
 node=html.fragment_fromstring(fragment or '<div/>',create_parent='div')
 return ''.join(node.itertext())

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def rich_fragments(question):
 return [question['stemHtml'],*question['optionsHtml'],question['answerHtml'],question['explanationHtml']]

sources=[s for s in json.loads((ROOT/'imports/zhejiang/sources.json').read_text()) if s['year']>=2021]
all_questions=[];paper_reports=[];errors=[]
for source in sources:
 key=source['key'];nodes=extract.load_blocks(key);questions=extract.parse_modern(source);all_questions.extend(questions)
 expected=30 if source['year']<=2022 else 24 if key=='zj-2024-01' else 25
 if len(questions)!=expected:errors.append(f'{key}: expected {expected} questions, got {len(questions)}')
 if [q['number'] for q in questions]!=list(range(1,expected+1)):errors.append(f'{key}: nonconsecutive question numbers')
 fragments=[fragment for q in questions for fragment in rich_fragments(q)]
 output_text=''.join(compact(content(fragment)) for fragment in fragments)
 output_images=set()
 for fragment in fragments:
  for image in html.fragment_fromstring(fragment or '<div/>',create_parent='div').iter('img'):
   image_path=ROOT/image.get('src')
   if not image_path.is_file():errors.append(f'{key}: missing output asset {image.get("src")}')
   else:output_images.add(digest(image_path))
 missing_images=[];ignored_images=[];source_images=0;first_answer=next(i for i,n in enumerate(nodes) if re.match(r'^【\s*答案\s*】',extract.text(n)));question_start=max(i for i,n in enumerate(nodes[:first_answer]) if re.match(r'^1[.．]\s*',extract.text(n)))
 for index,node in enumerate(nodes):
  for image in node.iter('img'):
   source_images+=1;image_path=ROOT/'.work/html'/image.get('src');size=Image.open(image_path).size
   if digest(image_path) not in output_images:
    entry={'index':index,'file':image.get('src'),'size':size}
    if index<question_start or max(size)<=4:ignored_images.append(entry)
    else:missing_images.append(entry);errors.append(f'{key}: source image missing from output {entry}')
 # Every text-bearing source node after Q1 must survive somewhere in the output.
 # This catches dropped passages, subquestions, tables, answers, and explanation paragraphs.
 uncovered=[]
 for index,node in enumerate(nodes):
  value=extract.text(node);normalized=compact(value)
  if index>=question_start and len(normalized)>6 and normalized not in output_text and not re.match(r'^(?:二[、．].*|非选择题部分|选择题部分)',value):
   uncovered.append({'index':index,'text':value});errors.append(f'{key}: unrepresented source node {index}: {value[:120]}')
 grouped=[];subjective=[]
 for question in questions:
  qid=question['id'];number=question['number']
  if question['type'] in ('single','multiple'):
   if len(question['options'])!=4:errors.append(f'{qid}: expected four options')
   if not re.fullmatch(r'[A-D]+',question['answer']):errors.append(f'{qid}: invalid answer')
   if re.search(r'【(?:答案|解析|详解)】',question['stem']+''.join(question['options'])):errors.append(f'{qid}: answer or explanation appeared before submission')
   other_details=[int(n) for n in re.findall(r'【\s*(\d{1,2})\s*题详解\s*】',question['explanation']) if int(n)!=number]
   if other_details:errors.append(f'{qid}: leaked neighboring question details {other_details}')
   answer_groups=re.findall(r'(\d{1,2})[.．]\s*[A-D]',content(question['answerHtml']))
   if any(int(n)!=number for n in answer_groups):errors.append(f'{qid}: leaked neighboring grouped answer {answer_groups}')
   if re.search(r'【\s*\d{1,2}\s*题详解',question['explanation']):grouped.append(qid)
  else:
   if not question['answerHtml'] or not question['explanationHtml']:errors.append(f'{qid}: empty subjective answer or explanation')
   subjective.append({'id':qid,'subquestionNumbers':re.findall(r'[（(](\d+)[）)]',question['stem']),'images':question['stemHtml'].count('<img'),'tables':question['stemHtml'].count('<table')})
 # Shared reading materials must occur in every grouped question before its common answer block.
 passages=[]
 for index,node in enumerate(nodes):
  if re.match(r'^阅读下列材料',extract.text(node)):
   first=next(i for i in range(index+1,len(nodes)) if re.match(r'^\d{1,2}(?:[.．]|\s)',extract.text(nodes[i])))
   answer=next(i for i in range(first,len(nodes)) if re.match(r'^【\s*答案\s*】',extract.text(nodes[i])))
   numbers=[]
   for i in range(first,answer):
    match=re.match(r'^(\d{1,2})(?:[.．]|\s)',extract.text(nodes[i]))
    if match:numbers.append(int(match.group(1)))
   passage_text=compact(''.join(extract.text(n) for n in nodes[index:first]))
   for number in numbers:
    question=next(q for q in questions if q['number']==number)
    if passage_text not in compact(content(question['stemHtml'])):errors.append(f'{question["id"]}: missing shared passage from node {index}')
   passages.append({'sourceIndex':index,'firstQuestionIndex':first,'answerIndex':answer,'questions':numbers})
 paper_reports.append({'key':key,'questionCount':len(questions),'subjectiveCount':len(subjective),'sourceBlocks':len(nodes),'sourceImageOccurrences':source_images,'missingContentImages':missing_images,'ignoredCoverOrPunctuationImages':ignored_images,'unrepresentedText':uncovered,'sharedPassages':passages,'isolatedGroupDetails':grouped,'subjectiveStructure':subjective})
report={'questionCount':len(all_questions),'paperCount':len(sources),'errors':errors,'papers':paper_reports}
(ROOT/'.work/modern-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
(ROOT/'.work/modern-current-qa.json').write_text(json.dumps(all_questions,ensure_ascii=False,indent=2))
print(f'Modern extraction QA: {len(sources)} papers / {len(all_questions)} questions / {sum(q["type"]=="subjective" for q in all_questions)} subjective questions')
print(f'Shared reading groups: {sum(len(p["sharedPassages"]) for p in paper_reports)}; content image omissions: {sum(len(p["missingContentImages"]) for p in paper_reports)}; text omissions: {sum(len(p["unrepresentedText"]) for p in paper_reports)}')
for error in errors:print('FAIL:',error)
if errors:raise SystemExit(1)
print('PASS: all source content survives; shared passages, independent answers/details, options and rich assets validated')
