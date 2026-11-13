(() => {
  'use strict';
  const FORMAT = 'zhixing-progress';
  const STORE = 'zhixing-github-progress-v2';
  const CONFIG = 'zhixing-github-config-v1';
  const TOKEN = 'zhixing-github-token-v1';
  const DEFAULTS = { owner: '211820252', repo: 'zhixing-question-bank', path: 'progress/personal.json', branch: 'progress' };
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const safe = key => !['__proto__', 'constructor', 'prototype'].includes(key);
  const entries = value => object(value) ? Object.entries(value).filter(([key]) => safe(key)) : [];
  const copy = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
  const stable = value => Array.isArray(value) ? value.map(stable) : object(value) ? Object.fromEntries(entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)])) : value;
  const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  const zero = { t: 0, n: 0, a: 'legacy' };
  const reg = (value, clock = zero) => ({ value: copy(value), clock: copy(clock) });
  const compare = (a, b) => (a.t - b.t) || (a.n - b.n) || a.a.localeCompare(b.a);
  function latest(a, b) {
    if (!a) return copy(b); if (!b) return copy(a);
    const order = compare(a.clock, b.clock);
    return copy(order > 0 ? a : order < 0 ? b : JSON.stringify(a.value) >= JSON.stringify(b.value) ? a : b);
  }
  function empty() {
    return { format: FORMAT, version: 2, base: {}, counts: {}, wrong: {}, saved: {}, settings: null, session: null, answers: {}, drafts: {}, positions: {} };
  }
  function validRecord(value) {
    return object(value) && Number.isSafeInteger(value.attempts) && value.attempts >= 0 && Number.isSafeInteger(value.correct) && value.correct >= 0 && value.correct <= value.attempts;
  }
  function recordMap(raw) {
    return Object.fromEntries(entries(raw).filter(([, value]) => validRecord(value)).map(([key, value]) => [key, { attempts: value.attempts, correct: value.correct }]));
  }
  function settings(state) {
    return Object.fromEntries(['subject', 'chapter', 'questionType', 'mode', 'size'].filter(key => typeof state[key] === 'string').map(key => [key, state[key]]));
  }
  function sessionKey(session) {
    // Deterministic only for migration, so two devices with the same old round can merge.
    const text = JSON.stringify([session.ids, session.order]);
    let a = 2166136261, b = 5381;
    for (const character of text) { a = Math.imul(a ^ character.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ character.charCodeAt(0); }
    return `legacy:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
  }
  function migrate(state) {
    if (!object(state) || !object(state.records) || !Array.isArray(state.wrong) || !Array.isArray(state.saved)) throw Error('进度文件格式不正确');
    const doc = empty(); doc.base = recordMap(state.records); doc.settings = reg(settings(state));
    for (const field of ['wrong', 'saved']) for (const id of state[field]) if (typeof id === 'string' && safe(id)) doc[field][id] = reg(true);
    if (object(state.session) && Array.isArray(state.session.ids)) {
      const key = sessionKey(state.session);
      doc.session = reg({ key, ids: copy(state.session.ids), order: state.session.order });
      doc.answers[key] = Object.fromEntries(entries(state.session.answers).map(([id, value]) => [id, reg(value)]));
      doc.drafts[key] = Object.fromEntries(entries(state.session.drafts).map(([id, value]) => [id, reg(value)]));
      doc.positions[key] = reg(state.session.index || 0);
    }
    return doc;
  }
  function normalize(raw) {
    if (raw?.format !== FORMAT) return migrate(raw);
    if (raw.version !== 2) throw Error('云端进度版本暂不支持，请更新页面');
    const doc = empty(); doc.base = recordMap(raw.base);
    const validReg = value => object(value) && object(value.clock) && Number.isSafeInteger(value.clock.t) && value.clock.t >= 0 && Number.isSafeInteger(value.clock.n) && value.clock.n >= 0 && typeof value.clock.a === 'string' && Object.hasOwn(value, 'value');
    for (const [actor, records] of entries(raw.counts)) doc.counts[actor] = recordMap(records);
    for (const field of ['wrong', 'saved', 'positions']) doc[field] = Object.fromEntries(entries(raw[field]).filter(([, value]) => validReg(value)).map(([id, value]) => [id, copy(value)]));
    for (const field of ['answers', 'drafts']) for (const [key, values] of entries(raw[field])) doc[field][key] = Object.fromEntries(entries(values).filter(([, value]) => validReg(value)).map(([id, value]) => [id, copy(value)]));
    for (const field of ['settings', 'session']) if (validReg(raw[field])) doc[field] = copy(raw[field]);
    return doc;
  }
  function merge(a, b) {
    a = normalize(a); b = normalize(b);
    const out = empty();
    function maxRecords(x, y) {
      const result = copy(x);
      for (const [id, record] of entries(y)) {
        const old = result[id] || { attempts: 0, correct: 0 };
        result[id] = { attempts: Math.max(old.attempts, record.attempts), correct: Math.max(old.correct, record.correct) };
      }
      return result;
    }
    out.base = maxRecords(a.base, b.base);
    for (const actor of new Set([...Object.keys(a.counts), ...Object.keys(b.counts)])) out.counts[actor] = maxRecords(a.counts[actor] || {}, b.counts[actor] || {});
    for (const field of ['wrong', 'saved', 'positions']) for (const id of new Set([...Object.keys(a[field]), ...Object.keys(b[field])])) out[field][id] = latest(a[field][id], b[field][id]);
    for (const field of ['settings', 'session']) out[field] = latest(a[field], b[field]);
    for (const field of ['answers', 'drafts']) for (const key of new Set([...Object.keys(a[field]), ...Object.keys(b[field])])) {
      out[field][key] = {};
      for (const id of new Set([...Object.keys(a[field][key] || {}), ...Object.keys(b[field][key] || {})])) out[field][key][id] = latest(a[field][key]?.[id], b[field][key]?.[id]);
    }
    return out;
  }
  function materialize(doc) {
    doc = normalize(doc);
    const state = { ...copy(doc.settings?.value || {}), records: copy(doc.base), wrong: [], saved: [], session: null };
    for (const [, records] of entries(doc.counts)) for (const [id, count] of entries(records)) {
      const old = state.records[id] || { attempts: 0, correct: 0 };
      state.records[id] = { attempts: old.attempts + count.attempts, correct: old.correct + count.correct };
    }
    for (const field of ['wrong', 'saved']) state[field] = entries(doc[field]).filter(([, value]) => value.value === true).map(([id]) => id).sort();
    const active = doc.session?.value;
    if (object(active) && Array.isArray(active.ids)) {
      const values = field => Object.fromEntries(entries(doc[field][active.key]).filter(([, value]) => value.value !== null).map(([id, value]) => [id, copy(value.value)]));
      state.session = { ids: copy(active.ids), order: active.order, answers: values('answers'), drafts: values('drafts'), index: doc.positions[active.key]?.value || 0 };
    }
    return state;
  }
  function maxClock(doc) {
    let clock = zero;
    const visit = value => {
      if (!object(value)) return;
      if (object(value.clock) && typeof value.clock.a === 'string' && compare(value.clock, clock) > 0) clock = value.clock;
      for (const [, child] of entries(value)) visit(child);
    };
    visit(doc); return clock;
  }
  function capture(rawDoc, before, after, actor, now = Date.now()) {
    const doc = normalize(rawDoc);
    const observed = maxClock(doc);
    const clock = { t: Math.max(now, observed.t), n: now > observed.t ? 0 : observed.n + 1, a: actor };
    const stamp = value => reg(value, clock);
    for (const [id, record] of entries(recordMap(after.records))) {
      const previous = recordMap(before.records)[id] || { attempts: 0, correct: 0 };
      const attempts = Math.max(0, record.attempts - previous.attempts);
      const correct = Math.min(attempts, Math.max(0, record.correct - previous.correct));
      if (attempts) {
        if (!doc.counts[actor]) doc.counts[actor] = {};
        const old = doc.counts[actor][id] || { attempts: 0, correct: 0 };
        doc.counts[actor][id] = { attempts: old.attempts + attempts, correct: old.correct + correct };
      }
    }
    for (const field of ['wrong', 'saved']) {
      const old = new Set(before[field] || []), next = new Set(after[field] || []);
      for (const id of new Set([...old, ...next])) if (typeof id === 'string' && safe(id) && old.has(id) !== next.has(id)) doc[field][id] = stamp(next.has(id));
    }
    if (!equal(settings(before), settings(after))) doc.settings = stamp(settings(after));
    const old = before.session, next = after.session;
    if (!next) { if (old) doc.session = stamp(null); return doc; }
    const replaced = !old || !equal([old.ids, old.order], [next.ids, next.order]) || Object.keys(old.answers || {}).some(id => !Object.hasOwn(next.answers || {}, id));
    if (replaced || !doc.session?.value) doc.session = stamp({ key: `${actor}:${clock.t}:${clock.n}`, ids: copy(next.ids), order: next.order });
    const key = doc.session.value.key;
    for (const field of ['answers', 'drafts']) {
      if (!doc[field][key]) doc[field][key] = {};
      for (const id of new Set([...Object.keys(replaced ? {} : old?.[field] || {}), ...Object.keys(next[field] || {})])) if (safe(id) && (replaced || !equal(old?.[field]?.[id], next[field]?.[id]))) doc[field][key][id] = stamp(next[field]?.[id] ?? null);
    }
    if (replaced || old?.index !== next.index) doc.positions[key] = stamp(next.index || 0);
    return doc;
  }
  const encode = value => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  };
  const decode = value => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), char => char.charCodeAt(0))));
  class GitHubClient {
    constructor(config, token, fetcher = (url, options) => globalThis.fetch(url, options)) { this.config = config; this.token = token; this.fetcher = fetcher; }
    async request(url, options = {}) {
      const response = await this.fetcher(url, { ...options, cache: 'no-store', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...options.headers } });
      if (!response.ok) {
        const message = response.status === 401 ? '令牌无效或已过期，请重新设置' : response.status === 403 ? 'GitHub拒绝访问：检查令牌Contents读写权限或请求限额' : response.status === 404 ? '仓库不可访问：检查仓库名、令牌选择的仓库及权限' : response.status === 409 ? '云端进度已变化，正在合并重试' : `GitHub请求失败（${response.status}），本机进度已保留`;
        const error = new Error(message); error.status = response.status; throw error;
      }
      return response.json();
    }
    url() { const c = this.config; return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${c.path.split('/').map(encodeURIComponent).join('/')}`; }
    async verifyRepository() {
      const c = this.config;
      await this.request(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`);
    }
    async read() {
      try {
        const readUrl = `${this.url()}${this.config.branch ? `?ref=${encodeURIComponent(this.config.branch)}` : ''}`;
        const file = await this.request(readUrl);
        if (typeof file.sha !== 'string') throw Error('云端进度文件格式不支持，请先备份并检查');
        const raw = file.encoding === 'base64' && typeof file.content === 'string' ? decode(file.content) : await this.request(readUrl, { headers: { Accept: 'application/vnd.github.raw+json' } });
        return { doc: normalize(raw), sha: file.sha };
      } catch (error) { if (error.status === 404) return { doc: null, sha: null }; throw error; }
    }
    async write(doc, sha) {
      return this.request(this.url(), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Sync practice progress', content: encode(doc), ...(sha ? { sha } : {}), ...(this.config.branch ? { branch: this.config.branch } : {}) }) });
    }
  }
  async function synchronize(client, getDoc, accept, attempts = 3) {
    await client.verifyRepository();
    for (let retry = 0; retry < attempts; retry++) {
      const remote = await client.read();
      const doc = remote.doc ? merge(getDoc(), remote.doc) : normalize(getDoc());
      accept(doc);
      try { await client.write(doc, remote.sha); return doc; }
      catch (error) { if (![409, 422].includes(error.status) || retry === attempts - 1) throw error; }
    }
  }
  globalThis.ZhixingGitHubSyncCore = { stable, empty, migrate, normalize, merge, materialize, capture, GitHubClient, synchronize, encode, decode };
  if (typeof document === 'undefined') return;
  function start() {
    const adapter = window.zhixingProgress;
    if (!adapter || document.getElementById('github-sync-button')) return;
    const config = { ...DEFAULTS };
    let token = '', doc, snapshot, applying = false, timer, running = false, pending = false;
    // A separate actor for each page instance avoids counter collisions between open tabs.
    const actor = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let storageError = false;
    try { token = localStorage.getItem(TOKEN) || sessionStorage.getItem(TOKEN) || ''; } catch { storageError = true; }
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      doc = saved ? normalize(saved.doc) : migrate(adapter.exportState());
      snapshot = saved?.snapshot || materialize(doc);
      doc = capture(doc, snapshot, adapter.exportState(), actor); snapshot = copy(adapter.exportState());
    } catch { doc = migrate(adapter.exportState()); snapshot = copy(adapter.exportState()); storageError = true; }
    const button = document.createElement('button'); button.type = 'button'; button.id = 'github-sync-button'; button.textContent = '同步到我的仓库';
    const actions = document.querySelector('.data-actions') || document.querySelector('.app-header') || document.body;
    const preferences = document.createElement('button'); preferences.type = 'button'; preferences.id = 'github-sync-settings'; preferences.textContent = '同步设置';
    actions.append(button, preferences);
    const dialog = document.createElement('dialog'); dialog.className = 'github-sync-dialog'; dialog.setAttribute('aria-labelledby', 'github-sync-title');
    dialog.innerHTML = `<form method="dialog" class="github-sync-form">
      <div class="github-sync-heading"><h2 id="github-sync-title">连接我的 GitHub</h2><button type="submit" aria-label="关闭同步设置">×</button></div>
      <p>仓库已经设置好。首次连接一次，之后点击“同步到我的仓库”即可；答题后也会自动保存。</p>
      <div class="github-setup" id="github-setup">
        <a id="github-token-link" class="github-setup-link" target="_blank" rel="noopener noreferrer">① 去 GitHub 创建专用令牌 ↗</a>
        <p class="github-sync-note">打开后选择 <b>Only select repositories</b> → <b>zhixing-question-bank</b>。读写权限已预填，点击 <b>Generate token</b>，复制生成的令牌。</p>
        <label>② 粘贴令牌（只需首次）<input id="github-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…"></label>
      </div>
      <label class="github-remember"><input id="github-remember" type="checkbox" checked>记住这台设备，以后直接同步</label>
      <p class="github-sync-note">仅保存在本机浏览器，不上传令牌。换设备需连接一次。原仓库公开，保存的答题进度也公开。</p>
      <div id="github-sync-status" class="github-sync-status" role="status" aria-live="polite"></div>
      <div class="github-sync-actions"><button type="button" id="github-disconnect">断开连接</button><button type="button" id="github-connect" class="primary-command">连接并同步</button></div>
    </form>`;
    document.body.append(dialog);
    dialog.addEventListener('keydown', event => event.stopPropagation());
    const field = id => dialog.querySelector(`#github-${id}`);
    function status(message, kind = '') { field('sync-status').textContent = message; field('sync-status').dataset.kind = kind; button.title = message; button.dataset.state = kind; button.disabled = kind === 'busy'; button.textContent = kind === 'busy' ? '正在同步…' : kind === 'ok' ? '已同步 · 再同步' : kind === 'error' ? '同步失败 · 重试' : '同步到我的仓库'; preferences.title = message; }
    function persist() {
      try { localStorage.setItem(STORE, JSON.stringify(stable({ doc, snapshot }))); }
      catch { storageError = true; status('同步元数据未能保存；请允许浏览器存储并导出进度备份', 'error'); }
    }
    function accept(merged) {
      doc = merged;
      applying = true;
      try { adapter.applyState(materialize(doc)); snapshot = copy(adapter.exportState()); persist(); }
      finally { applying = false; }
    }
    function schedule() {
      clearTimeout(timer);
      if (token) timer = setTimeout(() => void sync(), 1500);
    }
    async function sync() {
      if (!token) return;
      if (running) { pending = true; return; }
      if (navigator.onLine === false) { status('离线：进度已保存在本机，联网后自动同步', 'offline'); return; }
      running = true; pending = false; status('正在拉取并合并进度…', 'busy'); field('connect').disabled = true;
      const currentToken = token;
      const client = new GitHubClient(copy(config), currentToken);
      try {
        await synchronize(client, () => doc, merged => { if (token === currentToken) accept(merged); });
        if (token === currentToken) status(`已同步 · ${new Date().toLocaleTimeString('zh-CN')}（继续练习会自动保存）`, 'ok');
      } catch (error) { if (token === currentToken) status(error instanceof TypeError ? '网络连接失败，进度已保存在本机；联网后重试' : error.message, 'error'); }
      finally { running = false; field('connect').disabled = false; if (pending) schedule(); }
    }
    field('token-link').href = `https://github.com/settings/personal-access-tokens/new?name=${encodeURIComponent('知行题库进度同步')}&description=${encodeURIComponent('仅用于知行题库同步')}&target_name=${DEFAULTS.owner}&contents=write&expires_in=365`;
    function show() {
      field('token').value = token;
      field('connect').textContent = token ? '立即同步' : '连接并同步';
      field('disconnect').hidden = !token;
      field('setup').hidden = Boolean(token) && button.dataset.state !== 'error';
      try { field('remember').checked = token ? Boolean(localStorage.getItem(TOKEN)) : true; } catch { field('remember').checked = false; }
      dialog.showModal();
    }
    button.onclick = () => token ? void sync() : show(); preferences.onclick = show;
    field('connect').onclick = () => {
      const secret = field('token').value.trim();
      if (!secret.startsWith('github_pat_')) { status('请使用 fine-grained personal access token（以 github_pat_ 开头）', 'error'); return; }
      token = secret;
      try {
        localStorage.setItem(CONFIG, JSON.stringify(DEFAULTS)); localStorage.removeItem(TOKEN); sessionStorage.removeItem(TOKEN);
        (field('remember').checked ? localStorage : sessionStorage).setItem(TOKEN, token);
      } catch { status('浏览器未能记住连接设置，本次页面仍可同步', 'error'); }
      dialog.close(); void sync();
    };
    field('disconnect').onclick = () => {
      token = ''; field('token').value = ''; clearTimeout(timer);
      try { localStorage.removeItem(TOKEN); sessionStorage.removeItem(TOKEN); } catch { /* Storage may be disabled; token is cleared from memory. */ }
      field('setup').hidden = false; field('disconnect').hidden = true; field('connect').textContent = '连接并同步';
      status('已断开，本机与云端进度均保留');
    };
    adapter.subscribe(next => {
      if (applying) return;
      const current = next || adapter.exportState(); doc = capture(doc, snapshot, current, actor); snapshot = copy(current); persist();
      if (running) pending = true;
      if (token) { status('本机已保存，等待同步…', 'pending'); schedule(); }
    });
    window.addEventListener('online', () => void sync());
    window.addEventListener('focus', () => { if (token) void sync(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && token) void sync(); });
    window.addEventListener('storage', event => {
      if (event.key !== STORE || !event.newValue || applying) return;
      try { accept(merge(doc, normalize(JSON.parse(event.newValue).doc))); schedule(); }
      catch { status('其他标签页进度格式异常，当前进度已保留', 'error'); }
    });
    persist();
    status(storageError ? '浏览器存储受限，请导出进度备份后再同步' : token ? '已恢复此设备连接' : '尚未连接；进度仍保存在本机', storageError ? 'error' : '');
    if (token) void sync();
    window.zhixingGitHubSync = { sync, openSettings: show };
  }
  window.addEventListener('zhixing-progress-ready', start);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
