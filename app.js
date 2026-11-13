(() => {
  'use strict';

  const questions = window.QUESTION_BANK || [];
  const byId = new Map(questions.map(question => [question.id, question]));
  const storageKey = 'zhixing-practice-v1';
  const subjects = ['全部科目', ...new Set(questions.map(question => question.subject))];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const questionTypes = ['all', 'choice', 'truefalse', 'subjective', 'reference'];
  const typeLabels = { single: '单选题', multiple: '多选题', truefalse: '判断题', subjective: '大题', reference: '解析资料' };
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const typeOf = question => Object.hasOwn(typeLabels, question.type) ? question.type : 'single';

  function normalizeAnswer(question, value) {
    if (typeof value !== 'string') return '';
    const selected = value.toUpperCase().replace(/\s/g, '');
    const validLetters = letters.slice(0, question.options?.length || 0);
    if (!selected || [...selected].some(letter => !validLetters.includes(letter))) return '';
    const normalized = [...new Set(selected)].sort().join('');
    return typeOf(question) === 'multiple' || normalized.length === 1 ? normalized : '';
  }

  function isAnswered(question, value) {
    if (typeOf(question) === 'reference') return false;
    return typeOf(question) === 'subjective'
      ? isObject(value) && value.revealed === true && typeof value.correct === 'boolean'
      : Boolean(normalizeAnswer(question, value));
  }

  function isCorrect(question, value) {
    return typeOf(question) === 'subjective'
      ? isAnswered(question, value) && value.correct
      : isAnswered(question, value) && normalizeAnswer(question, value) === normalizeAnswer(question, question.answer);
  }

  function normalizeState(saved) {
    const raw = isObject(saved) ? saved : {};
    const records = {};
    if (isObject(raw.records)) {
      for (const [id, record] of Object.entries(raw.records)) {
        if (!byId.has(id) || typeOf(byId.get(id)) === 'reference' || !isObject(record) || !Number.isSafeInteger(record.attempts) || record.attempts < 1) continue;
        records[id] = { attempts: record.attempts, correct: Number.isSafeInteger(record.correct) ? Math.min(record.attempts, Math.max(0, record.correct)) : 0 };
      }
    }
    let session = null;
    if (isObject(raw.session) && Array.isArray(raw.session.ids)) {
      const ids = [...new Set(raw.session.ids.filter(id => byId.has(id)))];
      const answers = {};
      const drafts = {};
      for (const id of ids) {
        const question = byId.get(id);
        const value = isObject(raw.session.answers) ? raw.session.answers[id] : undefined;
        if (['subjective', 'reference'].includes(typeOf(question))) {
          if (isObject(value) && value.revealed === true) {
            answers[id] = { revealed: true };
            if (typeOf(question) === 'subjective' && typeof value.correct === 'boolean') answers[id].correct = value.correct;
          }
        } else {
          const normalized = normalizeAnswer(question, value);
          if (normalized) answers[id] = normalized;
          if (!normalized && typeOf(question) === 'multiple' && isObject(raw.session.drafts)) {
            const draft = normalizeAnswer(question, raw.session.drafts[id]);
            if (draft) drafts[id] = draft;
          }
        }
      }
      const index = Number.isSafeInteger(raw.session.index) ? raw.session.index : 0;
      session = { ids, answers, drafts, index: Math.min(Math.max(index, 0), Math.max(0, ids.length - 1)), order: raw.session.order === 'random' ? 'random' : 'sequential' };
    }
    return {
      subject: subjects.includes(raw.subject) ? raw.subject : '全部科目',
      chapter: typeof raw.chapter === 'string' ? raw.chapter : '全部章节',
      questionType: questionTypes.includes(raw.questionType) ? raw.questionType : 'all',
      mode: ['all', 'unanswered', 'wrong', 'saved'].includes(raw.mode) ? raw.mode : 'all',
      size: ['20', '50', 'all'].includes(raw.size) ? raw.size : '20',
      records, wrong: new Set((Array.isArray(raw.wrong) ? raw.wrong : []).filter(id => byId.has(id) && typeOf(byId.get(id)) !== 'reference')),
      saved: new Set((Array.isArray(raw.saved) ? raw.saved : []).filter(id => byId.has(id))), session,
    };
  }
  const $ = id => document.getElementById(id);

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && typeof saved === 'object') return saved;
    } catch { /* Local files may have storage disabled in some browsers. */ }
    return {};
  }

  const progressListeners = new Set();
  const state = normalizeState(loadState());
  if (!chapters().includes(state.chapter)) state.chapter = '全部章节';

  function exportState() {
    return JSON.parse(JSON.stringify({
      version: 1, subject: state.subject, chapter: state.chapter, questionType: state.questionType,
      mode: state.mode, size: state.size, records: state.records,
      wrong: [...state.wrong], saved: [...state.saved], session: state.session,
    }));
  }

  function saveState(source = 'local', notify = true) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(exportState()));
    } catch { toast('浏览器未能保存进度，请使用“导出进度”备份'); }
    if (notify) {
      for (const listener of progressListeners) {
        try { listener(exportState(), { source }); }
        catch (error) { console.error('进度订阅更新失败', error); }
      }
    }
  }

  function applyState(nextState, { notify = false, source = 'sync' } = {}) {
    Object.assign(state, normalizeState(nextState));
    if (!chapters().includes(state.chapter)) state.chapter = '全部章节';
    if (!state.session?.ids.length) startSession('sequential', { notify, source });
    else { saveState(source, notify); render(); }
  }

  let toastTimer;
  function toast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
  }

  function chapters() {
    return [...new Set(questions.filter(q => state.subject === '全部科目' || q.subject === state.subject).map(q => q.chapter))];
  }

  function pool() {
    return questions.filter(question => {
      if (state.subject !== '全部科目' && question.subject !== state.subject) return false;
      if (state.chapter !== '全部章节' && question.chapter !== state.chapter) return false;
      const type = typeOf(question);
      if (state.questionType === 'choice' && !['single', 'multiple'].includes(type)) return false;
      if (['truefalse', 'subjective', 'reference'].includes(state.questionType) && type !== state.questionType) return false;
      if (state.mode === 'unanswered' && state.records[question.id]) return false;
      if (state.mode === 'wrong' && !state.wrong.has(question.id)) return false;
      if (state.mode === 'saved' && !state.saved.has(question.id)) return false;
      return true;
    });
  }

  function startSession(order, { notify = true, source = 'local' } = {}) {
    const items = pool().slice();
    if (order === 'random') {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
    } else if (state.mode === 'all') {
      items.sort((a, b) => Number(Boolean(state.records[a.id])) - Number(Boolean(state.records[b.id])));
    }
    const limit = state.size === 'all' ? items.length : Number(state.size);
    state.session = { ids: items.slice(0, limit).map(item => item.id), answers: {}, drafts: {}, index: 0, order };
    saveState(source, notify);
    render();
    if (!items.length) toast('当前范围没有题目');
  }

  function setSubject(subject) {
    state.subject = subject;
    state.chapter = '全部章节';
    closeSidebar();
    startSession('sequential');
  }

  function setChapter(chapter) {
    state.chapter = chapter;
    closeSidebar();
    startSession('sequential');
  }

  function setMode(mode) {
    state.mode = mode;
    startSession('sequential');
  }

  function currentQuestion() {
    const session = state.session;
    return byId.get(session?.ids[session.index]);
  }

  function recordAnswer(question, value) {
    if (typeOf(question) === 'reference') return;
    const id = question.id;
    if (isAnswered(question, state.session.answers[id])) return;
    const correct = isCorrect(question, value);
    state.session.answers[id] = value;
    delete state.session.drafts[id];
    const record = state.records[id] || { attempts: 0, correct: 0 };
    record.attempts++;
    if (correct) record.correct++;
    state.records[id] = record;
    if (!correct) state.wrong.add(id);
    saveState();
    render();
  }

  function answer(letter) {
    const question = currentQuestion();
    if (!question || ['subjective', 'reference'].includes(typeOf(question)) || isAnswered(question, state.session.answers[question.id])) return;
    if (!normalizeAnswer(question, letter)) return;
    if (typeOf(question) === 'multiple') {
      const selected = new Set(state.session.drafts[question.id] || '');
      if (selected.has(letter)) selected.delete(letter); else selected.add(letter);
      state.session.drafts[question.id] = [...selected].sort().join('');
      saveState();
      renderQuestion();
      return;
    }
    recordAnswer(question, letter);
  }

  function submitMultiple() {
    const question = currentQuestion();
    if (!question || typeOf(question) !== 'multiple') return;
    const selected = normalizeAnswer(question, state.session.drafts[question.id]);
    if (selected) recordAnswer(question, selected);
  }

  function revealAnswer(question) {
    state.session.answers[question.id] = { revealed: true };
    saveState();
    renderQuestion();
  }

  function selfAssess(question, correct) {
    if (typeOf(question) !== 'subjective' || state.session.answers[question.id]?.revealed !== true) return;
    recordAnswer(question, { revealed: true, correct });
  }

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  // HTML fields are sanitized by the question-bank generator; plain text stays the fallback.
  function richEl(tag, className, content, html) {
    const node = el(tag, className, content);
    if (typeof html === 'string' && html.trim()) {
      node.innerHTML = html;
      node.classList.add('rich-content');
      for (const table of node.querySelectorAll('table')) {
        const scroll = el('div', 'table-scroll');
        table.replaceWith(scroll);
        scroll.append(table);
      }
    }
    return node;
  }

  function renderSidebar() {
    const subjectList = $('subject-list');
    subjectList.replaceChildren();
    for (const subject of subjects) {
      const count = subject === '全部科目' ? questions.length : questions.filter(q => q.subject === subject).length;
      const button = el('button', `subject-button${state.subject === subject ? ' active' : ''}`);
      button.type = 'button';
      button.append(el('span', '', subject), el('small', '', String(count)));
      button.onclick = () => setSubject(subject);
      subjectList.append(button);
    }
    const chapterList = $('chapter-list');
    chapterList.replaceChildren();
    const allChapters = chapters();
    $('chapter-count').textContent = `${allChapters.length} 章`;
    for (const chapter of ['全部章节', ...allChapters]) {
      const count = chapter === '全部章节'
        ? questions.filter(q => state.subject === '全部科目' || q.subject === state.subject).length
        : questions.filter(q => q.chapter === chapter && (state.subject === '全部科目' || q.subject === state.subject)).length;
      const button = el('button', `chapter-button${state.chapter === chapter ? ' active' : ''}`);
      button.type = 'button';
      button.append(el('span', '', chapter.replace(/\s+/g, ' ')), el('small', '', String(count)));
      button.onclick = () => setChapter(chapter);
      chapterList.append(button);
    }
  }

  function renderHeader() {
    const records = Object.values(state.records).filter(record => record && typeof record.attempts === 'number');
    const attempts = records.reduce((sum, record) => sum + record.attempts, 0);
    const correct = records.reduce((sum, record) => sum + (record.correct || 0), 0);
    $('header-done').textContent = String(records.length);
    $('header-accuracy').textContent = attempts ? `${Math.round(correct / attempts * 100)}%` : '--';
    $('scope-label').textContent = [state.subject, state.chapter !== '全部章节' ? state.chapter.replace(/\s+/g, ' ') : null].filter(Boolean).join(' · ');
    $('session-size').value = state.size;
    $('question-type').value = state.questionType;
    for (const button of $('mode-tabs').querySelectorAll('button')) {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    }
  }

  function renderSession() {
    const session = state.session;
    const ids = session?.ids || [];
    const practiceIds = ids.filter(id => typeOf(byId.get(id)) !== 'reference');
    const referenceCount = ids.length - practiceIds.length;
    const answered = practiceIds.filter(id => isAnswered(byId.get(id), session.answers[id]));
    const correct = answered.filter(id => isCorrect(byId.get(id), session.answers[id])).length;
    const wrong = answered.length - correct;
    $('session-status').textContent = session?.order === 'random' ? '随机练习' : '顺序练习';
    $('session-progress-text').textContent = `${answered.length} / ${practiceIds.length}${referenceCount ? ` · ${referenceCount} 份资料` : ''}`;
    $('progress-bar').style.width = `${practiceIds.length ? answered.length / practiceIds.length * 100 : 0}%`;
    $('round-count').textContent = `${practiceIds.length} 题${referenceCount ? ` · ${referenceCount} 份资料` : ''}`;
    $('round-done').textContent = String(answered.length);
    $('round-correct').textContent = String(correct);
    $('round-wrong').textContent = String(wrong);
    $('question-position').textContent = ids.length ? `第 ${session.index + 1} / ${ids.length} 题` : '暂无题目';
    $('prev-button').disabled = !ids.length || session.index === 0;
    $('next-button').disabled = !ids.length || session.index >= ids.length - 1;

    const palette = $('question-palette');
    palette.replaceChildren();
    ids.forEach((id, index) => {
      const selected = isAnswered(byId.get(id), session.answers[id]);
      const result = selected ? (isCorrect(byId.get(id), session.answers[id]) ? 'correct' : 'wrong') : '';
      const button = el('button', `${result}${index === session.index ? ' current' : ''}`, String(index + 1));
      button.type = 'button';
      button.title = `第 ${index + 1} 题${selected ? `，${result === 'correct' ? '正确' : '错误'}` : ''}`;
      button.onclick = () => { session.index = index; saveState(); render(); };
      palette.append(button);
    });
  }

  function renderQuestion() {
    const area = $('question-area');
    area.replaceChildren();
    const session = state.session;
    const id = session?.ids[session.index];
    if (!id) {
      const empty = el('div', 'empty-state');
      empty.append(el('h2', '', state.mode === 'wrong' ? '没有待复习的错题' : state.mode === 'saved' ? '还没有收藏题目' : '当前范围没有题目'));
      empty.append(el('p', '', state.mode === 'unanswered' ? '这一范围的题目已经练完。' : '切换科目、章节、题型或题目范围继续练习。'));
      if (state.mode !== 'all') {
        const reset = el('button', '', '查看全部题目');
        reset.type = 'button';
        reset.onclick = () => setMode('all');
        empty.append(reset);
      }
      area.append(empty);
      return;
    }

    const question = byId.get(id);
    const type = typeOf(question);
    const selected = session.answers[id];
    const answered = isAnswered(question, selected);
    const meta = el('div', 'question-meta');
    meta.append(el('span', 'number', `${type === 'reference' ? '资料' : '题目'} ${String(session.index + 1).padStart(2, '0')} · ${question.questionType || typeLabels[type]}`), el('span', '', `${question.subject} · ${question.chapter.replace(/\s+/g, ' ')} · 原题 ${question.number}`));
    const title = richEl('div', 'question-title', question.stem, question.stemHtml);
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '2');
    area.append(meta, title);

    if (['subjective', 'reference'].includes(type)) {
      area.append(el('p', 'question-hint', type === 'reference' ? '本资料的原文件仅含答案解析，未提供题干，可查阅和收藏，不计入练习统计。' : '请先独立思考或在纸上作答，再查看参考答案并自评。自评后才会计入已做。'));
      if (selected?.revealed !== true) {
        const reveal = el('button', 'answer-command primary-command', type === 'reference' ? '查看资料' : '查看参考答案');
        reveal.type = 'button';
        reveal.onclick = () => revealAnswer(question);
        area.append(reveal);
      } else {
        const feedback = el('div', `feedback${answered && !selected.correct ? ' incorrect' : ''}`);
        feedback.append(el('div', 'feedback-heading', type === 'reference' ? '解析资料' : answered ? (selected.correct ? '自评正确' : '自评错误') : '参考答案 · 待自评'));
        feedback.append(richEl('div', 'feedback-answer reference-answer', question.answer, question.answerHtml));
        if (question.explanation || question.explanationHtml) feedback.append(richEl('div', 'feedback-explanation', question.explanation, question.explanationHtml));
        area.append(feedback);
        if (type === 'subjective' && !answered) {
          const assessment = el('div', 'assessment-actions');
          for (const [label, correct] of [['我做对了', true], ['我做错了', false]]) {
            const button = el('button', `answer-command ${correct ? 'primary-command' : 'secondary-command'}`, label);
            button.type = 'button';
            button.onclick = () => selfAssess(question, correct);
            assessment.append(button);
          }
          area.append(assessment);
        }
      }
    } else {
      if (type === 'multiple') area.append(el('p', 'question-hint', '本题为多选题，请选出所有正确选项后提交。'));
      const options = el('div', 'option-list');
      const pending = session.drafts[id] || '';
      const correctAnswer = normalizeAnswer(question, question.answer);
      question.options.forEach((option, index) => {
        const letter = letters[index];
        const result = answered ? (correctAnswer.includes(letter) ? ' correct' : selected.includes(letter) ? ' wrong' : ' muted') : pending.includes(letter) ? ' selected' : '';
        const button = el('button', `option-button${result}`);
        button.type = 'button';
        button.disabled = answered;
        if (type === 'multiple') button.setAttribute('aria-pressed', String((answered ? selected : pending).includes(letter)));
        button.append(el('span', 'option-letter', letter), richEl('span', 'option-content', option, question.optionsHtml?.[index]));
        button.onclick = () => answer(letter);
        options.append(button);
      });
      area.append(options);
      if (type === 'multiple' && !answered) {
        const submit = el('button', 'answer-command primary-command', '提交答案');
        submit.type = 'button';
        submit.disabled = !pending;
        submit.onclick = submitMultiple;
        area.append(submit);
      }
      if (answered) {
        const correct = isCorrect(question, selected);
        const feedback = el('div', `feedback${correct ? '' : ' incorrect'}`);
        feedback.append(el('div', 'feedback-heading', correct ? '回答正确' : '回答错误'));
        const answerText = [...correctAnswer].map(letter => `${letter} · ${question.options[letters.indexOf(letter)]}`).join('；');
        feedback.append(richEl('div', 'feedback-answer', `正确答案：${answerText}`, question.answerHtml ? `<strong>正确答案：${correctAnswer}</strong>${question.answerHtml}` : undefined));
        if (type === 'multiple') feedback.append(el('div', 'feedback-answer', `你的答案：${selected}`));
        if (question.explanation || question.explanationHtml) feedback.append(richEl('div', 'feedback-explanation', question.explanation, question.explanationHtml));
        area.append(feedback);
      }
    }

    if (question.sourceNote && (answered || selected?.revealed === true)) {
      const note = el('aside', 'source-note', question.sourceNote);
      const sourceUrl = question.sourceUrl || question.sourceURL;
      if (typeof sourceUrl === 'string' && /^https:\/\//.test(sourceUrl)) {
        const link = el('a', '', '查看核对来源');
        link.href = sourceUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        note.append(document.createTextNode(' '), link);
      }
      area.append(note);
    }

    const actions = el('div', 'question-actions');
    const saveButton = el('button', `text-action${state.saved.has(id) ? ' active' : ''}`, state.saved.has(id) ? '★ 已收藏' : '☆ 收藏本题');
    saveButton.type = 'button';
    saveButton.onclick = () => {
      if (state.saved.has(id)) state.saved.delete(id); else state.saved.add(id);
      saveState(); render();
    };
    actions.append(saveButton);
    if (state.wrong.has(id)) {
      const remove = el('button', 'text-action', '移出错题');
      remove.type = 'button';
      remove.onclick = () => { state.wrong.delete(id); saveState(); render(); toast('已移出错题'); };
      actions.append(remove);
    }
    area.append(actions);
  }

  function render() {
    renderSidebar();
    renderHeader();
    renderSession();
    renderQuestion();
  }

  function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('sidebar-backdrop').classList.remove('open');
  }

  $('mobile-filter-button').onclick = () => { $('sidebar').classList.add('open'); $('sidebar-backdrop').classList.add('open'); };
  $('sidebar-close').onclick = closeSidebar;
  $('sidebar-backdrop').onclick = closeSidebar;
  $('mode-tabs').onclick = event => { if (event.target.dataset.mode) setMode(event.target.dataset.mode); };
  $('question-type').onchange = event => { state.questionType = event.target.value; startSession('sequential'); };
  $('session-size').onchange = event => { state.size = event.target.value; startSession(state.session?.order || 'sequential'); };
  $('start-sequential').onclick = () => startSession('sequential');
  $('start-random').onclick = () => startSession('random');
  $('prev-button').onclick = () => { state.session.index--; saveState(); render(); };
  $('next-button').onclick = () => { state.session.index++; saveState(); render(); };

  $('export-button').onclick = () => {
    const backup = exportState();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `知行题库进度-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('进度已导出');
  };
  $('import-button').onclick = () => $('import-file').click();
  $('import-file').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!isObject(imported) || imported.version !== 1 || !isObject(imported.records) || !Array.isArray(imported.wrong) || !Array.isArray(imported.saved)) throw Error('invalid');
      applyState(imported, { notify: true, source: 'import' });
      toast('进度已导入');
    } catch { toast('进度文件格式不正确'); }
    event.target.value = '';
  };

  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (/^[1-9]$/.test(event.key)) answer(letters[Number(event.key) - 1]);
    if (event.key === 'Enter' && document.activeElement === document.body) submitMultiple();
    if (event.key === 'ArrowRight' && !$('next-button').disabled) $('next-button').click();
    if (event.key === 'ArrowLeft' && !$('prev-button').disabled) $('prev-button').click();
  });

  if (!state.session?.ids.length) startSession('sequential'); else render();
  window.zhixingProgress = Object.freeze({
    exportState, applyState,
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('进度订阅需要函数');
      progressListeners.add(listener);
      return () => progressListeners.delete(listener);
    },
  });
  window.dispatchEvent(new Event('zhixing-progress-ready'));
})();
