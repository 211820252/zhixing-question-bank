import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const originalContext = { window: {} };
vm.runInNewContext(execFileSync('git', ['show', 'HEAD:data.js'], { cwd: root, encoding: 'utf8', maxBuffer: 4e6 }), originalContext);
const original = JSON.parse(JSON.stringify(originalContext.window.QUESTION_BANK)).filter(question => !question.type);
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7n8AAAAASUVORK5CYII=';
const base = { subject: '测试科目', chapter: '测试试卷', number: 1, stem: '题干', options: [], answer: '', explanation: '' };
const fixtures = [
  { ...base, id: 'single', options: ['甲', '乙'], answer: 'B' },
  { ...base, id: 'multiple', type: 'multiple', options: ['甲', '乙', '丙', '丁', '戊'], answer: 'ACE', optionsHtml: [`<p>甲图<img src="${pixel}" alt="选项示意图"></p>`] },
  { ...base, id: 'judge', type: 'truefalse', options: ['正确', '错误'], answer: 'A' },
  { ...base, id: 'subjective', type: 'subjective', questionType: '实验探究题', stemHtml: `<p>观察图表</p><img src="${pixel}" alt="题干示意图"><table><tr><td>实验组</td><td>对照组</td></tr></table>`, answer: '保密参考答案', answerHtml: `<p>保密参考答案</p><img src="${pixel}" alt="答案示意图">`, explanation: '保密解析' },
  { ...base, id: 'reference', type: 'reference', answer: '仅供查阅的答案资料', answerHtml: '<p>仅供查阅的答案资料</p>' },
];
const server = createServer(async (request, response) => {
  const name = request.url === '/' ? 'index.html' : request.url.slice(1).split('?')[0];
  if (!['index.html', 'app.js', 'styles.css', 'data.js', 'zhejiang-data.js', 'sync.js', 'sync.css'].includes(name)) { response.writeHead(404).end(); return; }
  try {
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    response.end(await readFile(path.join(root, name)));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/sync.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto(url);
  await page.waitForFunction(() => window.zhixingProgress);
  assert.ok(await page.locator('.subject-button').count() > 1, 'real question bank loads');
  console.log('PASS: actual question-bank page loads');

  await page.route('**/zhejiang-data.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**/data.js', route => route.fulfill({ contentType: 'text/javascript', body: `window.QUESTION_BANK=${JSON.stringify([...original, ...fixtures])};` }));
  const legacyRecords = Object.fromEntries(original.map((q, i) => [q.id, { attempts: i % 3 + 1, correct: i % 2 }]));
  const legacy = { version: 1, records: legacyRecords, saved: [original[0].id], wrong: [original[1].id], session: { ids: [original[0].id], answers: { [original[0].id]: original[0].answer }, index: 0 } };
  await page.evaluate(value => localStorage.setItem('zhixing-practice-v1', JSON.stringify(value)), legacy);
  await page.reload();
  await page.waitForFunction(() => window.zhixingProgress);
  let snapshot = await page.evaluate(() => window.zhixingProgress.exportState());
  assert.deepEqual(snapshot.records, legacyRecords);
  assert.equal(snapshot.session.answers[original[0].id], original[0].answer);
  assert.deepEqual(snapshot.saved, legacy.saved);
  assert.deepEqual(snapshot.wrong, legacy.wrong);
  assert.equal(await page.locator('#header-done').textContent(), String(original.length));
  console.log(`PASS: ${original.length} legacy records, old string answers, favorites and wrong answers preserved`);

  await page.evaluate(ids => window.zhixingProgress.applyState({ size: 'all', session: { ids, answers: {}, index: 0 } }), fixtures.map(q => q.id));
  await page.locator('.option-button').nth(1).click();
  snapshot = await page.evaluate(() => window.zhixingProgress.exportState());
  assert.equal(snapshot.session.answers.single, 'B');
  assert.deepEqual(snapshot.records.single, { attempts: 1, correct: 1 });
  await page.locator('#question-palette button').nth(1).click();
  assert.equal(await page.locator('.feedback').count(), 0);
  for (const index of [0, 2, 4]) await page.locator('.option-button').nth(index).click();
  assert.equal(await page.locator('.option-button.selected').count(), 3);
  assert.equal(await page.locator('#round-done').textContent(), '1');
  assert.equal(await page.getByAltText('选项示意图').count(), 1);
  await page.reload();
  assert.equal(await page.locator('.option-button.selected').count(), 3);
  await page.getByRole('button', { name: '提交答案', exact: true }).click();
  assert.equal(await page.locator('.feedback-heading').textContent(), '回答正确');
  snapshot = await page.evaluate(() => window.zhixingProgress.exportState());
  assert.equal(snapshot.session.answers.multiple, 'ACE');
  assert.equal(await page.locator('#round-correct').textContent(), '2');
  console.log('PASS: single answer compatibility, five-option multiple selection, explicit submission and draft refresh');

  await page.locator('#question-palette button').nth(2).click();
  await page.getByRole('button', { name: 'A 正确', exact: true }).click();
  assert.equal(await page.locator('.feedback-heading').textContent(), '回答正确');
  await page.locator('#question-palette button').nth(3).click();
  assert.equal(await page.getByAltText('题干示意图').count(), 1);
  assert.equal(await page.locator('.table-scroll table').count(), 1);
  assert.equal(await page.getByAltText('答案示意图').count(), 0);
  assert.equal(await page.getByText('保密参考答案', { exact: true }).count(), 0);
  assert.equal(await page.getByText('保密解析', { exact: true }).count(), 0);
  await page.getByRole('button', { name: '☆ 收藏本题', exact: true }).click();
  await page.getByRole('button', { name: '查看参考答案', exact: true }).click();
  assert.equal(await page.locator('#round-done').textContent(), '3');
  assert.equal(await page.getByAltText('答案示意图').count(), 1);
  snapshot = await page.evaluate(() => window.zhixingProgress.exportState());
  assert.equal(snapshot.records.subjective, undefined);
  assert.deepEqual(snapshot.session.answers.subjective, { revealed: true });
  await page.reload();
  assert.equal(await page.getByAltText('答案示意图').count(), 1);
  assert.equal(await page.locator('#round-done').textContent(), '3');
  await page.getByRole('button', { name: '我做错了', exact: true }).click();
  assert.equal(await page.locator('#round-wrong').textContent(), '1');
  assert.equal(await page.locator('#round-done').textContent(), '4');
  assert.ok((await page.locator('#question-palette button').nth(3).getAttribute('class')).includes('wrong'));
  await page.reload();
  snapshot = await page.evaluate(() => window.zhixingProgress.exportState());
  assert.deepEqual(snapshot.session.answers.subjective, { revealed: true, correct: false });
  assert.deepEqual(snapshot.records.subjective, { attempts: 1, correct: 0 });
  assert.deepEqual(snapshot.wrong, ['subjective']);
  assert.deepEqual(snapshot.saved, ['subjective']);
  assert.equal(await page.getByRole('button', { name: '我做错了', exact: true }).count(), 0);
  const downloadReady = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出进度', exact: true }).click();
  const download = await downloadReady;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.version, 1);
  assert.deepEqual(exported.session.answers.subjective, { revealed: true, correct: false });
  assert.equal(exported.session.answers.multiple, 'ACE');
  await page.locator('#import-file').setInputFiles({ name: 'round-trip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  assert.deepEqual((await page.evaluate(() => window.zhixingProgress.exportState())).records, exported.records);
  console.log('PASS: subjective rich content hidden until reveal, no completion until self-assessment, refresh and wrong/favorite persistence; export/import round-trip');

  await page.locator('#question-palette button').nth(4).click();
  assert.equal(await page.getByText('仅供查阅的答案资料', { exact: true }).count(), 0);
  await page.getByRole('button', { name: '查看资料', exact: true }).click();
  assert.equal(await page.getByText('仅供查阅的答案资料', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '我做对了', exact: true }).count(), 0);
  assert.equal(await page.locator('#round-done').textContent(), '4');
  assert.equal(await page.locator('#session-progress-text').textContent(), '4 / 4 · 1 份资料');
  assert.equal((await page.evaluate(() => window.zhixingProgress.exportState())).records.reference, undefined);
  await page.reload();
  assert.equal(await page.getByText('仅供查阅的答案资料', { exact: true }).count(), 1);
  await page.selectOption('#question-type', 'reference');
  assert.equal(await page.locator('#round-count').textContent(), '0 题 · 1 份资料');
  assert.equal(await page.locator('#round-done').textContent(), '0');
  console.log('PASS: reference-only materials reveal and refresh without self-assessment or practice statistics');

  await page.selectOption('#question-type', 'subjective');
  assert.equal(await page.locator('#round-count').textContent(), '1 题');
  await page.getByRole('tab', { name: '未做', exact: true }).click();
  assert.equal(await page.locator('#round-count').textContent(), '0 题');
  await page.getByRole('tab', { name: '错题', exact: true }).click();
  assert.equal(await page.locator('#round-count').textContent(), '1 题');
  await page.getByRole('button', { name: '查看参考答案', exact: true }).click();
  await page.getByRole('button', { name: '我做对了', exact: true }).click();
  snapshot = await page.evaluate(() => window.zhixingProgress.exportState());
  assert.deepEqual(snapshot.records.subjective, { attempts: 2, correct: 1 });
  assert.equal(await page.locator('#round-correct').textContent(), '1');
  console.log('PASS: type/unanswered/wrong filters and correct subjective self-assessment');

  await page.evaluate(() => window.zhixingProgress.applyState({ session: { ids: ['multiple'], answers: {}, index: 0 } }));
  await page.keyboard.press('1');
  await page.keyboard.press('5');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.feedback-heading').textContent(), '回答错误');
  snapshot = await page.evaluate(() => window.zhixingProgress.exportState());
  assert.equal(snapshot.session.answers.multiple, 'AE');
  assert.deepEqual(snapshot.records.multiple, { attempts: 1, correct: 0 });
  assert.deepEqual(snapshot.wrong, ['multiple']);
  console.log('PASS: keyboard supports option 5, incomplete multiple answers are wrong and enter wrong-answer collection');

  await page.evaluate(() => {
    window.testEvents = [];
    window.testUnsubscribe = window.zhixingProgress.subscribe((value, metadata) => window.testEvents.push({ value, metadata }));
  });
  const malformedLegacy = { ...legacy, records: { ...legacyRecords, multiple: { attempts: -1, correct: 999 } }, session: { ids: [original[0].id, original[0].id, 'deleted'], answers: { [original[0].id]: original[0].answer }, index: -50 } };
  await page.locator('#import-file').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(malformedLegacy)) });
  await page.waitForFunction(() => window.testEvents?.some(e => e.metadata.source === 'import'));
  snapshot = await page.evaluate(() => window.zhixingProgress.exportState());
  assert.deepEqual(snapshot.records, legacyRecords);
  assert.deepEqual(snapshot.session.ids, [original[0].id]);
  assert.equal(snapshot.session.index, 0);
  await page.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"records":[],"wrong":[],"saved":[]}') });
  assert.deepEqual((await page.evaluate(() => window.zhixingProgress.exportState())).records, legacyRecords);
  console.log('PASS: backup import sanitizes invalid entries, preserves legacy records, rejects invalid root and notifies sync adapter');

  await page.evaluate(() => localStorage.setItem('zhixing-practice-v1', JSON.stringify({ records: [], wrong: 'bad', saved: {}, session: { ids: ['subjective'], answers: 'bad', index: {} } })));
  await page.reload();
  assert.equal(await page.getByRole('button', { name: '查看参考答案', exact: true }).count(), 1);
  assert.equal(await page.locator('#header-done').textContent(), '0');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (process.env.FRONTEND_SCREENSHOT) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: process.env.FRONTEND_SCREENSHOT, fullPage: false });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: malformed local state recovers without errors; mobile page has no horizontal overflow');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
