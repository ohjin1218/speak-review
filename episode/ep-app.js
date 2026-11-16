/* 오픽 에피소드 — 화면 (목록, 읽기, 가져오기·승인, 운전 준비, 설정) */
(function () {
  'use strict';
  const E = window.EpCore, R = window.EP_RULES, T = window.EP_TOPICS;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const kindTag = e => (e.group && e.group !== KIND[e.kind] ? e.group + ' · ' : '') + (KIND[e.kind] || '');
  const KIND = { opic: '오픽', roleplay: '롤플레이', life: '일상 대화', set: '문장 모음' };

  let root, eps = [], idx = null, sentences = [], topics = T.TOPICS.slice();
  let view = 'list', cur = null, filter = '전체', showAllKo = false, openKo = new Set();
  let pending = null;   // 가져오기 검증 결과
  let impText = '';     // 붙여 넣은 글 (화면을 다시 그려도 남게)
  let set = { pause: 3, repeat: 2, full: true, rate: 1, voiceCmd: false, minutes: 15, list: 'review', group: '' };
  let inited = false;

  // ── 준비 ──
  async function init() {
    if (inited) return; inited = true;
    root = $('#ep');
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    set = Object.assign(set, await EpStore.get('settings', {}) || {});
    topics = await EpStore.get('topics', null) || T.TOPICS.slice();
    eps = await EpStore.all();
    await refreshSentences();
    if (!eps.length && !(await EpStore.get('seeded', false))) await loadSeed();
  }
  async function refreshSentences() {
    sentences = await Store.allSentences();
    idx = E.buildIndex(sentences);
  }
  async function loadSeed() {
    try {
      const res = await fetch('data/episodes_seed.json');
      const list = E.parseIncoming(await res.text());
      const out = list.map(inc => makeRecord(E.validate(inc, idx), null, '처음 가져옴 (기존 에피소드 문서)'));
      out.forEach(e => { e.created = '2026-11-15'; });
      await EpStore.put(out); eps = out;
      await EpStore.set('seeded', true);
    } catch (e) { /* 오프라인 등: 다음에 다시 시도 */ }
  }
  const groupOf = topic => (topics.find(t => t.name === topic) || {}).group || '기타';
  function makeRecord(v, old, note) {
    const e = v.ep;
    const rec = old ? Object.assign({}, old) : { id: e.id || ('ep' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      created: today(), history: [], right: 0, wrong: 0, review: false };
    if (old) {
      rec.history = (old.history || []).concat([{ date: today(), note: note || e.note || '보강',
        before: { question: old.question, situation: old.situation, lines: old.lines } }]).slice(-5);
    } else rec.history = [{ date: today(), note: note || e.note || '새로 만듦' }];
    Object.assign(rec, { topic: e.topic, group: e.group || groupOf(e.topic), kind: e.kind, question: e.question,
      situation: e.situation || '', lines: e.lines, updated: today(), issues: v.errors.map(x => x.msg), stats: v.stats });
    return rec;
  }
  const saveSet = () => EpStore.set('settings', set);

  // ── 그리기 ──
  function render() {
    if (!root) return;
    const nav = ['list:목록', 'import:가져오기', 'drive:운전', 'settings:설정'].map(s => {
      const [k, l] = s.split(':');
      const on = view === k || (k === 'list' && view === 'read');
      return `<button data-nav="${k}" aria-pressed="${on}">${l}</button>`;
    }).join('');
    let body = '';
    if (view === 'list') body = renderList();
    else if (view === 'read') body = renderRead();
    else if (view === 'import') body = renderImport();
    else if (view === 'drive') body = renderDrive();
    else if (view === 'settings') body = renderSettings();
    root.innerHTML = `<div class="chips epnav">${nav}</div>${body}`;
  }

  function ratioBar(st) {
    if (!st || !st.me) return '';
    const p = n => (n / st.me * 100).toFixed(1) + '%';
    return `<div class="rbar"><i class="o" style="width:${p(st.orig)}"></i><i class="s" style="width:${p(st.swap)}"></i><i class="c" style="width:${p(st.conn)}"></i></div>`;
  }
  function statLine(st, kind) {
    if (!st) return '';
    const over = st.ratio > R.maxConnectRatio && kind !== 'set';
    return `원문 ${st.orig} · 교체 ${st.swap} · <span class="${over ? 'warn' : ''}">연결 ${Math.round(st.ratio * 100)}%</span>${kind === 'set' || kind === 'life' ? '' : ` · ${st.words}단어`}`;
  }

  function renderList() {
    const used = new Set();
    eps.forEach(e => e.lines.forEach(l => { if (l.type === '원문' || l.type === '교체') used.add(l.src); }));
    const groups = T.GROUPS.filter(g => eps.some(e => (e.group || '기타') === g));
    const chips = ['전체', '다시 볼 것', '보강 대상'].concat(groups);
    const count = f => eps.filter(e => match(e, f)).length;
    let list = eps.filter(e => match(e, filter));
    const order = g => { const i = T.GROUPS.indexOf(g); return i < 0 ? 99 : i; };
    list.sort((a, b) => order(a.group) - order(b.group));
    return `<div class="chips">${chips.map(c => `<button data-filter="${esc(c)}" aria-pressed="${c === filter}">${esc(c)}<span class="n">${count(c)}</span></button>`).join('')}</div>
      <div class="eplist">
      ${list.map(e => `<button class="epitem" data-open="${esc(e.id)}">
        <div class="eph"><b>${esc(e.topic)}</b><span class="tag">${esc(kindTag(e))}</span>${e.review ? '<span class="star">★</span>' : ''}</div>
        <div class="epq">${esc(e.question ? e.question.en : e.situation || '')}</div>
        ${ratioBar(e.stats)}
        <div class="eps">${statLine(e.stats, e.kind)}</div>
      </button>`).join('') || '<div class="empty-s">에피소드가 없어요. 가져오기에서 넣어 주세요.</div>'}
      </div>
      <div class="epfoot">저장 문장 ${sentences.length}개 중 ${used.size}개가 에피소드에 들어 있어요</div>`;
  }
  function match(e, f) {
    if (f === '전체') return true;
    if (f === '다시 볼 것') return e.review;
    if (f === '보강 대상') return e.kind !== 'set' && e.stats && e.stats.ratio > R.maxConnectRatio;
    return (e.group || '기타') === f;
  }

  function lineHtml(l, i, opts) {
    opts = opts || {};
    let enHtml;
    if (l.type === '교체') {
      const mk = E.swapMarks(l, idx);
      enHtml = mk ? mk.map(t => t.sp ? t.t : t.ch ? `<mark>${esc(t.t)}</mark>` : esc(t.t)).join('') : esc(l.en);
    } else enHtml = esc(l.en);
    const cls = l.speaker === 'other' ? 'other' : l.type === '원문' ? 'orig' : l.type === '교체' ? 'swap' : 'conn';
    const ko = opts.allKo || openKo.has(i);
    const srcTip = l.type === '교체' && l.srcEn ? `<div class="srcen">저장 문장: ${esc(l.srcEn)}</div>` : '';
    return `<div class="ln ${cls}" ${opts.static ? '' : `data-line="${i}"`}>
      ${l.tag ? `<span class="ltag">${esc(l.tag)}</span>` : ''}${l.speaker === 'other' ? '<span class="ltag">상대</span>' : ''}
      <span class="len">${enHtml}</span>
      ${ko ? `<div class="lko">${esc(l.ko || '해석 없음')}</div>${srcTip}` : ''}
    </div>`;
  }

  function renderRead() {
    const e = eps.find(x => x.id === cur);
    if (!e) { view = 'list'; return renderList(); }
    const q = e.question;
    return `<div class="rhead"><button class="btn ghost" data-nav="list">‹ 목록</button>
        <button class="btn ${e.review ? 'on' : ''}" data-act="review">${e.review ? '★ 다시 볼 것' : '☆ 다시 볼 것'}</button></div>
      <div class="card epcard">
        <div class="eph"><b>${esc(e.topic)}</b><span class="tag">${esc(kindTag(e))}</span></div>
        ${q && q.en ? `<div class="qbox" data-act="qko"><div class="qen">${esc(q.en)} <button class="spk" data-say="q" aria-label="질문 듣기">🔊</button></div>
          ${showAllKo || openKo.has('q') ? `<div class="lko">${esc(q.ko || '')}</div>` : ''}</div>` : ''}
        ${e.situation ? `<div class="qbox"><div class="sit">${esc(e.situation)}</div></div>` : ''}
        <div class="legend"><span class="orig">원문</span><span class="swap"><mark>교체</mark></span><span class="conn">연결</span><span class="hint2">문장을 누르면 해석</span></div>
        <div class="lines">${e.lines.map((l, i) => lineHtml(l, i, { allKo: showAllKo })).join('')}</div>
        ${ratioBar(e.stats)}
        <div class="eps">${statLine(e.stats, e.kind)}${e.issues && e.issues.length && e.kind !== 'set' ? `<div class="warn small">보강 대상: ${esc(e.issues.join(' · '))}</div>` : ''}</div>
        <div class="actions">
          <button class="btn" data-act="allko">${showAllKo ? '해석 숨기기' : '해석 모두 보기'}</button>
          <button class="btn" data-act="sayall">🔊 전체 듣기</button>
          <button class="btn primary" data-act="drive1">운전 모드로 듣기</button>
        </div>
        <div class="epmeta">만든 날 ${esc(e.created || '')}${e.updated && e.updated !== e.created ? ` · 고친 날 ${esc(e.updated)}` : ''} · 고친 기록 ${(e.history || []).length}개
          ${e.right || e.wrong ? ` · 맞힘 ${e.right} · 틀림 ${e.wrong}` : ''}
          <button class="link" data-act="del">${delAsk ? '정말 지우기' : '지우기'}</button></div>
      </div>`;
  }
  let delAsk = false;

  // ── 가져오기 ──
  function renderImport() {
    let res = '';
    if (pending) {
      const fix = E.fixRequest(pending.items.map(p => p.v));
      res = `<div class="msec"><h3>받은 에피소드 ${pending.items.length}개</h3>
        ${fix ? `<div class="actions" style="margin-bottom:10px"><button class="btn" data-act="copyfix">고쳐 달라는 글 복사</button><span class="small muted">채팅에 붙여 넣으세요</span></div>` : ''}
        ${pending.items.map((p, k) => proposalHtml(p, k)).join('')}
        <div class="actions"><button class="btn ghost" data-act="clearimp">다 지우기</button></div></div>`;
    }
    return `<div class="msec"><h3>채팅에서 받은 episodes.json</h3>
        <textarea id="impText" rows="5" placeholder="JSON을 붙여 넣으세요">${esc(impText)}</textarea>
        <div class="actions" style="margin-top:8px">
          <button class="btn primary" data-act="check">검증하기</button>
          <label class="btn file">파일 고르기<input type="file" id="impFile" accept=".json,application/json,text/plain" hidden></label>
        </div>
        <div id="impMsg" class="msg"></div></div>
      ${res}
      <div class="msec"><h3>채팅과 맞추기·백업</h3>
        <div class="actions">
          <button class="btn" data-act="copyall">지금 에피소드 전체 복사</button>
          <button class="btn" data-act="exportfile">파일로 내보내기</button>
          <label class="btn file">백업 불러오기<input type="file" id="bakFile" accept=".json" hidden></label>
        </div>
        <div class="small muted" style="margin-top:6px">전체 복사는 채팅에 지금 상태를 알려줄 때 써요. 백업 불러오기는 이 기기의 에피소드를 파일 내용으로 모두 바꿔요.</div>
        <div id="bakMsg" class="msg"></div></div>`;
  }
  function proposalHtml(p, k) {
    const v = p.v, e = v.ep;
    const state = p.done ? `<span class="okc">${p.done}</span>` : '';
    const errs = v.errors.map(x => `<li class="bad">${x.line ? x.line + '번째: ' : ''}${esc(x.msg)}</li>`).join('');
    const warns = v.warnings.map(x => `<li>${x.line ? x.line + '번째: ' : ''}${esc(x.msg)}</li>`).join('');
    const before = p.old ? `<div class="col"><div class="colh">이전 · ${statLine(p.old.stats, p.old.kind)}</div>
        <div class="lines">${p.old.lines.map((l, i) => lineHtml(l, i, { static: true })).join('')}</div></div>` : '';
    return `<div class="prop ${v.ok ? '' : 'has-err'}">
      <div class="eph"><b>${esc(e.topic || '주제 없음')}</b><span class="tag">${p.old ? '보강' : '새 에피소드'} · ${KIND[e.kind] || ''}</span>${state}</div>
      ${e.question && e.question.en ? `<div class="epq">${esc(e.question.en)}</div>` : ''}
      ${errs || warns ? `<ul class="issues">${errs}${warns}</ul>` : '<div class="okc small">검증 통과</div>'}
      <div class="cmp2">${before}
        <div class="col"><div class="colh">${p.old ? '변경안' : '내용'} · ${statLine(v.stats, e.kind)}</div>
          <div class="lines">${e.lines.map((l, i) => lineHtml(l, i, { static: true })).join('')}</div></div></div>
      ${p.done ? '' : `<div class="actions">
        <button class="btn primary" data-approve="${k}" ${v.ok ? '' : 'disabled'}>승인하고 저장</button>
        <button class="btn" data-skip="${k}">건너뛰기</button>
        ${v.ok ? '' : `<button class="link" data-force="${k}">규칙 밖이어도 저장</button>`}</div>`}
    </div>`;
  }
  async function checkImport(text) {
    impText = text;
    const msg = $('#impMsg');
    try {
      await refreshSentences();
      const list = E.parseIncoming(text);
      pending = { items: list.map(inc => {
        const old = E.matchExisting(inc, eps);
        if (old && !inc.id) inc.id = old.id;
        if (!inc.group) inc.group = groupOf(inc.topic);
        return { v: E.validate(inc, idx), old };
      }) };
      render();
    } catch (err) { if (msg) { msg.className = 'msg bad'; msg.textContent = '읽지 못했어요: ' + err.message; } }
  }
  async function approve(k) {
    const p = pending.items[k];
    const rec = makeRecord(p.v, p.old);
    await EpStore.put(rec);
    const i = eps.findIndex(e => e.id === rec.id);
    if (i >= 0) eps[i] = rec; else eps.push(rec);
    p.done = '저장했어요';
    render();
  }

  // ── 운전 준비 ──
  function recentEps() {
    const recent = new Set(sentences.slice().sort((a, b) => (b.order || 0) - (a.order || 0)).slice(0, 30).map(s => E.sid(s.en)));
    return eps.filter(e => e.lines.some(l => recent.has(l.src)));
  }
  function playlistEps() {
    let list;
    if (set.list === 'review') list = eps.filter(e => e.review);
    else if (set.list === 'group') list = eps.filter(e => !set.group || (e.group || '기타') === set.group);
    else if (set.list === 'recent') list = recentEps();
    else list = eps.slice();
    list = list.filter(e => e.kind !== 'set' || set.list === 'group');
    list = shuffle(list);
    return E.fitPlaylist(list, set.minutes, set);
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  let preview = null;
  function renderDrive() {
    if (!preview) preview = playlistEps();
    const secs = preview.reduce((s, e) => s + E.estimateSec(E.driveSteps(e, set), set.rate), 0);
    const groups = T.GROUPS.filter(g => eps.some(e => (e.group || '기타') === g));
    const opt = (k, l) => `<button data-list="${k}" aria-pressed="${set.list === k}">${l}</button>`;
    return `<div class="msec"><h3>무엇을 들을까요</h3>
        <div class="chips wrapc">${opt('review', '다시 볼 것')}${opt('group', '주제별')}${opt('recent', '최근 추가 문장')}${opt('all', '전체 랜덤')}</div>
        ${set.list === 'group' ? `<select id="drvGroup" class="sel"><option value="">모든 주제</option>${groups.map(g => `<option ${set.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>` : ''}
        <h3 style="margin-top:14px">운전 시간</h3>
        <div class="chips wrapc">${[15, 30, 0].map(m => `<button data-min="${m}" aria-pressed="${set.minutes === m}">${m ? m + '분' : '전부'}</button>`).join('')}</div></div>
      <div class="msec"><div class="drvsum">에피소드 ${preview.length}개 · 약 ${Math.round(secs / 60)}분</div>
        <div class="small muted">${preview.map(e => esc(e.topic)).join(' · ') || (set.list === 'review' ? '다시 볼 것으로 표시한 에피소드가 없어요' : '고른 에피소드가 없어요')}</div>
        <div class="actions" style="margin-top:12px"><button class="btn primary big" data-act="drivego" ${preview.length ? '' : 'disabled'}>▶ 시작</button>
          <button class="btn" data-act="reshuffle">다시 섞기</button></div>
        <div class="small muted" style="margin-top:10px">핸들·블루투스 버튼: 다음 곡 = 다음 문장, 이전 곡 = 다시 듣기, 재생 = 멈춤/계속</div></div>`;
  }

  // ── 설정 ──
  function renderSettings() {
    const byG = T.GROUPS.map(g => ({ g, list: topics.filter(t => t.group === g) })).filter(x => x.list.length || true);
    const num = (id, v, min, max, step, label, unit) => `<label class="srow"><span>${label}</span>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><b>${v}${unit}</b></label>`;
    return `<div class="msec"><h3>운전 모드</h3>
        ${num('sPause', set.pause, 1, 6, 0.5, '말해 보는 시간', '초')}
        ${num('sRepeat', set.repeat, 1, 3, 1, '영어 읽는 횟수', '번')}
        ${num('sRate', set.rate, 0.6, 1.3, 0.05, '읽는 속도', '배')}
        <label class="srow"><span>마지막에 전체 답변 이어 읽기</span><input type="checkbox" id="sFull" ${set.full ? 'checked' : ''}></label>
        <label class="srow"><span>음성 명령 (다음, 다시, 천천히, 멈춰)</span><input type="checkbox" id="sVoice" ${set.voiceCmd ? 'checked' : ''}></label></div>
      <div class="msec"><h3>주제 목록</h3>
        ${byG.map(x => `<div class="tgrp"><div class="tgh">${esc(x.g)}</div><div class="tlist">${x.list.map(t =>
          `<span class="tchip">${esc(t.name)}<button data-deltopic="${esc(t.name)}" aria-label="${esc(t.name)} 지우기">×</button></span>`).join('')}</div></div>`).join('')}
        <div class="row" style="margin-top:10px"><input type="text" id="newTopic" placeholder="새 주제">
          <select id="newTopicG" class="sel">${T.GROUPS.map(g => `<option>${esc(g)}</option>`).join('')}</select>
          <button class="btn" data-act="addtopic">추가</button></div>
        <button class="link" data-act="resettopics">기본 주제로 되돌리기</button></div>
      <div class="msec small muted">에피소드는 채팅에서 만들어 가져오기로 넣어요. 형식은 episodes-format.md 를 보세요.</div>`;
  }

  // ── 동작 ──
  async function onClick(ev) {
    const b = ev.target.closest('button, [data-line], [data-act="qko"]');
    if (!b || !root.contains(b)) return;
    const d = b.dataset;
    if (d.nav) { view = d.nav; delAsk = false; if (d.nav === 'drive') preview = null; render(); window.scrollTo(0, 0); return; }
    if (d.filter) { filter = d.filter; render(); return; }
    if (d.open) { cur = d.open; view = 'read'; openKo.clear(); showAllKo = false; delAsk = false; render(); window.scrollTo(0, 0); return; }
    if (d.line != null && !ev.target.closest('button')) { const i = +d.line; openKo.has(i) ? openKo.delete(i) : openKo.add(i); render(); return; }
    if (d.say === 'q') { ev.stopPropagation(); const e = eps.find(x => x.id === cur); Speech.say([{ lang: 'en', text: e.question.en }], set.rate); return; }
    if (d.list) { set.list = d.list; saveSet(); preview = null; render(); return; }
    if (d.min != null) { set.minutes = +d.min; saveSet(); preview = null; render(); return; }
    if (d.approve != null) return approve(+d.approve);
    if (d.force != null) return approve(+d.force);
    if (d.skip != null) { pending.items[+d.skip].done = '건너뜀'; render(); return; }
    if (d.deltopic) { topics = topics.filter(t => t.name !== d.deltopic); await EpStore.set('topics', topics); render(); return; }
    const e = eps.find(x => x.id === cur);
    switch (d.act) {
      case 'qko': if (openKo.has('q')) openKo.delete('q'); else openKo.add('q'); render(); break;
      case 'review': e.review = !e.review; await EpStore.put(e); render(); break;
      case 'allko': showAllKo = !showAllKo; render(); break;
      case 'sayall': Speech.say(e.lines.map(l => ({ lang: 'en', text: l.en })), set.rate); break;
      case 'drive1': Drive.start([e], set); break;
      case 'del':
        if (!delAsk) { delAsk = true; render(); break; }
        await EpStore.remove(e.id); eps = eps.filter(x => x.id !== e.id); view = 'list'; delAsk = false; render(); break;
      case 'check': checkImport($('#impText').value); break;
      case 'clearimp': pending = null; impText = ''; render(); break;
      case 'copyfix': copy(E.fixRequest(pending.items.map(p => p.v)), b); break;
      case 'copyall': copy(JSON.stringify(E.toExchange(eps, idx), null, 1), b); break;
      case 'exportfile': exportFile(); break;
      case 'drivego': Drive.start(preview, set); break;
      case 'reshuffle': preview = null; render(); break;
      case 'addtopic': {
        const name = $('#newTopic').value.trim(), g = $('#newTopicG').value;
        if (!name || topics.some(t => t.name === name)) return;
        topics.push({ name, group: g, kind: g === '일상생활' ? 'life' : g === '롤플레이' ? 'roleplay' : 'opic' });
        await EpStore.set('topics', topics); render(); break;
      }
      case 'resettopics': topics = T.TOPICS.slice(); await EpStore.set('topics', topics); render(); break;
    }
  }
  async function onChange(ev) {
    const t = ev.target;
    if (t.id === 'impFile') { const f = t.files[0]; if (f) { const txt = await f.text(); $('#impText').value = txt; checkImport(txt); } return; }
    if (t.id === 'bakFile') return restore(t.files[0]);
    if (t.id === 'drvGroup') { set.group = t.value; saveSet(); preview = null; render(); return; }
    const map = { sPause: 'pause', sRepeat: 'repeat', sRate: 'rate' };
    if (map[t.id]) { set[map[t.id]] = +t.value; saveSet(); render(); return; }
    if (t.id === 'sFull') { set.full = t.checked; saveSet(); return; }
    if (t.id === 'sVoice') { set.voiceCmd = t.checked; saveSet(); return; }
  }
  function copy(text, btn) {
    const done = () => { const o = btn.textContent; btn.textContent = '복사했어요'; setTimeout(() => { btn.textContent = o; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* 무시 */ } ta.remove();
  }
  function exportFile() {
    const data = Object.assign({ app: 'speak-episodes', full: eps }, E.toExchange(eps, idx));
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `오픽에피소드-${today().replace(/-/g, '')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function restore(f) {
    const m = $('#bakMsg');
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.full)) throw new Error('이 앱의 백업 파일이 아니에요 (채팅에서 받은 파일은 위의 검증하기로 넣어 주세요)');
      await EpStore.replaceAll(data.full); eps = data.full;
      m.className = 'msg ok'; m.textContent = `에피소드 ${eps.length}개를 불러왔어요`;
    } catch (err) { m.className = 'msg bad'; m.textContent = '불러오지 못했어요: ' + err.message; }
  }

  window.EpApp = {
    async show() { await init(); await refreshSentences(); root.hidden = false; render(); },
    hide() { if (root) root.hidden = true; },
  };
})();
