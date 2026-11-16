/* 에피소드 핵심 규칙 — 화면과 상관없는 순수 함수 (node 테스트에서도 불러 쓴다)
   문장 맞추기, 교체 단어 세기, 검증, episodes.json 읽기, 운전 모드 순서 만들기 */
(function (root) {
  'use strict';
  const RULES = (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : root.EP_RULES;

  // ── 단어 ──
  function norm(s) {
    return String(s || '').replace(/[’‘`´]/g, "'").toLowerCase()
      .replace(/[-–—/]/g, ' ')
      .replace(/[^a-z0-9'$%\s]/g, ' ')
      .replace(/(^|\s)'+|'+(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  const words = s => { const n = norm(s); return n ? n.split(' ') : []; };
  const key = s => words(s).join(' ');

  // 영어 문장으로 만드는 안정적인 id (FNV-1a)
  function sid(en) {
    const k = key(en);
    let h = 0x811c9dc5;
    for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return 'h' + h.toString(16).padStart(8, '0');
  }

  // ── 단어 단위 비교 (LCS) ──
  function diff(a, b) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const ops = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) { ops.push({ op: '=', a: i++, b: j++ }); }
      else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) ops.push({ op: '+', b: j++ });
      else ops.push({ op: '-', a: i++ });
    }
    // 바뀐 덩어리: 연속된 빼기·더하기 묶음. 덩어리마다 max(뺀 수, 더한 수)를 센다
    const hunks = [];
    let cur = null;
    ops.forEach(o => {
      if (o.op === '=') { cur = null; return; }
      if (!cur) { cur = { del: [], ins: [] }; hunks.push(cur); }
      if (o.op === '-') cur.del.push(a[o.a]); else cur.ins.push(b[o.b]);
    });
    const changed = hunks.reduce((s, h) => s + Math.max(h.del.length, h.ins.length), 0);
    const same = ops.filter(o => o.op === '=').length;
    const insIdx = new Set(ops.filter(o => o.op === '+').map(o => o.b));
    return { changed, same, hunks, insIdx, swapped: hunks.map(h => ({ from: h.del.join(' '), to: h.ins.join(' ') })) };
  }

  // 화면 표시용: 문장을 띄어쓰기 단위로 나누고, 바뀐 단어가 든 조각에 표시
  function markTokens(en, insIdx) {
    const parts = String(en).split(/(\s+)/);
    let w = 0;
    return parts.map(p => {
      if (!p.trim()) return { t: p, sp: true };
      const n = words(p).length;
      let ch = false;
      for (let k = 0; k < n; k++) if (insIdx.has(w + k)) ch = true;
      w += n;
      return { t: p, ch };
    });
  }

  // ── 저장 문장 색인 ──
  function buildIndex(sentences) {
    const list = sentences.filter(s => s && s.en).map(s => {
      const w = words(s.en);
      return { id: sid(s.en), en: s.en, ko: s.ko || '', deck: s.deck || '', w, set: new Set(w), rec: s };
    });
    const byId = new Map(), byKey = new Map();
    list.forEach(x => { if (!byId.has(x.id)) byId.set(x.id, x); const k = x.w.join(' '); if (!byKey.has(k)) byKey.set(k, x); });
    return { list, byId, byKey };
  }
  function lookup(idx, src) {
    if (!src) return null;
    if (/^h[0-9a-f]{8}$/.test(src) && idx.byId.has(src)) return idx.byId.get(src);
    return idx.byKey.get(key(src)) || null;
  }
  function swapOk(d, srcLen, rules) {
    return d.changed >= 1 && d.changed <= rules.maxSwap && d.same >= Math.ceil(srcLen * rules.swapKeepRatio);
  }
  // 영어 문장과 가장 가까운 저장 문장 (그대로 같으면 원문, 몇 단어만 다르면 교체)
  function findBest(en, idx, rules) {
    rules = rules || RULES;
    const b = words(en);
    if (!b.length) return null;
    const exact = idx.byKey.get(b.join(' '));
    if (exact) return { type: '원문', src: exact };
    const bs = new Set(b);
    let best = null;
    for (const x of idx.list) {
      if (Math.abs(x.w.length - b.length) > rules.maxSwap) continue;
      let common = 0; x.set.forEach(t => { if (bs.has(t)) common++; });
      if (common < Math.ceil(x.w.length * rules.swapKeepRatio)) continue;
      const d = diff(x.w, b);
      if (!swapOk(d, x.w.length, rules)) continue;
      if (!best || d.changed < best.d.changed || (d.changed === best.d.changed && d.same > best.d.same)) best = { src: x, d };
    }
    return best ? { type: '교체', src: best.src, d: best.d } : null;
  }

  // ── 받은 글 읽기 (episodes.json) ──
  const TYPE_ALIASES = { '원문': '원문', original: '원문', orig: '원문', exact: '원문',
    '교체': '교체', swap: '교체', replace: '교체', replaced: '교체', variant: '교체',
    '연결': '연결', connect: '연결', connector: '연결', link: '연결', bridge: '연결', new: '연결' };
  function parseIncoming(text) {
    let t = String(text || '').trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    if (!/^[\[{]/.test(t)) { const s = t.search(/[\[{]/); if (s >= 0) t = t.slice(s); }
    let data;
    try { data = JSON.parse(t); } catch (e) { throw new Error('JSON 형식이 아니에요 (' + e.message + ')'); }
    const arr = Array.isArray(data) ? data : Array.isArray(data.episodes) ? data.episodes : [data];
    return arr.map(normalizeEpisode);
  }
  function normalizeEpisode(e) {
    if (!e || typeof e !== 'object') throw new Error('에피소드 형식이 아니에요');
    const q = e.question;
    const question = !q ? null : typeof q === 'string' ? { en: q, ko: '' } : { en: q.en || '', ko: q.ko || '' };
    const rawLines = e.lines || e.sentences || e.answer || [];
    if (!Array.isArray(rawLines) || !rawLines.length) throw new Error(`"${e.topic || '이름 없음'}" 에 문장(lines)이 없어요`);
    const lines = rawLines.map(l => {
      if (typeof l === 'string') l = { en: l };
      const sp = String(l.speaker || 'me').toLowerCase();
      return { en: String(l.en || '').trim(), ko: String(l.ko || '').trim(),
        type: TYPE_ALIASES[String(l.type || '').trim().toLowerCase()] || TYPE_ALIASES[String(l.type || '').trim()] || '',
        src: l.src ? String(l.src).trim() : '', speaker: /other|상대|them|partner/.test(sp) ? 'other' : 'me', tag: l.tag || '' };
    }).filter(l => l.en);
    return { id: e.id ? String(e.id) : '', topic: String(e.topic || '').trim(), group: e.group || '',
      kind: ['opic', 'roleplay', 'life', 'set'].includes(e.kind) ? e.kind : (e.situation ? 'life' : 'opic'),
      question, situation: e.situation || '', lines, note: e.note || '' };
  }

  // ── 검증 ── 줄마다 유형을 다시 판정하고, 규칙 위반을 errors 로 돌려준다
  function validate(ep, idx, rules) {
    rules = rules || RULES;
    const errors = [], warnings = [];
    const lines = ep.lines.map((l0, i) => {
      const l = Object.assign({}, l0);
      const n = i + 1;
      if (l.speaker === 'other') { l.type = '상대'; delete l.src; delete l.swapped; return l; }
      const want = l.type;
      const declared = lookup(idx, l.src);
      if (l.src && !declared) warnings.push({ line: n, msg: `출처 문장을 저장 목록에서 못 찾았어요: "${l.src}"` });
      const exact = idx.byKey.get(key(l.en));
      let res = null;
      if (exact) res = { type: '원문', src: exact };
      else if (declared) {
        const d = diff(declared.w, words(l.en));
        if (swapOk(d, declared.w.length, rules)) res = { type: '교체', src: declared, d };
        else if (want === '교체' || want === '원문') {
          const alt = findBest(l.en, idx, rules);
          if (alt) res = alt;
          else errors.push({ line: n, msg: `교체 문장인데 바뀐 단어가 ${d.changed}개예요 (최대 ${rules.maxSwap}개, 원래 문장 단어 절반 이상은 그대로)`, en: l.en, src: declared.en });
        }
      }
      if (!res && (want === '원문' || want === '교체') && !declared) {
        res = findBest(l.en, idx, rules);
        if (!res) errors.push({ line: n, msg: '원문·교체라고 했지만 맞는 저장 문장이 없어요', en: l.en });
      }
      if (!res && want !== '원문' && want !== '교체') res = findBest(l.en, idx, rules);
      if (res) {
        if (want && want !== res.type && !(want === '연결' && res.type !== '연결'))
          warnings.push({ line: n, msg: `${want} → ${res.type} 로 바로잡았어요` });
        l.type = res.type; l.src = res.src.id; l.srcEn = res.src.en;
        if (res.type === '원문') { if (!l.ko) l.ko = res.src.ko; delete l.swapped; }
        else l.swapped = res.d.swapped;
      } else {
        if (errors.some(e => e.line === n)) l.type = want || '연결';
        else { l.type = '연결'; delete l.src; delete l.swapped; delete l.srcEn; }
      }
      if (l.type === '연결' && words(l.en).length > rules.connectMaxWords)
        warnings.push({ line: n, msg: `연결 문장이 길어요 (${words(l.en).length}단어)` });
      return l;
    });
    const out = Object.assign({}, ep, { lines });
    const st = stats(out);
    if (!ep.topic) errors.push({ msg: '주제(topic)가 없어요' });
    if (ep.kind !== 'set') {
      if (st.ratio > rules.maxConnectRatio)
        errors.push({ msg: `연결 문장이 ${Math.round(st.ratio * 100)}%예요 (최대 ${Math.round(rules.maxConnectRatio * 100)}%). 연결 ${st.conn}개 / 내 문장 ${st.me}개` });
      if (ep.kind === 'life') {
        if (!ep.situation) errors.push({ msg: '일상생활 대화에 상황 설명(situation)이 없어요' });
        if (st.me < rules.lifeMinLines) errors.push({ msg: `내 대사가 ${st.me}개뿐이에요 (최소 ${rules.lifeMinLines}개)` });
      } else {
        if (!ep.question || !ep.question.en) errors.push({ msg: '오픽 질문(question)이 없어요' });
        if (st.words < rules.wordsMin || st.words > rules.wordsMax)
          errors.push({ msg: `답변이 ${st.words}단어예요 (${rules.wordsMin}~${rules.wordsMax}단어)` });
        else if (st.words < rules.wordsTargetMin || st.words > rules.wordsTargetMax)
          warnings.push({ msg: `답변이 ${st.words}단어예요 (목표 ${rules.wordsTargetMin}~${rules.wordsTargetMax})` });
      }
    }
    return { ep: out, errors, warnings, stats: st, ok: !errors.length };
  }

  function stats(ep) {
    const me = ep.lines.filter(l => l.speaker !== 'other');
    const c = t => me.filter(l => l.type === t).length;
    const orig = c('원문'), swap = c('교체'), conn = me.length - orig - swap;
    const w = me.reduce((s, l) => s + words(l.en).length, 0);
    return { me: me.length, orig, swap, conn, words: w, ratio: me.length ? conn / me.length : 0 };
  }

  // 교체 문장의 바뀐 단어 표시용
  function swapMarks(line, idx) {
    const src = idx && lookup(idx, line.src);
    if (line.type !== '교체' || !src) return null;
    return markTokens(line.en, diff(src.w, words(line.en)).insIdx);
  }

  // 채팅에 다시 보낼 "고쳐 주세요" 글
  function fixRequest(results, rules) {
    rules = rules || RULES;
    const bad = results.filter(r => r.errors.length);
    if (!bad.length) return '';
    let t = `아래 에피소드가 앱 검증을 통과하지 못했어요. 규칙에 맞게 고쳐서 같은 episodes.json 형식으로 다시 주세요.\n`
      + `규칙: 교체 문장은 저장 문장에서 ${rules.maxSwap}단어 이하만 바꾸기, 연결 문장은 내 문장의 ${Math.round(rules.maxConnectRatio * 100)}% 이하, `
      + `오픽 답변은 ${rules.wordsMin}~${rules.wordsMax}단어.\n`;
    bad.forEach(r => {
      t += `\n[${r.ep.topic}${r.ep.question && r.ep.question.en ? ' / ' + r.ep.question.en : ''}]\n`;
      r.errors.forEach(e => {
        t += `- ${e.line ? e.line + '번째 문장: ' : ''}${e.msg}`;
        if (e.en) t += `\n  문장: ${e.en}`;
        if (e.src) t += `\n  출처: ${e.src}`;
        t += '\n';
      });
    });
    return t;
  }

  // 저장용 형식으로 내보내기 (채팅에 현재 상태를 알려줄 때도 쓴다)
  function toExchange(eps, idx) {
    return { format: 'speak-episodes/1', exported: new Date().toISOString().slice(0, 10),
      episodes: eps.map(e => ({ id: e.id, topic: e.topic, kind: e.kind, question: e.question || undefined,
        situation: e.situation || undefined,
        lines: e.lines.map(l => {
          const o = { en: l.en, ko: l.ko, type: l.type === '상대' ? '연결' : l.type };
          if (l.speaker === 'other') o.speaker = 'other';
          const s = idx && lookup(idx, l.src);
          if (s && (l.type === '원문' || l.type === '교체')) o.src = s.en; else if (l.srcEn) o.src = l.srcEn;
          if (l.tag) o.tag = l.tag;
          return o;
        }) })) };
  }

  // 받은 에피소드가 기존 것의 보강인지 새 것인지
  function matchExisting(inc, eps) {
    if (inc.id) { const m = eps.find(e => e.id === inc.id); if (m) return m; }
    const q = inc.question && key(inc.question.en);
    return eps.find(e => e.topic === inc.topic && q && e.question && key(e.question.en) === q)
      || (inc.kind === 'life' ? eps.find(e => e.topic === inc.topic && e.situation && e.situation === inc.situation) : null)
      || null;
  }

  // ── 운전 모드 순서 ──
  // 한 문장 묶음(group) = 한국어 → 멈춤 → 영어 × 반복
  function driveSteps(ep, o) {
    o = Object.assign({ pause: 3, repeat: 2, full: true, question: true }, o || {});
    const steps = [];
    let g = 0;
    if (o.question && ep.question && ep.question.en) steps.push({ g: g++, lang: 'en', text: ep.question.en, role: 'q', show: ep.question.en, sub: ep.question.ko });
    else if (ep.situation) steps.push({ g: g++, lang: 'ko', text: ep.situation, role: 'q', show: ep.situation });
    ep.lines.forEach((l, i) => {
      if (l.speaker === 'other') { steps.push({ g: g++, lang: 'en', text: l.en, role: 'other', show: l.en, sub: l.ko, line: i }); return; }
      const gg = g++;
      if (l.ko) steps.push({ g: gg, lang: 'ko', text: l.ko, role: 'ko', show: l.ko, line: i });
      steps.push({ g: gg, pause: o.pause, role: 'try', show: l.ko || l.en, line: i });
      for (let r = 0; r < Math.max(1, o.repeat); r++) steps.push({ g: gg, lang: 'en', text: l.en, role: 'en', show: l.en, sub: l.ko, line: i });
    });
    if (o.full) {
      // 전체 답변: 브라우저 음성이 긴 글에서 끊기지 않게 문장마다 나눠 읽는다
      const gg = g++;
      ep.lines.forEach((l, i) => { if (l.speaker !== 'other') steps.push({ g: gg, lang: 'en', text: l.en, role: 'full', show: l.en, sub: '전체 답변', line: i }); });
    }
    return steps;
  }
  function estimateSec(steps, rate) {
    rate = rate || 1;
    return steps.reduce((s, x) => {
      if (x.pause) return s + x.pause + 0.4;
      if (x.lang === 'en') return s + (words(x.text).length / 2.5) / rate + 0.6;
      return s + (x.text.replace(/\s/g, '').length / 6.5) / rate + 0.6;
    }, 0);
  }
  // 운전 시간에 맞게 에피소드 묶기 (마지막 하나는 조금 넘쳐도 넣는다)
  function fitPlaylist(eps, minutes, o) {
    if (!minutes) return eps.slice();
    const out = [];
    let t = 0;
    for (const e of eps) {
      if (t >= minutes * 60) break;
      out.push(e); t += estimateSec(driveSteps(e, o), o && o.rate);
    }
    return out;
  }

  const API = { norm, words, key, sid, diff, markTokens, buildIndex, lookup, findBest, parseIncoming, normalizeEpisode,
    validate, stats, swapMarks, fixRequest, toExchange, matchExisting, driveSteps, estimateSec, fitPlaylist, RULES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.EpCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
