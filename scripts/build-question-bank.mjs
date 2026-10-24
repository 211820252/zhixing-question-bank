import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const input = process.argv[2] || '/Users/zjk/Desktop/题目.txt';
const source = readFileSync(input, 'utf8');
const output = resolve(import.meta.dirname, '../data.js');

const subjects = [
  { name: '教育学', questionStart: '教育学部分第一章', answerStart: '教育学答案第一章', chapters: 11 },
  { name: '心理学', questionStart: '心理学部分第一章', answerStart: '心理学答案第一章', chapters: 10 },
  { name: '教育政策与法规', questionStart: '教育政策与法规部分一、选择题', answerStart: '教育政策与法规答案', chapters: 1 },
];

function clean(value) {
  return value.replace(/[\u00a0\u200b\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
}

function chapterRanges(text, count, fallbackName) {
  if (count === 1) return [{ title: fallbackName, body: text }];
  const matches = [...text.matchAll(/第[一二三四五六七八九十]+章\s*[^一二三四五六七八九十]*?(?=一[、.．]选择题|1[.．])/g)];
  if (matches.length !== count) throw Error(`${fallbackName}: found ${matches.length} chapter headings, expected ${count}`);
  return matches.map((match, index) => ({
    title: clean(match[0].replace(/一[、.．]选择题$/, '')),
    body: text.slice(match.index, matches[index + 1]?.index ?? text.length),
  }));
}

function choiceSection(body) {
  const start = body.search(/一[、.．]选择题/);
  const content = body.slice(start < 0 ? 0 : start + 5);
  const end = content.search(/二[、.．]名词解释/);
  return end < 0 ? content : content.slice(0, end);
}

function sequentialMarkers(text, pattern, label) {
  const matches = [...text.matchAll(pattern)];
  const result = [];
  let expected = 1;
  for (const match of matches) {
    const number = Number(match[1]);
    if (number === expected) {
      result.push({ index: match.index, length: match[0].length, number, extra: match[2] });
      expected++;
    }
  }
  if (!result.length) throw Error(`${label}: no numbered entries`);
  return result;
}

function splitOptions(text) {
  const normalized = text.replace(/[ＡＢＣＤ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 65248));
  const markers = [...normalized.matchAll(/([ABCD])[.．、]/g)];
  for (let index = 0; index <= markers.length - 4; index++) {
    const four = markers.slice(index, index + 4);
    if (four.map(match => match[1]).join('') !== 'ABCD') continue;
    const stem = clean(normalized.slice(0, four[0].index));
    const options = four.map((match, optionIndex) => clean(normalized.slice(match.index + match[0].length, four[optionIndex + 1]?.index ?? normalized.length)));
    if (stem && options.every(Boolean)) return { stem, options };
  }
  return null;
}

function parseQuestions(section, label) {
  section = clean(section)
    .replace('8某寄宿小学派车', '8.某寄宿小学派车')
    .replace('36招生选拔的标准', '36.招生选拔的标准')
    .replace('25.提出社会学习理论的心理学家是( )26. A.', '25.提出社会学习理论的心理学家是( )A.')
    .replace('27. 认为社会学习是通过观察.模仿而完成的', '26.认为社会学习是通过观察.模仿而完成的')
    .replace('28. A.布鲁纳 B.班杜拉', 'A.布鲁纳 B.班杜拉')
    .replace('29.认知目的说，社会学习理论属于', '27.认知目的说，社会学习理论属于')
    .replace('A.适应每个学生的不同需要尽可能地进行有针对性的教育C.教师要严格按照科学知识的内在逻辑和学生的认知发展规律进行教学B.让所有学生都达到同一规格和基本标准', 'A.适应每个学生的不同需要尽可能地进行有针对性的教育B.让所有学生都达到同一规格和基本标准C.教师要严格按照科学知识的内在逻辑和学生的认知发展规律进行教学')
    .replace('B.夸美纽斯的《大教学论》B.洛克的《教育漫画》', 'B.夸美纽斯的《大教学论》C.洛克的《教育漫画》')
    .replace('C.横向迁移 D纵向迁移', 'C.横向迁移 D.纵向迁移');
  const markers = [];
  let cursor = 0;
  for (let number = 1; number <= 500; number++) {
    const candidates = [...section.matchAll(new RegExp(`${number}[.．]{1,2}`, 'g'))].filter(match => match.index >= cursor).slice(0, 8);
    if (!candidates.length) break;
    const previous = markers.at(-1);
    const match = previous
      ? candidates.find(candidate => splitOptions(section.slice(previous.index + previous.length, candidate.index))) ?? candidates[0]
      : candidates[0];
    const index = match.index;
    markers.push({ index, length: match[0].length, number });
    cursor = index + match[0].length;
  }
  if (!markers.length) throw Error(`${label}: no numbered questions`);
  return markers.map((marker, index) => {
    const raw = section.slice(marker.index + marker.length, markers[index + 1]?.index ?? section.length);
    const parsed = splitOptions(raw);
    return { number: marker.number, ...parsed, raw: clean(raw) };
  });
}

function parseAnswers(section, label) {
  const markers = sequentialMarkers(section, /(?:^|(?<!\d))(\d{1,3})[.．]\s*([A-D]{1,4})(?=【|\s|[.．、。])/g, label);
  return markers.map((marker, index) => ({
    number: marker.number,
    answer: marker.extra,
    explanation: clean(section.slice(marker.index + marker.length, markers[index + 1]?.index ?? section.length).replace(/^【解析】/, '')),
  }));
}

const boundaries = subjects.map(subject => ({
  ...subject,
  q: source.indexOf(subject.questionStart),
  a: source.indexOf(subject.answerStart),
}));
if (boundaries.some(item => item.q < 0 || item.a < 0)) throw Error('Could not find a subject boundary');

const bank = [];
const report = [];
for (let subjectIndex = 0; subjectIndex < boundaries.length; subjectIndex++) {
  const subject = boundaries[subjectIndex];
  const questionText = source.slice(subject.q, boundaries[subjectIndex + 1]?.q ?? boundaries[0].a);
  const answerText = source.slice(subject.a, boundaries[subjectIndex + 1]?.a ?? source.length);
  const questionChapters = chapterRanges(questionText, subject.chapters, subject.name);
  const answerChapters = chapterRanges(answerText, subject.chapters, subject.name);
  for (let chapterIndex = 0; chapterIndex < subject.chapters; chapterIndex++) {
    const title = questionChapters[chapterIndex].title;
    const questions = parseQuestions(choiceSection(questionChapters[chapterIndex].body), title);
    const answers = parseAnswers(choiceSection(answerChapters[chapterIndex].body), title);
    const answerMap = new Map(answers.map(item => [item.number, item]));
    const valid = questions.filter(question => question.stem && answerMap.has(question.number));
    const rejected = questions.filter(question => !question.stem || !answerMap.has(question.number));
    report.push({ subject: subject.name, chapter: title, questions: questions.length, answers: answers.length, valid: valid.length, rejected: rejected.map(item => `${item.number}: ${item.raw.slice(0, 45)}`) });
    if (questions.length !== answers.length || rejected.length) throw Error(`${title}: question/answer mismatch`);
    for (const question of valid) {
      const answer = answerMap.get(question.number);
      bank.push({
        id: `${subjectIndex + 1}-${chapterIndex + 1}-${question.number}`,
        subject: subject.name,
        chapter: title,
        number: question.number,
        stem: question.stem,
        options: question.options,
        answer: answer.answer,
        explanation: answer.explanation,
      });
    }
  }
}

writeFileSync(output, `window.QUESTION_BANK = ${JSON.stringify(bank)};\n`);
console.table(report);
console.log(`Wrote ${bank.length} questions to ${output}`);
