/* 스픽 복습 — 화면 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = 86400000;

  const SUBS = {
    '업무 회화': ['일정', '회의', '요청·공유', '진행보고', '의견·결정', '도움·분담', '발표', '현장', '자기소개', '일상·인사'],
    '구동사': ['take', 'get', 'make', '기타'],
  };
  const TABS = [
    { key: 'today', label: '오늘' },
    { key: '업무 회화', label: '업무 회화' },
    { key: '구동사', label: '구동사' },
    { key: 'review', label: '다시 볼 것' },
  ];

  // ── 상태 ──
  const recs = new Map();
  let settings = { mode: 'speak', tab: 'today', sub: {}, filter: 'all', shuffle: true, len: 20 };
  let queues = {}, rounds = {}, lastBackup = 0;
  let card = null;          // 지금 문장의 임시 상태
  let footConfirm = false;

  const all = () => [...recs.values()];
  const saveRec = r => { recs.set(r.id, r); return Store.putSentences([r]); };
  const saveSettings = () => Store.setMeta('settings', settings);
  const saveQueues = () => Store.setMeta('queues', queues);
  const saveRounds = () => Store.setMeta('rounds', rounds);

  // ── 지금 탭의 문장 범위 ──
  function subsOf(deck) {
    const have = new Set(all().filter(r => r.deck === deck).map(r => r.sub));
    const list = (SUBS[deck] || []).filter(s => have.has(s));
    have.forEach(s => { if (!list.includes(s)) list.push(s); });
    return list;
  }
  function poolFor(tab, sub, filter) {
    const list = all();
    if (tab === 'today') return list;
    if (tab === 'review') { const f = Logic.FILTERS.find(x => x.key === filter) || Logic.FILTERS[0]; return list.filter(f.test); }
    return list.filter(r => r.deck === tab && (!sub || sub === '전체' || r.sub === sub));
  }
  const curSub = () => settings.sub[settings.tab] || '전체';
  function roundKey() {
    const t = settings.tab;
    if (t === 'today') return 'today';
    if (t === 'review') return 'review|' + settings.filter;
    return t + '|' + curSub();
  }

  // ── 한 바퀴 ──
  function newRound() {
    const key = roundKey();
    const prev = rounds[key];
    let r;
    if (key === 'today') {
      const ids = Logic.buildToday(all(), settings.len || 20);
      r = { ids, pos: 0, res: {}, base: 0, total: 0 };
    } else {
      const pool = poolFor(settings.tab, curSub(), settings.filter);
      const b = Logic.buildRound(pool, queues[key], settings.len, settings.shuffle, null, prev ? prev.ids : []);
      queues[key] = b.queue; saveQueues();
      r = { ids: b.ids, pos: 0, res: {}, base: b.base, total: b.total };
    }
    rounds[key] = r; saveRounds();
    card = null;
    return r;
  }
  function curRound() {
    const key = roundKey();
    let r = rounds[key];
    if (!r || !r.ids.length) r = newRound();
    // 지워진 문장은 건너뛴다
    while (r.pos < r.ids.length && !recs.has(r.ids[r.pos])) r.pos++;
    return r;
  }
  function advance() {
    const r = curRound();
    r.pos++; card = null; saveRounds(); render();
  }

  // ── 소리 ──
  let voice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices();
    voice = vs.find(v => v.lang === 'en-US' && /google|natural|samantha|aria|jenny/i.test(v.name)) || vs.find(v => v.lang === 'en-US') || vs.find(v => /^en/.test(v.lang)) || null;
  }
  function speak(text, slow) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; if (voice) u.voice = voice;
    u.rate = slow ? 0.7 : 1;
    speechSynthesis.speak(u);
  }
  // 🔊 버튼: 누르면 보통 속도, 길게 누르면 천천히
  function wireSpeaker(btn, text) {
    let timer = null, longDone = false;
    btn.addEventListener('pointerdown', () => { longDone = false; timer = setTimeout(() => { longDone = true; speak(text, true); }, 450); });
    const clear = () => clearTimeout(timer);
    btn.addEventListener('pointerup', clear); btn.addEventListener('pointerleave', clear);
    btn.addEventListener('contextmenu', e => e.preventDefault());
    btn.addEventListener('click', e => { e.stopPropagation(); if (!longDone) speak(text, false); longDone = false; });
  }

  // ── 그리기 ──
  function render() {
    // 모드
    document.querySelectorAll('#modeSeg button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === settings.mode)));
    // 탭
    const counts = { today: null, review: all().filter(r => r.review).length };
    Logic.DECKS.forEach(d => { counts[d] = all().filter(r => r.deck === d).length; });
    $('#tabs').innerHTML = TABS.map(t => `<button role="tab" data-tab="${esc(t.key)}" aria-selected="${t.key === settings.tab}">${esc(t.label)}${counts[t.key] != null ? `<span class="n">${counts[t.key]}</span>` : ''}</button>`).join('');
    // 세부 분류 / 필터
    let chips = '';
    if (settings.tab === 'review') {
      chips = Logic.FILTERS.map(f => `<button data-filter="${f.key}" aria-pressed="${f.key === settings.filter}">${f.label}<span class="n">${all().filter(f.test).length}</span></button>`).join('');
    } else if (settings.tab !== 'today') {
      const deck = settings.tab, cur = curSub();
      const list = ['전체'].concat(subsOf(deck));
      chips = list.map(s => `<button data-sub="${esc(s)}" aria-pressed="${s === cur}">${esc(s)}<span class="n">${s === '전체' ? counts[deck] : all().filter(r => r.deck === deck && r.sub === s).length}</span></button>`).join('');
    }
    $('#chips').innerHTML = chips;
    // 옵션
    $('#shuffle').checked = settings.shuffle;
    $('#shuffle').parentElement.hidden = settings.tab === 'today';
    $('#roundLen').value = String(settings.len);

    const r = curRound();
    const n = r.ids.length;
    const pos = Math.min(r.pos, n);
    $('#barFill').style.width = n ? (pos / n * 100) + '%' : '0';
    let pt = n ? `${Math.min(pos + 1, n)} / ${n}` : '';
    if (n && r.total && settings.tab !== 'today' && settings.len && settings.len < r.total) pt += ` · 전체 ${Math.min(r.base + pos + (pos < n ? 1 : 0), r.total)} / ${r.total}`;
    $('#progText').textContent = pt;

    if (!n) renderEmpty();
    else if (pos >= n) renderDone(r);
    else if (settings.mode === 'speak') renderSpeak(recs.get(r.ids[pos]));
    else renderType(recs.get(r.ids[pos]));
    renderFoot();
  }

  const statLine = rec => (rec.right || rec.wrong) ? `맞힘 ${rec.right} · 틀림 ${rec.wrong}` : '';

  function renderEmpty() {
    const msg = settings.tab === 'review' ? '다시 볼 문장이 없어요' : '문장이 없어요';
    $('#card').className = 'card empty';
    $('#card').innerHTML = `<div>${msg}</div>`;
  }

  function renderDone(r) {
    const done = Object.keys(r.res).length;
    const right = Object.values(r.res).filter(Boolean).length;
    const nextN = settings.tab === 'today' ? (settings.len || 20) : settings.len;
    $('#card').className = 'card done';
    $('#card').innerHTML = `
      <div class="stat">한 바퀴 끝</div>
      <div class="score">${right}<small> / ${done} 맞힘</small></div>
      <button class="btn primary big" id="nextRound" style="flex:0 0 auto;min-width:200px">${nextN ? `다음 ${nextN}개` : '다시 시작'} <kbd>Enter</kbd></button>`;
    $('#nextRound').onclick = () => { newRound(); render(); };
    $('#nextRound').focus();
  }

  // 지금 문장을 다시 볼 것에서 빼기/넣기 (채점 결과보다 나중에 적용)
  function reviewToggleHtml(rec) {
    return `<button class="link" id="rvToggle">${rec.review ? '다시 볼 것에서 빼기' : '다시 볼 것에 넣기'}</button>`;
  }
  function wireReviewToggle() {
    const b = $('#rvToggle'); if (!b) return;
    b.onclick = e => {
      e.stopPropagation();
      const rec = recs.get(card.id);
      card.override = !rec.review;
      const next = Logic.setReview(rec, card.override);
      saveRec(next); render();
    };
  }

  // ── 말하기 모드 ──
  function renderSpeak(rec) {
    if (!card || card.id !== rec.id || card.mode !== 'speak') card = { id: rec.id, mode: 'speak', shown: false, pre: rec };
    const el = $('#card');
    el.className = 'card';
    if (!card.shown) {
      el.innerHTML = `
        <div class="tap" id="tap">
          <div class="stat">${statLine(rec)}</div>
          <div class="ko">${esc(rec.ko)}</div>
        </div>
        <div class="actions"><button class="btn primary big" id="show">영어 보기</button></div>`;
      $('#tap').onclick = reveal; $('#show').onclick = reveal;
      $('#show').focus();
      return;
    }
    el.innerHTML = `
      <div class="stat">${statLine(rec)}</div>
      <div class="ko">${esc(rec.ko)}</div>
      <div class="actions"><div class="en grow">${esc(rec.en)}</div><button class="btn" id="spk" aria-label="듣기">🔊</button></div>
      <div class="actions">
        <button class="btn big" id="stuck">막혔어요 <kbd>1</kbd></button>
        <button class="btn primary big" id="said">말했어요 <kbd>2</kbd></button>
      </div>
      <div>${reviewToggleHtml(rec)}</div>`;
    wireSpeaker($('#spk'), rec.en);
    $('#stuck').onclick = () => speakResult(false);
    $('#said').onclick = () => speakResult(true);
    wireReviewToggle();
    $('#said').focus();
  }
  function reveal() {
    card.shown = true; render();
    speak(recs.get(card.id).en);
  }
  function speakResult(ok) {
    let rec = Logic.applyOutcome(card.pre, ok ? 'right' : 'struct');
    if (card.override != null) rec = Logic.setReview(rec, card.override);
    saveRec(rec);
    curRound().res[card.id] = ok;
    advance();
  }

  // ── 타이핑 모드 ──
  function renderType(rec) {
    if (!card || card.id !== rec.id || card.mode !== 'type') card = { id: rec.id, mode: 'type', pre: rec, hint: 0, input: '', result: null };
    const el = $('#card');
    el.className = 'card';
    const spell = (card.pre.spell || []);
    const spellBox = spell.length ? `<div class="spellbox"><b>지난번 틀린 철자</b>${spell.map(p => `<span class="pair"><s>${esc(p.wrong)}</s> → ${esc(p.right)}</span>`).join(' ')}</div>` : '';
    const graded = !!card.result;
    el.innerHTML = `
      <div class="stat">${statLine(graded ? rec : card.pre)}</div>
      <div class="ko">${esc(rec.ko)}</div>
      ${spellBox}
      <textarea id="answer" rows="2" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="영어로 입력" ${graded ? 'readonly' : ''}>${esc(card.input)}</textarea>
      ${card.hint && !graded ? `<div class="hint">${esc(Grade.hint(rec.en, card.hint))}</div>` : ''}
      ${graded ? resultHtml(rec) : `
      <div class="actions">
        <button class="btn" id="hintBtn">힌트 <kbd>Ctrl+H</kbd></button>
        <button class="btn" id="giveUp">모르겠어요</button>
        <button class="btn" id="spk" aria-label="듣기">🔊</button>
        <span class="grow"></span>
        <button class="btn primary" id="check">확인 <kbd>Enter</kbd></button>
      </div>`}`;
    const ta = $('#answer');
    ta.addEventListener('input', () => { card.input = ta.value; });
    if (!graded) {
      $('#hintBtn').onclick = () => { showHint(); };
      $('#giveUp').onclick = giveUp;
      $('#check').onclick = check;
      wireSpeaker($('#spk'), rec.en);
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    } else {
      wireResult(rec);
      // 입력칸에 초점을 그대로 둔다: 폰 키보드가 닫히지 않고, Enter 한 번 더로 다음 문장
      ta.focus({ preventScroll: true });
    }
  }
  function showHint() {
    if (!card || card.result) return;
    card.hint = Math.min(2, card.hint + 1); render();
  }

  function resultHtml(rec) {
    const g = card.result;
    const ok = card.outcome === 'right' || card.outcome === 'alt';
    const label = card.outcome === 'alt' ? '맞았어요 (다른 표현으로 저장)' : ok ? '맞았어요' :
      card.outcome === 'spell' ? '스펠링 실수' : card.outcome === 'struct' ? '구조 실수' : '틀렸어요 (다시 볼 것에 넣지 않음)';
    const line = (words, marks, tag) => words.map((w, i) => marks[i] ? `<${tag}>${esc(w)}</${tag}>` : esc(w)).join(' ');
    const showCmp = !ok || card.outcome === 'alt' || g.matched !== rec.en;
    const cmp = card.gaveUp
      ? `<div class="cmp"><span class="lab">정답</span><span class="line">${esc(rec.en)}</span></div>`
      : `<div class="cmp">
          <span class="lab">내 답</span><span class="line">${ok ? esc(card.input) : line(g.userWords, g.userMarks, 's') || '<span class="lab">(비어 있음)</span>'}</span>
          <span class="lab">정답</span><span class="line">${ok ? esc(rec.en) : line(g.answerWords, g.answerMarks, 'mark')}</span>
        </div>`;
    const wrongNow = !g.correct;
    const sel = k => card.outcome === k ? ' on' : '';
    return `
      <div class="verdict ${ok ? 'ok' : 'bad'}">${label}</div>
      ${showCmp || !ok ? cmp : `<div class="cmp"><span class="lab">정답</span><span class="line">${esc(rec.en)}</span></div>`}
      ${wrongNow ? `<div class="classify">
        <span class="lab">분류</span>
        <button class="btn${sel('spell')}" data-out="spell">스펠링</button>
        <button class="btn${sel('struct')}" data-out="struct">구조</button>
        <button class="btn${sel('skip')}" data-out="skip">넣지 않기</button>
        ${card.gaveUp || !card.input.trim() ? '' : `<button class="btn${sel('alt')}" data-out="alt">이것도 정답</button>`}
      </div>` : ''}
      <div class="actions">
        ${reviewToggleHtml(rec)}
        <span class="grow"></span>
        <button class="btn" id="spk" aria-label="듣기">🔊</button>
        <button class="btn primary" id="next">다음 <kbd>Enter</kbd></button>
      </div>`;
  }
  function wireResult(rec) {
    wireSpeaker($('#spk'), rec.en);
    $('#next').onclick = advance;
    wireReviewToggle();
    document.querySelectorAll('[data-out]').forEach(b => b.onclick = () => setOutcome(b.dataset.out));
  }

  function setOutcome(outcome) {
    const g = card.result;
    const spell = outcome === 'spell' ? (g.spell && g.spell.length ? g.spell : g.subs || []) : [];
    let rec = Logic.applyOutcome(card.pre, outcome, { spell, alt: outcome === 'alt' ? card.input : null });
    card.override = null;   // 분류를 다시 고르면 빼기/넣기 선택은 초기화
    saveRec(rec);
    card.outcome = outcome;
    curRound().res[card.id] = outcome === 'right' || outcome === 'alt';
    saveRounds();
    render();
  }

  function check() {
    if (!card || card.result) return;
    const ta = $('#answer');
    card.input = ta.value;
    if (!card.input.trim()) { ta.focus(); return; }
    const rec = recs.get(card.id);
    const g = Grade.grade(card.input, rec.en, rec.alts);
    card.result = g;
    setOutcome(g.correct ? 'right' : g.kind);
  }
  function giveUp() {
    if (!card || card.result) return;
    const rec = recs.get(card.id);
    card.input = $('#answer').value;
    card.gaveUp = true;
    card.result = { correct: false, kind: 'struct', spell: [], subs: [], userWords: [], userMarks: [], answerWords: [], answerMarks: [] };
    setOutcome('struct');
    speak(rec.en);
  }

  // ── 아래쪽: 백업 알림, 다시 볼 것 비우기 ──
  function renderFoot() {
    const days = lastBackup ? Math.floor((Date.now() - lastBackup) / DAY) : null;
    const touched = all().some(r => r.seen);
    const warn = touched && (days === null || days >= 7);
    const bk = lastBackup ? (days === 0 ? '마지막 백업: 오늘' : `마지막 백업: ${days}일 전`) : '백업한 적 없음';
    let right = '';
    if (settings.tab === 'review' && all().some(r => r.review)) {
      const n = all().filter(r => r.review).length;
      right = footConfirm
        ? `<span class="confirm">다시 볼 것 ${n}개를 모두 뺄까요? <button class="yes" id="clearYes">비우기</button><button id="clearNo">취소</button></span>`
        : `<button id="clearAsk">다시 볼 것 비우기</button>`;
    }
    $('#foot').innerHTML = `<button id="backupNow" class="${warn ? 'warn' : ''}">${bk}${warn ? ' · 지금 백업' : ''}</button>${right}`;
    $('#backupNow').onclick = exportJSON;
    const a = $('#clearAsk'); if (a) a.onclick = () => { footConfirm = true; renderFoot(); };
    const no = $('#clearNo'); if (no) no.onclick = () => { footConfirm = false; renderFoot(); };
    const yes = $('#clearYes'); if (yes) yes.onclick = async () => {
      const changed = all().filter(r => r.review).map(r => Logic.setReview(r, false));
      changed.forEach(r => recs.set(r.id, r));
      await Store.putSentences(changed);
      // 다시 볼 것 탭의 진행 중인 바퀴도 정리
      Object.keys(rounds).filter(k => k.startsWith('review|')).forEach(k => { delete rounds[k]; delete queues[k]; });
      saveRounds(); saveQueues();
      footConfirm = false; card = null; render();
    };
  }

  // ── 키보드 ──
  document.addEventListener('keydown', e => {
    if (!$('#manage').hidden) return;
    if (e.isComposing || e.keyCode === 229) return;          // 한글 조합 중 Enter 무시
    const r = curRound();
    const finished = r.pos >= r.ids.length;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H')) {
      if (settings.mode === 'type' && !finished) { e.preventDefault(); showHint(); }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const t = e.target;
      if (t && t.tagName === 'BUTTON' && t.id !== 'next' && t.id !== 'nextRound' && t.id !== 'show' && t.id !== 'said') return; // 버튼은 그 버튼 동작
      if (t && (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'checkbox'))) return;
      if (finished) { e.preventDefault(); newRound(); render(); return; }
      if (settings.mode === 'type') {
        e.preventDefault();
        if (card && card.result) advance(); else check();
      } else if (card && !card.shown) { e.preventDefault(); reveal(); }
      return;
    }
    if (settings.mode === 'speak' && card && card.shown && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.key === '1') { e.preventDefault(); speakResult(false); }
      if (e.key === '2') { e.preventDefault(); speakResult(true); }
    }
  });

  // ── 위쪽 컨트롤 ──
  $('#modeSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    settings.mode = b.dataset.mode; card = null; saveSettings(); render();
  });
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    settings.tab = b.dataset.tab; card = null; footConfirm = false; saveSettings(); render();
  });
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.filter) settings.filter = b.dataset.filter;
    if (b.dataset.sub) settings.sub[settings.tab] = b.dataset.sub;
    card = null; saveSettings(); render();
  });
  $('#shuffle').addEventListener('change', e => {
    settings.shuffle = e.target.checked;
    queues = {}; saveQueues();      // 다음 바퀴부터 새 순서
    saveSettings(); render();
  });
  $('#roundLen').addEventListener('change', e => {
    settings.len = +e.target.value; saveSettings();
    // 아직 한 문장도 안 풀었으면 지금 바퀴부터 새 길이로 (꺼냈던 문장은 줄 앞에 되돌려 놓는다)
    const key = roundKey(), r = rounds[key];
    if (r && r.pos === 0 && !Object.keys(r.res).length) {
      const q = queues[key];
      if (q) { q.rem = r.ids.concat(q.rem.filter(id => !r.ids.includes(id))); q.seen = q.seen.filter(id => !r.ids.includes(id)); }
      delete rounds[key]; card = null;
    }
    render();
  });

  // ── 관리 화면 ──
  let editing = null;   // 편집 중인 문장 id (새 문장이면 'new')
  let delAsk = false;
  function openManage() { $('#manage').hidden = false; editing = null; renderManage(); $('#search').focus(); }
  function closeManage() { $('#manage').hidden = true; editing = null; render(); }
  $('#openManage').onclick = openManage;
  $('#closeManage').onclick = closeManage;
  $('#search').addEventListener('input', () => renderResults());
  $('#addBtn').onclick = () => { editing = 'new'; delAsk = false; renderManage(); };

  function renderManage() { renderEditor(); renderResults(); }

  function renderResults() {
    const q = $('#search').value.trim().toLowerCase();
    let list = all().sort((a, b) => a.order - b.order);
    if (q) list = list.filter(r => r.en.toLowerCase().includes(q) || r.ko.includes(q) || (r.sub || '').toLowerCase().includes(q));
    const shown = list.slice(0, 60);
    $('#results').innerHTML = shown.map(r => `
      <div class="item" data-id="${esc(r.id)}">
        <div class="ien">${esc(r.en)}</div>
        <div class="iko">${esc(r.ko)}</div>
        <div class="imeta">${esc(r.deck)} · ${esc(r.sub || '미분류')}${r.right || r.wrong ? ` · 맞힘 ${r.right} · 틀림 ${r.wrong}` : ''}${r.review ? ' · <span class="rv">다시 볼 것</span>' : ''}</div>
      </div>`).join('') + (list.length > shown.length ? `<div class="more">${list.length}개 중 ${shown.length}개 · 검색어로 좁혀 보세요</div>` : (q && !list.length ? '<div class="more">찾는 문장이 없어요</div>' : ''));
  }
  $('#results').addEventListener('click', e => {
    const it = e.target.closest('.item'); if (!it) return;
    editing = it.dataset.id; delAsk = false; renderEditor();
    $('#editor').scrollIntoView({ block: 'nearest' });
  });

  function renderEditor() {
    const box = $('#editor');
    if (!editing) { box.innerHTML = ''; box.className = ''; return; }
    const r = editing === 'new' ? { deck: settings.tab === '구동사' ? '구동사' : '업무 회화', sub: '', en: '', ko: '', alts: [] } : recs.get(editing);
    if (!r) { editing = null; box.innerHTML = ''; return; }
    const subs = [...new Set([].concat(SUBS['업무 회화'], SUBS['구동사'], all().map(x => x.sub)).filter(Boolean))];
    box.className = 'editor';
    box.innerHTML = `
      <div class="two">
        <select id="eDeck">${Logic.DECKS.map(d => `<option ${d === r.deck ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
        <input type="text" id="eSub" list="subList" value="${esc(r.sub || '')}" placeholder="세부 분류 (비우면 자동)">
        <datalist id="subList">${subs.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      </div>
      <textarea id="eKo" placeholder="한국어">${esc(r.ko)}</textarea>
      <textarea id="eEn" placeholder="영어">${esc(r.en)}</textarea>
      ${editing !== 'new' ? `<div class="lab">같이 인정하는 다른 정답 (한 줄에 하나)</div><textarea id="eAlts">${esc((r.alts || []).join('\n'))}</textarea>` : ''}
      <div class="actions">
        <button class="btn primary" id="eSave">저장</button>
        <button class="btn" id="eCancel">닫기</button>
        <span class="grow"></span>
        ${editing !== 'new' ? (delAsk ? `<span class="confirm">정말 지울까요? <button class="btn" id="eDelYes" style="color:var(--bad)">지우기</button></span>` : `<button class="btn ghost" id="eDel">삭제</button>`) : ''}
      </div>
      <div class="msg" id="eMsg"></div>`;
    $('#eCancel').onclick = () => { editing = null; renderEditor(); };
    $('#eSave').onclick = saveEditor;
    const d = $('#eDel'); if (d) d.onclick = () => { delAsk = true; renderEditor(); };
    const dy = $('#eDelYes'); if (dy) dy.onclick = async () => {
      recs.delete(editing); await Store.deleteSentence(editing);
      editing = null; delAsk = false; renderManage();
    };
    if (editing === 'new') $('#eKo').focus();
  }

  async function saveEditor() {
    const deck = $('#eDeck').value, sub = $('#eSub').value.trim(), en = $('#eEn').value.trim(), ko = $('#eKo').value.trim();
    const msg = $('#eMsg');
    if (!en || !ko) { msg.className = 'msg bad'; msg.textContent = '한국어와 영어를 모두 넣어 주세요'; return; }
    const key = Logic.enKey(en);
    const dupe = all().find(r => r.id !== editing && Logic.enKey(r.en) === key);
    if (dupe) { msg.className = 'msg bad'; msg.textContent = '같은 영어 문장이 이미 있어요'; return; }
    let rec;
    if (editing === 'new') {
      const order = all().reduce((m, r) => Math.max(m, r.order || 0), 0) + 1;
      rec = Logic.newRecord({ deck, sub: sub || (deck === '업무 회화' ? '미분류' : ''), en, ko }, order);
      Object.assign(rec, Logic.classify(rec, all()));
    } else {
      const old = recs.get(editing);
      rec = Object.assign({}, old, { deck, sub: sub || old.sub, en, ko,
        alts: $('#eAlts').value.split('\n').map(s => s.trim()).filter(Boolean) });
      if (old.en !== en || old.deck !== deck) Object.assign(rec, { grp: Logic.classify(Object.assign({}, rec, { grp: 0 }), all().filter(r => r.id !== rec.id)).grp });
    }
    await saveRec(rec);
    const wasNew = editing === 'new';
    editing = wasNew ? 'new' : rec.id;
    renderManage();
    const m = $('#eMsg'); if (m) { m.className = 'msg ok'; m.textContent = wasNew ? '추가했어요. 다음 문장을 넣을 수 있어요' : '저장했어요'; }
  }

  // CSV 불러오기
  $('#csvFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    const msg = $('#csvMsg');
    if (!f) return;
    try {
      const rows = Logic.parseCSV(await f.text());
      const res = Logic.importRows(rows, all());
      res.added.forEach(r => recs.set(r.id, r));
      await Store.putSentences(res.added);
      msg.className = 'msg ok';
      msg.textContent = `새로 추가 ${res.added.length}개, 중복 ${res.dup}개`;
      renderResults();
    } catch (err) {
      msg.className = 'msg bad'; msg.textContent = '불러오지 못했어요: ' + err.message;
    }
  });

  // 기록 내보내기 / 불러오기
  function stamp() { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; }
  async function exportJSON() {
    const data = { app: 'speak-review', version: 1, exported: new Date().toISOString(),
      sentences: all(), meta: { settings, queues, rounds } };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `스픽복습-기록-${stamp()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    lastBackup = Date.now(); await Store.setMeta('lastBackup', lastBackup);
    const m = $('#backupMsg'); m.className = 'msg ok'; m.textContent = `내보냈어요 (문장 ${recs.size}개)`;
    renderFoot();
  }
  $('#exportBtn').onclick = exportJSON;

  let pendingImport = null;
  $('#jsonFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    const m = $('#backupMsg');
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'speak-review' || !Array.isArray(data.sentences)) throw new Error('이 앱의 기록 파일이 아니에요');
      pendingImport = data;
      const rv = data.sentences.filter(r => r.review).length;
      m.className = 'msg';
      m.innerHTML = `문장 ${data.sentences.length}개 · 다시 볼 것 ${rv}개가 든 파일이에요. 지금 이 기기의 기록을 모두 이 파일로 바꿀까요?
        <div class="actions" style="margin-top:8px"><button class="btn primary" id="impYes">바꾸기</button><button class="btn" id="impNo">취소</button></div>`;
      $('#impNo').onclick = () => { pendingImport = null; m.textContent = ''; };
      $('#impYes').onclick = async () => {
        const d = pendingImport; pendingImport = null;
        const meta = Object.assign({}, d.meta || {}, { lastBackup });
        await Store.replaceAll(d.sentences, meta);
        await load();
        m.className = 'msg ok'; m.textContent = '불러왔어요';
        renderResults();
      };
    } catch (err) { m.className = 'msg bad'; m.textContent = '불러오지 못했어요: ' + err.message; }
  });

  $('#resetQueues').onclick = async () => {
    queues = {}; rounds = {}; card = null;
    await saveQueues(); await saveRounds();
    const m = $('#queueMsg'); m.className = 'msg ok'; m.textContent = '모든 탭을 처음부터 다시 돌아요';
  };

  // ── 시작 ──
  async function load() {
    const seed = window.SEED || [];
    let list = await Store.allSentences();
    if (!list.length) {
      list = seed.map(s => Logic.newRecord(s, s.order));
      await Store.putSentences(list);
      await Store.setMeta('seedIds', seed.map(s => s.id));
    } else {
      // 앱 업데이트로 기본 문장이 늘었으면 새 것만 더한다 (지운 문장은 되살리지 않음, 같은 영어 문장은 건너뜀)
      const given = new Set(await Store.getMeta('seedIds', null) || seed.filter(s => +s.id.slice(1) < 910).map(s => s.id));
      if (seed.some(s => !given.has(s.id))) {
        const ids = new Set(list.map(r => r.id)), have = new Set(list.map(r => Logic.enKey(r.en)));
        const add = seed.filter(s => !given.has(s.id) && !ids.has(s.id) && !have.has(Logic.enKey(s.en)))
          .map(s => Logic.newRecord(s, s.order));
        if (add.length) { await Store.putSentences(add); list = list.concat(add); }
        await Store.setMeta('seedIds', seed.map(s => s.id));
      }
    }
    recs.clear(); list.forEach(r => recs.set(r.id, r));
    settings = Object.assign(settings, await Store.getMeta('settings', {}));
    queues = await Store.getMeta('queues', {});
    rounds = await Store.getMeta('rounds', {});
    lastBackup = await Store.getMeta('lastBackup', 0);
    card = null;
  }

  async function start() {
    await Store.init();
    await load();
    pickVoice();
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = pickVoice;
    render();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  start();
})();
