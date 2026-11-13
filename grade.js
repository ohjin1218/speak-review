/* 채점 — 화면과 상관없는 순수 함수만 둔다 (node 테스트에서도 불러 쓴다) */
(function (root) {
  'use strict';

  // ── 축약형 풀기 ──
  const NT = { "can't": ['can', 'not'], "won't": ['will', 'not'], "shan't": ['shall', 'not'], "ain't": ['am', 'not'] };
  const S_IS = new Set(['it', 'he', 'she', 'that', 'what', 'there', 'here', 'where', 'who', 'how', 'everything',
    'nothing', 'something', 'someone', 'everyone', 'this', 'when', 'why']);
  const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
    'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const D_TOKEN = "'d";   // would / had 둘 다 될 수 있음
  const S_TOKEN = "'s";   // is / has 둘 다 될 수 있음

  function expandWord(w) {
    // w: 소문자, 따옴표 통일, 문장부호 제거된 단어 하나
    if (!w) return [];
    if (NT[w]) return NT[w].slice();
    if (w === 'cannot') return ['can', 'not'];
    if (w === "let's") return ['let', 'us'];
    if (/^\d+$/.test(w)) { const n = +w; return [n <= 20 ? NUM[n] : w]; }
    let m;
    if ((m = w.match(/^(.+)n't$/))) return [m[1], 'not'];
    if ((m = w.match(/^(.+)'m$/))) return [m[1], 'am'];
    if ((m = w.match(/^(.+)'re$/))) return [m[1], 'are'];
    if ((m = w.match(/^(.+)'ve$/))) return [m[1], 'have'];
    if ((m = w.match(/^(.+)'ll$/))) return [m[1], 'will'];
    if ((m = w.match(/^(.+)'d$/))) return [m[1], D_TOKEN];
    if ((m = w.match(/^(.+)'s$/)) && S_IS.has(m[1])) return [m[1], S_TOKEN];
    return [w];
  }

  function cleanWord(raw) {
    return raw.toLowerCase()
      .replace(/[‘’ʼ`´]/g, "'")
      .replace(/(\d),(\d)/g, '$1$2')
      .replace(/[^a-z0-9']+/g, '')
      .replace(/^'+|'+$/g, '');
  }

  // 화면에 보일 단어 목록과, 각 단어가 풀린 비교용 토큰들
  function tokenize(text) {
    const words = [];
    const toks = [];
    String(text || '').split(/\s+/).filter(Boolean).forEach(raw => {
      const w = { disp: raw, toks: [] };
      raw.split(/[-–—/&]+/).forEach(part => {
        expandWord(cleanWord(part)).forEach(t => { w.toks.push(toks.length); toks.push({ t, word: words.length }); });
      });
      words.push(w);
    });
    return { words, toks };
  }

  // 원문을 그대로(하이픈 포함) 단어로 나눠 표시용으로 쓴다
  function displayWords(text) {
    return String(text || '').split(/\s+/).filter(Boolean);
  }

  function tokEq(a, b) {
    if (a === b) return true;
    if (a === D_TOKEN) return b === 'would' || b === 'had';
    if (b === D_TOKEN) return a === 'would' || a === 'had';
    if (a === S_TOKEN) return b === 'is' || b === 'has';
    if (b === S_TOKEN) return a === 'is' || a === 'has';
    return false;
  }

  // 철자 거리 (이웃 글자 자리바꿈도 1번으로 센다: teh → the)
  function charDist(a, b) {
    const m = a.length, n = b.length;
    const D = [];
    for (let i = 0; i <= m; i++) { D.push(new Array(n + 1).fill(0)); D[i][0] = i; }
    for (let j = 0; j <= n; j++) D[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) D[i][j] = Math.min(D[i][j], D[i - 2][j - 2] + 1);
    }
    return D[m][n];
  }

  // 단수·복수, 동사 어미만 다른 경우 (log/logs, review/reviewed, make/making)
  const SUF = [['ies', 'y'], ['ied', 'y'], ['ing', ''], ['ing', 'e'], ['ed', ''], ['ed', 'e'], ['es', ''], ['s', ''], ['d', ''], ['er', ''], ['ly', '']];
  function stems(w) {
    const out = new Set([w, w.replace(/e$/, '')]);
    SUF.forEach(([suf, add]) => { if (w.length > suf.length + 1 && w.endsWith(suf)) out.add(w.slice(0, -suf.length) + add); });
    return out;
  }
  function isInflection(a, b) {
    if (a === b) return false;
    const sa = stems(a);
    for (const x of stems(b)) if (sa.has(x)) return true;
    return false;
  }

  function isSpellingPair(typed, right) {
    if (!typed || !right) return false;
    if (typed.includes("'") !== right.includes("'") && typed.replace(/'/g, '') === right.replace(/'/g, '')) return true;
    if (isInflection(typed, right)) return false;
    const d = charDist(typed, right);
    return d <= Math.max(1, right.length / 3);
  }

  // 단어 단위 정렬: 정답(exp) ↔ 내 답(got)
  function align(exp, got) {
    const m = exp.length, n = got.length;
    const C = [];
    for (let i = 0; i <= m; i++) { C.push(new Array(n + 1).fill(0)); C[i][0] = i; }
    for (let j = 0; j <= n; j++) C[0][j] = j;
    const subCost = (a, b) => tokEq(a, b) ? 0 : (isSpellingPair(b, a) ? 0.6 : 1);
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      C[i][j] = Math.min(C[i - 1][j] + 1, C[i][j - 1] + 1, C[i - 1][j - 1] + subCost(exp[i - 1], got[j - 1]));
    }
    const ops = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && C[i][j] === C[i - 1][j - 1] + subCost(exp[i - 1], got[j - 1])) {
        ops.push({ op: tokEq(exp[i - 1], got[j - 1]) ? 'ok' : 'sub', e: i - 1, g: j - 1 }); i--; j--;
      } else if (i > 0 && C[i][j] === C[i - 1][j] + 1) {
        ops.push({ op: 'del', e: i - 1 }); i--;          // 정답에 있는데 안 씀
      } else {
        ops.push({ op: 'ins', g: j - 1 }); j--;          // 정답에 없는데 씀
      }
    }
    return ops.reverse();
  }

  // ── 뜻을 거의 바꾸지 않는 작은 말: 빠뜨리거나 더 쓰거나 서로 바꿔 써도 '통했어요' ──
  const SMALL = new Set(['a', 'an', 'the', 'please', 'just', 'maybe']);
  function isSmallOp(o, et, gt) {
    if (o.op === 'del') return SMALL.has(et[o.e]);                        // 정답에 있는데 안 씀
    if (o.op === 'ins') return SMALL.has(gt[o.g]);                        // 정답에 없는데 씀
    return SMALL.has(et[o.e]) && SMALL.has(gt[o.g]);                      // a ↔ the 처럼 바꿔 씀
  }

  // ── 부탁·질문 머리말: 문장 맨 앞에서는 서로 바꿔 써도 맞는 것으로 본다 ──
  // 같은 줄 안에서만 바꿔 준다 (can ↔ will 처럼 뜻이 달라지는 조합은 넣지 않는다)
  const HEADS = [
    [['can', 'you'], ['could', 'you']],
    [['will', 'you'], ['would', 'you']],
    [['can', 'i'], ['could', 'i'], ['may', 'i']],
    [['can', 'we'], ['could', 'we']],
  ];
  // mind 앞에서는 Do you / Would you 만 서로 바꿔 쓴다 ('will you mind' 는 쓰지 않는 말)
  const MIND_HEADS = [['do', 'you'], ['would', 'you']];
  // 뒤에 오는 말에 따라 뜻이 달라지는 것은 건드리지 않는다 (Would you like …)
  const HEAD_STOP = new Set(['like']);

  /** 정답과 같은 뜻으로 인정할 문장들 (머리말만 바꾼 것) */
  function headVariants(answer) {
    const T = tokenize(answer);
    const toks = T.toks.map(x => x.t);
    if (toks.length < 3 || HEAD_STOP.has(toks[2])) return [];
    // 앞 두 단어가 각각 토큰 하나일 때만 (축약형이 끼면 건너뛴다)
    if (T.words.length < 3 || T.toks[0].word !== 0 || T.toks[1].word !== 1) return [];
    const mind = toks[2] === 'mind';
    const grp = (mind ? [MIND_HEADS] : HEADS).find(g => g.some(h => h[0] === toks[0] && h[1] === toks[1]));
    if (!grp) return [];
    const rest = T.words.slice(2).map(w => w.disp).join(' ');
    const out = grp
      .filter(h => !(h[0] === toks[0] && h[1] === toks[1]))
      .map(h => h[0] + ' ' + h[1] + ' ' + rest);
    // Do you mind if … / Would you mind if … 는 머리말 없이 Mind if … 로도 쓴다
    if (mind) out.push(rest);
    return out;
  }

  /** 머리말 없는 'Mind if …' 에는 'Do you mind if …' 와 'Would you mind if …' 도 인정 */
  function bareMindVariants(answer) {
    const T = tokenize(answer);
    const toks = T.toks.map(x => x.t);
    if (toks[0] !== 'mind' || toks[1] !== 'if' || T.toks[0].word !== 0) return [];
    const rest = T.words.map(w => w.disp).join(' ');
    return ['do you ' + rest, 'would you ' + rest];
  }

  // ── 같은 뜻으로 쓰는 표현: 바꿔 써도 '통했어요' (원래 문장은 화면에 보여준다) ──
  // 뜻이 갈리는 자리는 일부러 뺐다 (made off with = 훔쳐 가다 ≠ made away with = 없애다)
  const OFF_PAIR = { take: 'get', takes: 'gets', took: 'got', taking: 'getting',
    get: 'take', gets: 'takes', got: 'took', getting: 'taking' };
  const THRU_PAIR = { walk: 'take', walks: 'takes', walked: 'took', walking: 'taking',
    take: 'walk', takes: 'walks', took: 'walked', taking: 'walking' };
  const MAKE = /^(make|makes|made|making)$/;
  const TIME_W = /^(day|days|week|weeks|month|months|monday|tuesday|wednesday|thursday|friday|saturday|sunday|time|pto|morning|afternoon|hour|hours)$/;

  // 통째로 바꿔 써도 뜻이 통하는 말 (앞에 쓴 쪽이 원래 문장에 있을 때 뒤의 것도 인정)
  // '~하는 게 좋겠어(should)' 는 뜻이 다르므로 need/have 와 묶지 않는다
  const PHRASES = [
    ["I'd like to", 'I want to'],
    ['need to', 'have to'],
    ["I'll", "I'm going to"],
  ];

  function nearVariants(answer) {
    const W = displayWords(answer);
    const low = W.map(cleanWord);
    const out = [];
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]");
    PHRASES.forEach(([a, b]) => {
      [[a, b], [b, a]].forEach(([from, to]) => {
        const re = new RegExp('\\b' + esc(from) + '\\b', 'i');
        if (re.test(answer)) out.push({ text: answer.replace(re, m => /^[A-Z]/.test(m) ? to : to[0].toLowerCase() + to.slice(1)), right: from, wrong: to });
      });
    });
    const swap = (i, to, right) => {
      const v = W.slice();
      v[i] = W[i].replace(/^[A-Za-z']+/, m => /^[A-Z]/.test(m) ? to[0].toUpperCase() + to.slice(1) : to);
      out.push({ text: v.join(' '), right, wrong: to });
    };
    for (let i = 0; i < low.length; i++) {
      const w = low[i];
      // 휴가: take the day off ↔ get the day off (사이에 시간을 나타내는 말이 있을 때만)
      if (OFF_PAIR[w]) {
        for (let j = i + 1; j <= Math.min(i + 5, low.length - 1); j++) {
          if (low[j] === 'off') {
            if (low.slice(i + 1, j).some(x => TIME_W.test(x))) swap(i, OFF_PAIR[w], w);
            break;
          }
        }
      }
      // 차근차근 설명하다: walk me through ↔ take me through
      if (THRU_PAIR[w] && low.slice(i + 1, i + 4).indexOf('through') >= 0) swap(i, THRU_PAIR[w], w);
      // 도망가다: made away ↔ made off (뒤에 with/of 가 붙으면 뜻이 달라지므로 제외)
      if (MAKE.test(w) && (low[i + 1] === 'away' || low[i + 1] === 'off') &&
          low[i + 2] !== 'with' && low[i + 2] !== 'of') {
        swap(i + 1, low[i + 1] === 'away' ? 'off' : 'away', low[i + 1]);
      }
    }
    return out;
  }

  /**
   * 채점
   * @param {string} input   내 답
   * @param {string} answer  정답 (영어)
   * @param {string[]} alts  같이 인정하는 다른 정답들
   * @returns {{correct, kind, spell, userMarks, answerMarks, matched}}
   *   kind: null | 'spell' | 'struct'
   *   spell: [{wrong, right}]
   *   userMarks / answerMarks: 표시용 단어별 표시 (true = 취소선 / 주황 배경)
   */
  function grade(input, answer, alts) {
    const cands = [answer].concat(headVariants(answer), bareMindVariants(answer), alts || []).filter(Boolean);
    let best = null;
    for (const c of cands) {
      const r = gradeOne(input, c);
      r.matched = c;
      if (r.correct) return r;
      if (!best || r.cost < best.cost) best = r;
    }
    // 다른 정답보다 원래 정답과 비교한 결과를 보여주는 게 자연스럽다 (차이가 크지 않으면)
    const main = gradeOne(input, answer); main.matched = answer;
    const res = main.cost <= best.cost + 0.5 ? main : best;
    // 같은 뜻으로 쓰는 다른 표현을 썼으면 '통했어요'
    if (!res.correct && res.kind !== 'minor') {
      const near = nearVariants(answer).find(v => gradeOne(input, v.text).correct);
      if (near) {
        main.kind = 'minor';
        main.minor = [{ op: 'sub', word: near.right, typed: near.wrong }];
        return main;
      }
    }
    return res;
  }

  function gradeOne(input, answer) {
    const E = tokenize(answer), G = tokenize(input);
    const et = E.toks.map(x => x.t), gt = G.toks.map(x => x.t);
    const ops = align(et, gt);
    const userMarks = G.words.map(() => false), answerMarks = E.words.map(() => false);
    let cost = 0;
    const bad = ops.filter(o => o.op !== 'ok');
    bad.forEach(o => {
      cost += 1;
      if (o.e !== undefined) answerMarks[E.toks[o.e].word] = true;
      if (o.g !== undefined) userMarks[G.toks[o.g].word] = true;
    });
    const pair = o => ({ wrong: cleanWord(G.words[G.toks[o.g].word].disp), right: cleanWord(E.words[E.toks[o.e].word].disp) });
    const res = { correct: bad.length === 0 && gt.length > 0, kind: null, spell: [], userMarks, answerMarks, cost,
      // 사용자가 직접 '스펠링'으로 바꿀 때 쓸, 바뀐 단어 쌍 전부
      subs: bad.filter(o => o.op === 'sub').map(pair),
      answerWords: E.words.map(w => w.disp), userWords: G.words.map(w => w.disp) };
    if (res.correct) return res;
    if (gt.length === 0) { res.kind = 'struct'; return res; }

    // 띄어쓰기만 다른 경우 (every day / everyday) → 스펠링
    const joinE = et.join(''), joinG = gt.join('');
    if (joinE === joinG) {
      res.kind = 'spell';
      res.spell = mergePairs(bad, E, G);
      return res;
    }
    // 관사·군더더기 말만 다르면 '통했어요' (뜻은 통한다)
    res.minor = bad.filter(o => isSmallOp(o, et, gt)).map(o => ({
      op: o.op,                                       // del = 빠뜨림, ins = 더 씀, sub = 바꿔 씀
      word: o.op === 'ins' ? gt[o.g] : et[o.e],       // 정답 쪽 말 (ins 면 내가 더 쓴 말)
      typed: o.op === 'sub' ? gt[o.g] : null,         // 바꿔 쓴 경우 내가 쓴 말
    }));
    const rest = bad.filter(o => !isSmallOp(o, et, gt));
    if (!rest.length) { res.kind = 'minor'; return res; }
    // 오타와 관사가 같이 틀렸으면 오타 쪽이 더 중요한 신호다 → 스펠링
    const allSpell = rest.every(o => o.op === 'sub' && isSpellingPair(gt[o.g], et[o.e]));
    res.kind = allSpell ? 'spell' : 'struct';
    res.spell = rest.filter(o => o.op === 'sub' && isSpellingPair(gt[o.g], et[o.e])).map(pair);
    return res;
  }

  function mergePairs(bad, E, G) {
    const wrong = [...new Set(bad.filter(o => o.g !== undefined).map(o => G.toks[o.g].word))].map(i => cleanWord(G.words[i].disp));
    const right = [...new Set(bad.filter(o => o.e !== undefined).map(o => E.toks[o.e].word))].map(i => cleanWord(E.words[i].disp));
    return wrong.length && right.length ? [{ wrong: wrong.join(' '), right: right.join(' ') }] : [];
  }

  // 힌트: 1단계 = 단어 첫 글자만, 2단계 = 앞쪽 절반 공개
  function hint(answer, level) {
    const words = displayWords(answer);
    const mask = w => {
      let seen = false, afterApos = false;
      return w.replace(/[A-Za-z0-9'’]/g, ch => {
        if (ch === "'" || ch === '’') { afterApos = true; return ch; }
        if (!seen) { seen = true; return ch; }
        return afterApos ? ch : '_';
      });
    };
    if (level <= 1) return words.map(mask).join(' ');
    const half = Math.ceil(words.length / 2);
    return words.map((w, i) => i < half ? w : mask(w)).join(' ');
  }

  // 같은 답인지 (중복 확인·다른 정답 저장용)
  function sameText(a, b) {
    const x = tokenize(a).toks.map(t => t.t), y = tokenize(b).toks.map(t => t.t);
    return x.length === y.length && x.every((t, i) => tokEq(t, y[i]));
  }

  const API = { grade, hint, tokenize, sameText, isSpellingPair, isInflection, charDist, displayWords, headVariants, nearVariants };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Grade = API;
})(typeof window !== 'undefined' ? window : globalThis);
