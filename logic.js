/* 기록·순서 규칙 — 화면과 상관없는 순수 함수 (node 테스트에서도 불러 쓴다) */
(function (root) {
  'use strict';

  const DECKS = ['업무 회화', '구동사'];

  // ── 문장 하나의 기록 ──
  function newRecord(fields, order) {
    return Object.assign({
      id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      deck: '업무 회화', sub: '미분류', grp: 0, en: '', ko: '', alts: [], order: order || 0,
      right: 0, wrong: 0, last: null, kind: null, review: false, seen: 0, spell: []
    }, fields);
  }

  const clone = r => Object.assign({}, r, { alts: (r.alts || []).slice(), spell: (r.spell || []).map(p => Object.assign({}, p)) });

  function mergeSpell(old, pairs) {
    const out = (old || []).slice();
    (pairs || []).forEach(p => { if (!out.some(o => o.wrong === p.wrong && o.right === p.right)) out.push(p); });
    return out;
  }

  /**
   * 채점 결과를 기록에 반영한다. pre(채점 직전 기록)에서 다시 계산하므로
   * 사용자가 분류 버튼을 여러 번 바꿔 눌러도 결과가 꼬이지 않는다.
   * outcome: 'right' | 'spell' | 'struct' | 'skip'(넣지 않기) | 'alt'(이것도 정답)
   */
  function applyOutcome(pre, outcome, opt) {
    opt = opt || {};
    const r = clone(pre);
    r.seen = opt.now || Date.now();
    if (outcome === 'right' || outcome === 'alt') {
      r.right++; r.last = 'right';
      if (outcome === 'alt' && opt.alt && !r.alts.includes(opt.alt.trim())) r.alts.push(opt.alt.trim());
      return r;
    }
    r.wrong++; r.last = 'wrong';
    if (outcome === 'skip') return r;               // 틀린 횟수만 남기고 목록·분류는 그대로
    r.review = true;
    r.kind = outcome;
    r.spell = outcome === 'spell' ? mergeSpell(pre.spell, opt.spell) : [];
    return r;
  }

  function setReview(rec, on) {
    const r = clone(rec);
    r.review = !!on;
    if (!on) r.spell = [];
    return r;
  }

  // ── 다시 볼 것 필터 ──
  const FILTERS = [
    { key: 'all', label: '전체', test: r => r.review },
    { key: 'spell', label: '스펠링 실수', test: r => r.review && r.kind === 'spell' },
    { key: 'struct', label: '구조 실수', test: r => r.review && r.kind === 'struct' },
    { key: 'recent', label: '최근 맞힌 것', test: r => r.review && r.last === 'right' },
  ];

  // ── 섞기: 비슷한 문장(grp 같은 것)끼리 멀리 떨어뜨린다 ──
  function rand(rng) { return (rng || Math.random)(); }

  function shuffleArr(a, rng) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(rng) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function spacedShuffle(recs, rng) {
    const groups = new Map();
    recs.forEach(r => { const g = r.grp || ('solo:' + r.id); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
    const keyed = [];
    groups.forEach(list => {
      const k = list.length, off = rand(rng) / k;
      shuffleArr(list, rng).forEach((r, j) => keyed.push({ r, key: off + j / k + (rand(rng) - 0.5) * 0.2 / k }));
    });
    keyed.sort((a, b) => a.key - b.key);
    const out = keyed.map(x => x.r);
    // 그래도 바로 옆에 같은 묶음이 오면 뒤쪽 문장과 자리를 바꾼다
    const g = r => r.grp || ('solo:' + r.id);
    for (let i = 1; i < out.length; i++) {
      if (g(out[i]) !== g(out[i - 1])) continue;
      for (let j = i + 1; j < out.length; j++) {
        if (g(out[j]) !== g(out[i - 1]) && (j + 1 >= out.length || g(out[j + 1]) !== g(out[i])) && (g(out[j - 1]) !== g(out[i]))) {
          [out[i], out[j]] = [out[j], out[i]]; break;
        }
      }
    }
    return out;
  }

  function ordered(recs, shuffle, rng) {
    return shuffle ? spacedShuffle(recs, rng) : recs.slice().sort((a, b) => a.order - b.order);
  }

  /**
   * 한 바퀴 만들기. 탭마다 '아직 안 본 문장 줄(rem)'과 '이번 순환에서 본 문장(seen)'을 기억한다.
   * - 다음 바퀴는 줄에서 이어서 꺼내므로 앞에서 본 문장이 다시 나오지 않는다.
   * - 줄을 다 쓰면 새로 섞되, 방금 본 문장은 새 줄의 맨 뒤로 보낸다.
   * - 새로 추가된 문장은 남은 줄 사이사이에 끼워 넣는다.
   * @returns {{ids, queue, base, total}}
   */
  function buildRound(pool, queue, n, shuffle, rng, recent) {
    const byId = new Map(pool.map(r => [r.id, r]));
    const total = pool.length;
    if (!total) return { ids: [], queue: { rem: [], seen: [] }, base: 0, total: 0 };
    if (!n || n >= total) n = total;
    let rem = (queue && queue.rem || []).filter(id => byId.has(id));
    let seen = (queue && queue.seen || []).filter(id => byId.has(id));
    const known = new Set(rem.concat(seen));
    const fresh = pool.filter(r => !known.has(r.id));
    if (fresh.length) {
      if (shuffle) {
        ordered(fresh, true, rng).forEach(r => rem.splice(Math.floor(rand(rng) * (rem.length + 1)), 0, r.id));
      } else {
        rem = rem.concat(fresh.map(r => r.id)).sort((a, b) => byId.get(a).order - byId.get(b).order);
      }
    }
    const newCycle = avoid => {
      const av = new Set(avoid || []);
      const front = ordered(pool.filter(r => !av.has(r.id)), shuffle, rng).map(r => r.id);
      const back = ordered(pool.filter(r => av.has(r.id)), shuffle, rng).map(r => r.id);
      return front.concat(back);
    };
    if (!rem.length) { rem = newCycle(recent); seen = []; }
    const base = seen.length;
    let ids = rem.slice(0, n);
    rem = rem.slice(n);
    seen = seen.concat(ids);
    if (ids.length < n) {
      // 줄이 바닥났다: 새 순환을 시작해서 모자란 만큼 채운다 (이번 바퀴 문장은 새 줄의 맨 뒤)
      const next = newCycle(ids);
      const extra = next.filter(id => !ids.includes(id)).slice(0, n - ids.length);
      ids = ids.concat(extra);
      rem = next.filter(id => !extra.includes(id));
      seen = extra;
    }
    return { ids, queue: { rem, seen }, base, total };
  }

  /**
   * 오늘의 연습: 다시 볼 것 4 : 오래 안 본 것 3 : 처음 보는 것 3 비율로 고른다.
   * 최근 6시간 안에 본 문장은 모자랄 때만 쓴다.
   */
  function buildToday(recs, n, now, rng) {
    now = now || Date.now();
    n = Math.min(n || 20, recs.length);
    const recentCut = now - 6 * 3600 * 1000;
    const oldFirst = (a, b) => a.seen - b.seen;
    const review = recs.filter(r => r.review && r.seen < recentCut).sort(oldFirst);
    const fresh = shuffleArr(recs.filter(r => !r.seen), rng);
    const stale = recs.filter(r => !r.review && r.seen && r.seen < recentCut).sort(oldFirst);
    const want = [Math.round(n * 0.4), Math.round(n * 0.3)];
    want.push(n - want[0] - want[1]);
    const lists = [review, stale, fresh];
    const picked = [], used = new Set();
    const take = (list, k) => { for (const r of list) { if (k <= 0) break; if (!used.has(r.id)) { used.add(r.id); picked.push(r); k--; } } };
    lists.forEach((l, i) => take(l, want[i]));
    lists.forEach(l => take(l, n - picked.length));
    take(recs.slice().sort(oldFirst), n - picked.length);   // 그래도 모자라면 최근 것까지
    return spacedShuffle(picked, rng).map(r => r.id);
  }

  // ── 새 문장 분류·묶음 (CSV 불러오기·직접 추가) ──
  const VERBS = {
    take: 'take', takes: 'take', took: 'take', taken: 'take', taking: 'take',
    make: 'make', makes: 'make', made: 'make', making: 'make',
    get: 'get', gets: 'get', got: 'get', gotten: 'get', getting: 'get',
    come: 'come', comes: 'come', came: 'come', coming: 'come',
    break: 'break', breaks: 'break', broke: 'break', breaking: 'break',
    work: 'work', works: 'work', worked: 'work', working: 'work',
    run: 'run', runs: 'run', ran: 'run', running: 'run',
    go: 'go', goes: 'go', went: 'go', going: 'go', put: 'put', puts: 'put', putting: 'put',
    look: 'look', looks: 'look', looked: 'look', looking: 'look',
    turn: 'turn', turns: 'turn', turned: 'turn', turning: 'turn',
    give: 'give', gives: 'give', gave: 'give', given: 'give',
    bring: 'bring', brings: 'bring', brought: 'bring',
    let: 'let', lets: 'let', pick: 'pick', picks: 'pick', picked: 'pick',
  };
  const PARTICLES = ['off', 'out', 'up', 'down', 'in', 'on', 'over', 'through', 'after', 'by', 'behind', 'at',
    'along', 'across', 'away', 'back', 'to', 'apart', 'rid', 'into', 'around'];
  const MAIN_VERBS = ['take', 'get', 'make'];

  const words = en => String(en).toLowerCase().replace(/[’‘]/g, "'").match(/[a-z0-9']+/g) || [];

  function phrasal(en) {
    const w = words(en);
    if (w.includes('takeout')) return 'take out';
    for (let i = 0; i < w.length; i++) {
      const v = VERBS[w[i]];
      if (!v) continue;
      for (let j = i + 1; j < Math.min(i + 7, w.length); j++) {
        if (PARTICLES.includes(w[j])) {
          if (w[j] === 'to' && j !== i + 1) continue;
          return v + ' ' + w[j];
        }
        if (VERBS[w[j]]) break;
      }
      if (v === 'make' && w.slice(i + 1, i + 5).includes('of')) return 'make of';
    }
    return null;
  }

  const STOP = new Set('i you we he she they it a an the to of for on in at by is are was be my our your this that and or but so'.split(' '));
  function similar(a, b) {
    const wa = words(a), wb = words(b);
    if (wa.length >= 3 && wa.slice(0, 3).join(' ') === wb.slice(0, 3).join(' ')) return true;
    const ca = new Set(wa.filter(x => !STOP.has(x))), cb = new Set(wb.filter(x => !STOP.has(x)));
    if (ca.size && cb.size) {
      let inter = 0; ca.forEach(x => { if (cb.has(x)) inter++; });
      if (inter / (ca.size + cb.size - inter) >= 0.5) return true;
    }
    const g4 = w => new Set(w.slice(0, Math.max(0, w.length - 3)).map((_, k) => w.slice(k, k + 4).join(' ')));
    const A = g4(wa); for (const x of g4(wb)) if (A.has(x)) return true;
    return false;
  }

  /** 새 문장의 세부 분류와 묶음 번호를 정한다 (all: 기존 문장들) */
  function classify(rec, all) {
    const out = { sub: rec.sub, grp: rec.grp };
    const same = all.filter(r => r.deck === rec.deck && r.id !== rec.id);
    if (rec.deck === '구동사') {
      const pv = phrasal(rec.en);
      if (!out.sub || out.sub === '미분류') {
        const v = pv ? pv.split(' ')[0] : null;
        out.sub = v && MAIN_VERBS.includes(v) ? v : '기타';
      }
      const hit = pv && same.find(r => phrasal(r.en) === pv);
      if (hit) { out.grp = hit.grp; return out; }
    } else if (!out.sub) out.sub = '미분류';
    const sim = same.find(r => similar(r.en, rec.en));
    out.grp = sim ? sim.grp : all.reduce((m, r) => Math.max(m, r.grp || 0), 0) + 1;
    return out;
  }

  // ── CSV ──
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(x => x.trim())) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell); if (row.some(x => x.trim())) rows.push(row);
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim().toLowerCase());
    const col = n => head.indexOf(n);
    if (col('en') < 0 || col('ko') < 0) throw new Error('CSV 첫 줄에 en, ko 열이 있어야 합니다');
    return rows.slice(1).map(r => ({
      deck: (col('deck') >= 0 ? r[col('deck')] : '').trim() || '업무 회화',
      sub: col('sub') >= 0 ? (r[col('sub')] || '').trim() : '',
      en: (r[col('en')] || '').trim(),
      ko: (r[col('ko')] || '').trim(),
    })).filter(r => r.en && r.ko);
  }

  const enKey = en => words(en).join(' ');

  /** CSV 행들을 기존 문장에 더한다. 영어 문장이 같으면 건너뛴다. */
  function importRows(rows, all) {
    const have = new Set(all.map(r => enKey(r.en)));
    let order = all.reduce((m, r) => Math.max(m, r.order || 0), 0);
    const added = []; let dup = 0;
    const pool = all.slice();
    rows.forEach(row => {
      const k = enKey(row.en);
      if (have.has(k)) { dup++; return; }
      have.add(k);
      const rec = newRecord({ deck: DECKS.includes(row.deck) ? row.deck : row.deck, sub: row.sub || '', en: row.en, ko: row.ko }, ++order);
      Object.assign(rec, classify(rec, pool));
      pool.push(rec); added.push(rec);
    });
    return { added, dup };
  }

  function toCSV(recs) {
    const esc = s => /[",\n\r]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);
    return '﻿deck,sub,en,ko\r\n' + recs.map(r => [r.deck, r.sub, r.en, r.ko].map(esc).join(',')).join('\r\n') + '\r\n';
  }

  const API = { DECKS, FILTERS, newRecord, applyOutcome, setReview, spacedShuffle, buildRound, buildToday,
    phrasal, similar, classify, parseCSV, importRows, toCSV, enKey, shuffleArr };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Logic = API;
})(typeof window !== 'undefined' ? window : globalThis);
