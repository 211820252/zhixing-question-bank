(() => {
  'use strict';
  const STORAGE_KEY = 'zhixing-encouragement-v1';
  const MIN_ANSWERS = 8;
  const COOLDOWN_MS = 90_000;
  const messages = {
    effort: [
      ['🐷🌷', '洁猪真棒！每一道认真想过的题，都算进步。'],
      ['🌱✨', '又完成一小段练习啦，给努力的洁猪一朵小红花！'],
      ['🐷💛', '洁猪慢慢来，认真坚持的样子就很棒。'],
      ['🍀🌻', '知识正在一点点攒起来，洁猪的努力算数！'],
    ],
    correct: [
      ['🐷🌟', '洁猪真棒，又攒下一批正确答案啦！'],
      ['🥳🌷', '这些题被洁猪拿下啦，奖励一个大大的赞！'],
      ['🐷💯', '洁猪的小脑袋又吸收了好多知识，棒棒的！'],
      ['🍓✨', '答对的每一道，都在给洁猪添一点底气。'],
    ],
    streak: [
      ['🐷🔥', '连对 {streak} 题！洁猪这波也太稳啦～'],
      ['🥳✨', '连续 {streak} 题都拿下，洁猪真厉害！'],
      ['🐷🚀', '{streak} 连对达成！给今天的洁猪鼓鼓掌！'],
      ['🌟💛', '洁猪的小宇宙上线啦，已经连对 {streak} 题！'],
    ],
  };

  function normalize(raw) {
    const value = raw && typeof raw === 'object' ? raw : {};
    const count = key => Number.isSafeInteger(value[key]) && value[key] >= 0 ? value[key] : 0;
    const attempts = count('attempts');
    const correct = Math.min(attempts, count('correct'));
    return {
      attempts, correct, streak: Math.min(correct, count('streak')),
      sinceShown: Math.min(attempts, count('sinceShown')),
      lastShownAt: count('lastShownAt'),
      lastMessage: typeof value.lastMessage === 'string' ? value.lastMessage : '',
    };
  }

  // Only committed local answers enter this function; restoration and sync do not.
  function advance(raw, correct, now = Date.now(), random = Math.random) {
    const state = normalize(raw);
    state.attempts++;
    state.sinceShown++;
    state.correct += correct ? 1 : 0;
    state.streak = correct ? state.streak + 1 : 0;
    if (state.lastShownAt > now) state.lastShownAt = now;
    let kind, probability;
    if (correct && state.streak % 4 === 0) { kind = 'streak'; probability = .55; }
    else if (correct && state.correct % 6 === 0) { kind = 'correct'; probability = .45; }
    else if (state.attempts % 8 === 0) { kind = 'effort'; probability = .35; }
    if (!kind || state.sinceShown < MIN_ANSWERS || (state.lastShownAt && now - state.lastShownAt < COOLDOWN_MS) || random() >= probability) {
      return { state, message: null };
    }
    const choices = messages[kind].map(([emoji, text], index) => ({ id: `${kind}:${index}`, emoji, text }))
      .filter(message => message.id !== state.lastMessage);
    const message = choices[Math.floor(random() * choices.length)];
    message.text = message.text.replaceAll('{streak}', String(state.streak));
    state.sinceShown = 0;
    state.lastShownAt = now;
    state.lastMessage = message.id;
    return { state, message };
  }

  globalThis.ZhixingEncouragementCore = { normalize, advance };
  if (typeof document === 'undefined') return;
  let state;
  try { state = normalize(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { state = normalize(null); }
  const card = document.createElement('aside');
  card.className = 'cheer-card';
  card.setAttribute('aria-label', '给洁猪的鼓励');
  card.setAttribute('aria-hidden', 'true');
  const emoji = document.createElement('span');
  emoji.className = 'cheer-emoji';
  emoji.setAttribute('aria-hidden', 'true');
  const content = document.createElement('div');
  content.className = 'cheer-content';
  content.setAttribute('role', 'status');
  content.setAttribute('aria-live', 'polite');
  content.setAttribute('aria-atomic', 'true');
  const caption = document.createElement('span');
  caption.className = 'cheer-caption';
  caption.textContent = '给认真刷题的洁猪';
  const text = document.createElement('p');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cheer-close';
  close.setAttribute('aria-label', '收起鼓励');
  close.textContent = '×';
  content.append(caption, text);
  card.append(emoji, content, close);
  document.body.append(card);
  let hideTimer;
  function hide() {
    clearTimeout(hideTimer);
    card.classList.remove('show');
    card.setAttribute('aria-hidden', 'true');
    close.tabIndex = -1;
  }
  hide();
  close.onclick = hide;
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  window.zhixingEncouragement = Object.freeze({
    record(correct) {
      // Read again so another tab's cooldown is respected too.
      try { state = normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)) || state); }
      catch { /* Keep the in-memory cooldown when browser storage is unavailable. */ }
      const result = advance(state, correct);
      state = result.state;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch { /* Encouragement must never interrupt answering or progress sync. */ }
      if (!result.message) return;
      emoji.textContent = result.message.emoji;
      text.textContent = result.message.text;
      card.setAttribute('aria-hidden', 'false');
      close.tabIndex = 0;
      card.classList.add('show');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 5200);
    },
  });
})();
