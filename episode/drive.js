/* 운전 모드: 듣고 따라 말하기만. 녹음·채점 없음.
   블루투스·핸들 버튼(Media Session), 화면 꺼짐 방지(Wake Lock), 음성 명령(선택) */
(function () {
  'use strict';
  const E = window.EpCore;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hasTTS = 'speechSynthesis' in window;

  // ── 음성 ──
  let vEn = null, vKo = null;
  function pickVoices() {
    if (!hasTTS) return;
    const vs = speechSynthesis.getVoices();
    vEn = vs.find(v => v.lang === 'en-US' && /google|natural|samantha|aria|jenny/i.test(v.name)) || vs.find(v => v.lang === 'en-US') || vs.find(v => /^en/.test(v.lang)) || null;
    vKo = vs.find(v => /^ko/.test(v.lang) && /google|natural|sunhi|sun-hi|yuna|heami|injoon/i.test(v.name)) || vs.find(v => /^ko/.test(v.lang)) || null;
  }
  if (hasTTS) { pickVoices(); speechSynthesis.onvoiceschanged = pickVoices; }

  let token = 0;   // 낭독을 멈추거나 건너뛸 때 이전 콜백을 무시하기 위한 번호
  function utter(text, lang, rate, done) {
    if (!hasTTS) { setTimeout(done, 800); return; }
    const my = token;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'ko' ? 'ko-KR' : 'en-US';
    const v = lang === 'ko' ? vKo : vEn; if (v) u.voice = v;
    u.rate = rate || 1;
    let fired = false;
    const fin = () => { if (fired || my !== token) return; fired = true; clearTimeout(guard); done(); };
    // 일부 휴대폰은 끝 신호(onend)를 빠뜨린다 → 예상 시간의 2배가 지나면 넘어간다
    const est = (lang === 'ko' ? text.length / 5 : text.split(/\s+/).length / 2) / (rate || 1);
    const guard = setTimeout(fin, (est * 2 + 4) * 1000);
    u.onend = fin; u.onerror = fin;
    speechSynthesis.speak(u);
  }
  function stopSpeech() { token++; if (hasTTS) speechSynthesis.cancel(); }

  // 읽기 화면에서 쓰는 간단한 듣기
  window.Speech = {
    say(list, rate) {
      stopSpeech();
      let i = 0;
      const go = () => { if (i < list.length) { const x = list[i++]; utter(x.text, x.lang, rate, () => setTimeout(go, 250)); } };
      go();
    },
    stop: stopSpeech,
  };

  // ── 소리 없는 오디오: 차량 버튼이 이 앱으로 오게 '재생 중' 상태를 만든다 ──
  let silent = null;
  function silentUrl() {
    const sr = 8000, n = sr;           // 1초
    const buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  // ── 화면 꺼짐 방지 ──
  let lock = null;
  async function wake() {
    try { if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen'); } catch (e) { /* 무시 */ }
  }
  document.addEventListener('visibilitychange', () => { if (S && document.visibilityState === 'visible') wake(); });

  // ── 진행 ──
  let S = null;   // { steps, i, playing, rate, set, timer, groupStart }
  function build(eps, set) {
    const steps = [];
    eps.forEach((e, k) => {
      steps.push({ g: k * 1000 - 1, lang: 'ko', text: `${k + 1}번째. ${e.topic}`, role: 'title', show: e.topic, sub: `에피소드 ${k + 1} / ${eps.length}`, ep: k });
      E.driveSteps(e, set).forEach(s => steps.push(Object.assign({}, s, { g: k * 1000 + s.g, ep: k })));
    });
    return { steps, eps };
  }

  function start(eps, set) {
    if (!eps || !eps.length) return;
    stop(true);
    const b = build(eps, set);
    S = { steps: b.steps, eps: b.eps, i: 0, playing: true, rate: set.rate || 1, set, timer: null, groupStart: 0 };
    openScreen();
    if (!silent) { silent = new Audio(silentUrl()); silent.loop = true; silent.volume = 0.01; }
    silent.play().catch(() => {});
    wake();
    setupMedia();
    if (set.voiceCmd) listen(true);
    play();
  }

  function play() {
    if (!S) return;
    clearTimeout(S.timer);
    stopSpeech();
    if (S.i >= S.steps.length) return finish();
    const s = S.steps[S.i];
    const prev = S.steps[S.i - 1];
    if (!prev || prev.g !== s.g) S.groupStart = Date.now();
    draw();
    const my = token;
    const next = () => { if (!S || my !== token || !S.playing) return; S.i++; S.timer = setTimeout(play, 300); };
    if (s.pause) S.timer = setTimeout(next, s.pause * 1000);
    else utter(s.text, s.lang, s.role === 'title' ? 1 : S.rate, next);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }

  function groupBounds(i) {
    const g = S.steps[i].g;
    let a = i; while (a > 0 && S.steps[a - 1].g === g) a--;
    let z = i; while (z < S.steps.length - 1 && S.steps[z + 1].g === g) z++;
    return [a, z];
  }
  function nextGroup() {
    if (!S) return;
    const [, z] = groupBounds(Math.min(S.i, S.steps.length - 1));
    S.i = z + 1; S.playing = true; play();
  }
  function repeatGroup() {
    if (!S) return;
    const [a] = groupBounds(Math.min(S.i, S.steps.length - 1));
    // 묶음을 시작한 지 2초 안에 또 누르면 앞 문장으로
    if (Date.now() - S.groupStart < 2000 && a > 0) S.i = groupBounds(a - 1)[0]; else S.i = a;
    S.playing = true; play();
  }
  function pause() {
    if (!S) return;
    S.playing = false; clearTimeout(S.timer); stopSpeech();
    // 다시 시작하면 지금 묶음 처음부터
    S.i = groupBounds(Math.min(S.i, S.steps.length - 1))[0];
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    draw();
  }
  function resume() { if (!S) return; S.playing = true; if (silent) silent.play().catch(() => {}); play(); }
  function toggle() { if (S && S.playing) pause(); else resume(); }
  function slower() { if (!S) return; S.rate = Math.max(0.6, Math.round((S.rate - 0.15) * 100) / 100); flash(`속도 ${S.rate}배`); repeatGroup(); }
  function finish() {
    if (!S) return;
    S.playing = false; S.done = true; draw();
    utter('오늘 연습 끝.', 'ko', 1, () => {});
  }
  function stop(silentStop) {
    if (S) { clearTimeout(S.timer); }
    stopSpeech(); listen(false);
    if (silent) silent.pause();
    if (lock) { lock.release().catch(() => {}); lock = null; }
    S = null;
    if (!silentStop) closeScreen();
  }

  // ── 차량 버튼 ──
  function setupMedia() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const h = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) { /* 지원 안 함 */ } };
    h('play', resume); h('pause', pause); h('nexttrack', nextGroup); h('previoustrack', repeatGroup);
    h('seekforward', nextGroup); h('seekbackward', repeatGroup); h('stop', () => stop());
  }
  function mediaMeta(s) {
    if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: s.show || '', artist: S.eps[s.ep] ? S.eps[s.ep].topic : '', album: '오픽 운전 모드' }); } catch (e) { /* 무시 */ }
  }

  // ── 음성 명령 (선택). 안 되면 버튼만으로 다 된다 ──
  let rec = null, listening = false;
  function listen(on) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    listening = on && !!SR;
    if (!SR) return;
    if (!on) { if (rec) { try { rec.abort(); } catch (e) { /* 무시 */ } rec = null; } return; }
    rec = new SR(); rec.lang = 'ko-KR'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = ev => {
      const t = ev.results[ev.results.length - 1][0].transcript.trim().toLowerCase().replace(/[.!?]/g, '');
      if (t.split(/\s+/).length > 2) return;    // 낭독 소리를 명령으로 착각하지 않게 짧은 말만
      if (/^(다음|넥스트|next)/.test(t)) nextGroup();
      else if (/^(다시|한번 더|리피트|repeat|again)/.test(t)) repeatGroup();
      else if (/^(천천히|느리게|slow)/.test(t)) slower();
      else if (/^(멈춰|정지|그만|스톱|stop|pause)/.test(t)) pause();
      else if (/^(계속|시작|재생|play|go)/.test(t)) resume();
    };
    rec.onend = () => { if (listening && rec) { try { rec.start(); } catch (e) { /* 무시 */ } } };
    try { rec.start(); } catch (e) { /* 무시 */ }
  }

  // ── 화면 ──
  function openScreen() {
    let el = $('#drive');
    if (!el) { el = document.createElement('section'); el.id = 'drive'; el.className = 'drive'; document.body.appendChild(el); el.addEventListener('click', onTap); }
    el.hidden = false;
    document.body.classList.add('driving');
  }
  function closeScreen() { const el = $('#drive'); if (el) el.hidden = true; document.body.classList.remove('driving'); }
  let flashMsg = '', flashT = null;
  function flash(m) { flashMsg = m; clearTimeout(flashT); flashT = setTimeout(() => { flashMsg = ''; if (S) draw(); }, 1500); }
  function draw() {
    const el = $('#drive'); if (!el || !S) return;
    const s = S.steps[Math.min(S.i, S.steps.length - 1)];
    const ep = S.eps[s.ep];
    const label = { title: '다음 주제', q: '질문', ko: '한국어', try: '영어로 말해 보세요', en: '따라 말하기', other: '상대', full: '전체 답변' }[s.role] || '';
    const mine = ep ? ep.lines.filter(l => l.speaker !== 'other').length : 0;
    const pos = s.line != null && ep ? ep.lines.slice(0, s.line + 1).filter(l => l.speaker !== 'other').length : 0;
    const big = s.role === 'try' ? (s.show || '') : s.show || '';
    el.innerHTML = `<div class="dtop"><span>${S.done ? '끝' : esc(ep ? ep.topic : '')} ${!S.done && ep ? `· ${s.ep + 1}/${S.eps.length}` : ''}${pos && s.role !== 'full' ? ` · 문장 ${pos}/${mine}` : ''}</span>
        <button class="dclose" data-d="close">끝내기</button></div>
      <div class="dmain">
        <div class="dlab ${s.role === 'try' ? 'try' : ''}">${S.done ? '오늘 연습 끝' : S.playing ? esc(label) : '멈춤'}</div>
        <div class="dbig ${s.lang === 'ko' || s.role === 'try' ? 'ko' : ''}">${S.done ? '수고했어요' : esc(big)}</div>
        ${s.sub && s.role !== 'try' && !S.done ? `<div class="dsub">${esc(s.sub)}</div>` : ''}
        ${flashMsg ? `<div class="dflash">${esc(flashMsg)}</div>` : ''}
      </div>
      <div class="dbtns">
        <button data-d="prev" aria-label="다시 듣기">⟲<small>다시</small></button>
        <button data-d="toggle" class="main" aria-label="멈춤 또는 계속">${S.playing ? '❚❚' : '▶'}<small>${S.playing ? '멈춤' : '계속'}</small></button>
        <button data-d="next" aria-label="다음 문장">⏭<small>다음</small></button>
      </div>
      <div class="dsmall"><button data-d="slow">천천히</button><span>${listening ? '🎙 음성 명령 켜짐' : ''}</span></div>`;
    mediaMeta(s);
  }
  function onTap(ev) {
    const b = ev.target.closest('[data-d]'); if (!b) return;
    ({ prev: repeatGroup, next: nextGroup, toggle, slow: slower, close: () => stop() })[b.dataset.d]();
  }

  window.Drive = { start, stop: () => stop(), pause, resume, next: nextGroup, repeat: repeatGroup };
})();
