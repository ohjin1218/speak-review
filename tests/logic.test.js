// 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

// 재현 가능한 난수
function seeded(s) { return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }

function makePool(n, groupSize) {
  return Array.from({ length: n }, (_, i) => L.newRecord({ id: 's' + i, en: 'e' + i, ko: 'k' + i, grp: Math.floor(i / groupSize) + 1 }, i));
}

test('기록: 틀리면 다시 볼 것에 들어가고, 맞혀도 빠지지 않는다', () => {
  let r = L.newRecord({ id: 'a', en: 'x', ko: 'y' });
  r = L.applyOutcome(r, 'spell', { spell: [{ wrong: 'foward', right: 'forward' }] });
  assert.equal(r.review, true); assert.equal(r.kind, 'spell'); assert.equal(r.wrong, 1);
  assert.deepEqual(r.spell, [{ wrong: 'foward', right: 'forward' }]);
  r = L.applyOutcome(r, 'right');
  assert.equal(r.review, true); assert.equal(r.last, 'right'); assert.equal(r.right, 1);
  assert.equal(r.kind, 'spell');                           // 마지막으로 틀렸을 때 분류 유지
  assert.equal(r.spell.length, 1);
});

test('기록: 구조 실수로 바뀌거나 목록에서 빼면 철자 기록이 지워진다', () => {
  let r = L.applyOutcome(L.newRecord({ id: 'a' }), 'spell', { spell: [{ wrong: 'a', right: 'b' }] });
  assert.equal(L.applyOutcome(r, 'struct').spell.length, 0);
  assert.equal(L.setReview(r, false).spell.length, 0);
  assert.equal(L.setReview(r, false).review, false);
});

test('기록: 분류 버튼을 바꿔 눌러도 채점 전 기록에서 다시 계산한다', () => {
  const pre = L.newRecord({ id: 'a' });
  const auto = L.applyOutcome(pre, 'spell', { spell: [{ wrong: 'a', right: 'b' }] });
  const skip = L.applyOutcome(pre, 'skip');
  assert.equal(auto.wrong, 1); assert.equal(skip.wrong, 1);
  assert.equal(skip.review, false);                      // 넣지 않기
  const alt = L.applyOutcome(pre, 'alt', { alt: 'Other way' });
  assert.equal(alt.wrong, 0); assert.equal(alt.right, 1); assert.deepEqual(alt.alts, ['Other way']);
  assert.equal(pre.wrong, 0);                            // 원본은 그대로
});

test('섞기: 같은 묶음 문장이 바로 붙어 나오지 않는다', () => {
  const pool = makePool(60, 4);                          // 4개씩 15묶음
  for (let s = 1; s < 30; s++) {
    const out = L.spacedShuffle(pool, seeded(s));
    assert.equal(out.length, 60);
    assert.equal(new Set(out.map(r => r.id)).size, 60);
    for (let i = 1; i < out.length; i++) assert.notEqual(out[i].grp, out[i - 1].grp, `seed ${s} 위치 ${i}`);
  }
});

test('한 바퀴: 다음 바퀴에 앞에서 본 문장이 다시 나오지 않는다', () => {
  const pool = makePool(50, 3);
  let q = null; const seen = new Set(); const rng = seeded(7);
  for (let round = 0; round < 5; round++) {             // 10개씩 5바퀴 = 50개 전부
    const r = L.buildRound(pool, q, 10, true, rng);
    assert.equal(r.ids.length, 10);
    r.ids.forEach(id => { assert.equal(seen.has(id), false, `${id} 중복`); seen.add(id); });
    q = r.queue;
  }
  assert.equal(seen.size, 50);
  // 다 보고 나면 새로 섞되, 방금 본 10개는 맨 앞에 오지 않는다
  const last = L.buildRound(pool, q, 10, true, rng, ['s0']);
  assert.equal(last.ids.length, 10);
});

test('한 바퀴: 줄이 바닥나면 새 순환으로 채우되 같은 바퀴 안에서는 중복이 없다', () => {
  const pool = makePool(25, 2);
  const rng = seeded(3);
  let r = L.buildRound(pool, null, 20, true, rng);
  r = L.buildRound(pool, r.queue, 20, true, rng);       // 남은 5개 + 새 순환 15개
  assert.equal(r.ids.length, 20);
  assert.equal(new Set(r.ids).size, 20);
  // 새 순환에서 이미 꺼낸 15개를 빼면 10개가 남아야 한다 (앞의 5개 포함)
  assert.equal(r.queue.rem.length, 10);
});

test('한 바퀴: 새로 추가된 문장은 남은 줄에 들어간다', () => {
  const pool = makePool(20, 1);
  const rng = seeded(5);
  const r1 = L.buildRound(pool, null, 10, true, rng);
  const bigger = pool.concat([L.newRecord({ id: 'new1', grp: 999 }, 99)]);
  const r2 = L.buildRound(bigger, r1.queue, 11, true, rng);
  assert.ok(r2.ids.includes('new1'));
  r2.ids.forEach(id => assert.ok(!r1.ids.includes(id)));
});

test('한 바퀴: 섞기를 끄면 원래 순서대로', () => {
  const pool = makePool(10, 1);
  const r = L.buildRound(pool, null, 5, false);
  assert.deepEqual(r.ids, ['s0', 's1', 's2', 's3', 's4']);
  const r2 = L.buildRound(pool, r.queue, 5, false);
  assert.deepEqual(r2.ids, ['s5', 's6', 's7', 's8', 's9']);
});

test('오늘의 연습: 다시 볼 것·오래 안 본 것·처음 보는 것을 섞는다', () => {
  const now = Date.now(), day = 86400000;
  const pool = makePool(100, 1);
  pool.slice(0, 30).forEach((r, i) => { r.review = true; r.seen = now - (i + 1) * day; });
  pool.slice(30, 60).forEach((r, i) => { r.seen = now - (i + 1) * day; });
  pool[0].seen = now - 1000;                             // 방금 본 다시 볼 것은 빼야 한다
  const ids = L.buildToday(pool, 20, now, seeded(9));
  assert.equal(ids.length, 20);
  const pick = ids.map(id => pool.find(r => r.id === id));
  assert.equal(pick.filter(r => r.review).length, 8);
  assert.equal(pick.filter(r => !r.seen).length, 6);
  assert.ok(!ids.includes('s0'));
  assert.ok(ids.includes('s29'));                        // 가장 오래 안 본 다시 볼 것
});

test('CSV: 따옴표·쉼표·BOM을 처리하고 중복은 건너뛴다', () => {
  const csv = '﻿deck,en,ko\r\n업무 회화,"Sorry, I have other priorities.","죄송합니다, 다른 우선순위가 있어요."\r\n구동사,I want to take a week off.,일주일 쉬고 싶어.\r\n';
  const rows = L.parseCSV(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].en, 'Sorry, I have other priorities.');
  const existing = [L.newRecord({ id: 'x', deck: '업무 회화', en: 'sorry I have other priorities', grp: 1 }, 1)];
  const res = L.importRows(rows, existing);
  assert.equal(res.added.length, 1); assert.equal(res.dup, 1);
  assert.equal(res.added[0].sub, 'take');
});

test('구동사 인식', () => {
  assert.equal(L.phrasal('I want to take a week off.'), 'take off');
  assert.equal(L.phrasal('It took me hours to take in the sights.'), 'take in');
  assert.equal(L.phrasal('Jack took to hiking.'), 'take to');
  assert.equal(L.phrasal("I don't know what to make of his decision."), 'make of');
  assert.equal(L.phrasal('I wish I could get a couple of days off.'), 'get off');
});
