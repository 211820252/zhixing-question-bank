(() => {
  'use strict';

  const questions = window.QUESTION_BANK || [];
  const byId = new Map(questions.map(question => [question.id, question]));
  const storageKey = 'zhixing-practice-v1';
  const subjects = ['全部科目', ...new Set(questions.map(question => question.subject))];
  const letters = ['A', 'B', 'C', 'D'];
  const $ = id => document.getElementById(id);

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && typeof saved === 'object') return saved;
    } catch { /* Local files may have storage disabled in some browsers. */ }
    return {};
  }

  const persisted = loadState();
  const state = {
    subject: subjects.includes(persisted.subject) ? persisted.subject : '全部科目',
    chapter: persisted.chapter || '全部章节',
    mode: ['all', 'unanswered', 'wrong', 'saved'].includes(persisted.mode) ? persisted.mode : 'all',
    size: ['20', '50', 'all'].includes(persisted.size) ? persisted.size : '20',
    records: persisted.records && typeof persisted.records === 'object' ? persisted.records : {},
    wrong: new Set((persisted.wrong || []).filter(id => byId.has(id))),
    saved: new Set((persisted.saved || []).filter(id => byId.has(id))),
    session: persisted.session && Array.isArray(persisted.session.ids) ? persisted.session : null,
  };
  if (state.session) {
    state.session.ids = state.session.ids.filter(id => byId.has(id));
    state.session.answers ||= {};
    state.session.index = Math.min(Math.max(Number(state.session.index) || 0, 0), Math.max(0, state.session.ids.length - 1));
  }

  function saveState() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        subject: state.subject, chapter: state.chapter, mode: state.mode, size: state.size,
        records: state.records, wrong: [...state.wrong], saved: [...state.saved], session: state.session,
      }));
    } catch { toast('浏览器未能保存进度，请使用“导出进度”备份'); }
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
      if (state.mode === 'unanswered' && state.records[question.id]) return false;
      if (state.mode === 'wrong' && !state.wrong.has(question.id)) return false;
      if (state.mode === 'saved' && !state.saved.has(question.id)) return false;
      return true;
    });
  }

  function startSession(order) {
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
    state.session = { ids: items.slice(0, limit).map(item => item.id), answers: {}, index: 0, order };
    saveState();
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

  function answer(letter) {
    const session = state.session;
    const id = session?.ids[session.index];
    if (!id || session.answers[id]) return;
    const question = byId.get(id);
    const correct = letter === question.answer;
    session.answers[id] = letter;
    const record = state.records[id] || { attempts: 0, correct: 0 };
    record.attempts++;
    if (correct) record.correct++;
    state.records[id] = record;
    if (!correct) state.wrong.add(id);
    saveState();
    render();
  }

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
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
    for (const button of $('mode-tabs').querySelectorAll('button')) {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    }
  }

  function renderSession() {
    const session = state.session;
    const ids = session?.ids || [];
    const answered = ids.filter(id => session.answers[id]);
    const correct = answered.filter(id => session.answers[id] === byId.get(id).answer).length;
    const wrong = answered.length - correct;
    $('session-status').textContent = session?.order === 'random' ? '随机练习' : '顺序练习';
    $('session-progress-text').textContent = `${answered.length} / ${ids.length}`;
    $('progress-bar').style.width = `${ids.length ? answered.length / ids.length * 100 : 0}%`;
    $('round-count').textContent = `${ids.length} 题`;
    $('round-done').textContent = String(answered.length);
    $('round-correct').textContent = String(correct);
    $('round-wrong').textContent = String(wrong);
    $('question-position').textContent = ids.length ? `第 ${session.index + 1} / ${ids.length} 题` : '暂无题目';
    $('prev-button').disabled = !ids.length || session.index === 0;
    $('next-button').disabled = !ids.length || session.index >= ids.length - 1;

    const palette = $('question-palette');
    palette.replaceChildren();
    ids.forEach((id, index) => {
      const selected = session.answers[id];
      const result = selected ? (selected === byId.get(id).answer ? 'correct' : 'wrong') : '';
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
      empty.append(el('p', '', state.mode === 'unanswered' ? '这一范围的题目已经练完。' : '切换科目、章节或题目范围继续练习。'));
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
    const selected = session.answers[id];
    const meta = el('div', 'question-meta');
    meta.append(el('span', 'number', `题目 ${String(session.index + 1).padStart(2, '0')}`), el('span', '', `${question.subject} · ${question.chapter.replace(/\s+/g, ' ')} · 原题 ${question.number}`));
    area.append(meta, el('h2', 'question-title', question.stem));

    const options = el('div', 'option-list');
    question.options.forEach((option, index) => {
      const letter = letters[index];
      const result = selected ? (letter === question.answer ? ' correct' : letter === selected ? ' wrong' : ' muted') : '';
      const button = el('button', `option-button${result}`);
      button.type = 'button';
      button.disabled = Boolean(selected);
      button.append(el('span', 'option-letter', letter), el('span', '', option));
      button.onclick = () => answer(letter);
      options.append(button);
    });
    area.append(options);

    if (selected) {
      const correct = selected === question.answer;
      const feedback = el('div', `feedback${correct ? '' : ' incorrect'}`);
      feedback.append(el('div', 'feedback-heading', correct ? '回答正确' : '回答错误'));
      feedback.append(el('div', 'feedback-answer', `正确答案：${question.answer} · ${question.options[letters.indexOf(question.answer)]}`));
      if (question.explanation) feedback.append(el('div', 'feedback-explanation', question.explanation));
      area.append(feedback);
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
  $('session-size').onchange = event => { state.size = event.target.value; startSession(state.session?.order || 'sequential'); };
  $('start-sequential').onclick = () => startSession('sequential');
  $('start-random').onclick = () => startSession('random');
  $('prev-button').onclick = () => { state.session.index--; saveState(); render(); };
  $('next-button').onclick = () => { state.session.index++; saveState(); render(); };

  $('export-button').onclick = () => {
    const backup = {
      version: 1, subject: state.subject, chapter: state.chapter, mode: state.mode, size: state.size,
      records: state.records, wrong: [...state.wrong], saved: [...state.saved], session: state.session,
    };
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
      if (imported.version !== 1 || !imported.records || !Array.isArray(imported.wrong) || !Array.isArray(imported.saved)) throw Error('invalid');
      localStorage.setItem(storageKey, JSON.stringify(imported));
      location.reload();
    } catch { toast('进度文件格式不正确'); }
    event.target.value = '';
  };

  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (['1', '2', '3', '4'].includes(event.key)) answer(letters[Number(event.key) - 1]);
    if (event.key === 'ArrowRight' && !$('next-button').disabled) $('next-button').click();
    if (event.key === 'ArrowLeft' && !$('prev-button').disabled) $('prev-button').click();
  });

  if (!state.session?.ids.length) startSession('sequential'); else render();
})();
