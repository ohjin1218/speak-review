// 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../episode/ep-core.js');

const SENT = [
  { en: 'Kelly told me to tell you to come in early tomorrow.', ko: 'Kelly가 저한테 내일 일찍 출근하시라고 전해달래요.' },
  { en: 'I have a lot on my plate.', ko: '할 일이 많아요.' },
  { en: "I'm slowly getting the hang of it.", ko: '조금씩 감을 잡고 있어요.' },
  { en: 'We need to get rid of some furniture.', ko: '가구를 좀 치워야 해요.' },
];
const idx = E.buildIndex(SENT);

test('id 는 대소문자·문장부호·따옴표 모양과 상관없이 같다', () => {
  assert.equal(E.sid("I'm slowly getting the hang of it."), E.sid('i’m slowly getting the hang of it'));
  assert.notEqual(E.sid('I have a lot on my plate.'), E.sid('I have a lot on your plate.'));
});

test('교체 단어 수: 사람 이름 + 시간 바꾸기 = 3개', () => {
  const d = E.diff(E.words(SENT[0].en), E.words('Bob told me to tell you to come in early on Monday.'));
  assert.equal(d.changed, 3);
  assert.deepEqual(d.swapped, [{ from: 'kelly', to: 'bob' }, { from: 'tomorrow', to: 'on monday' }]);
});

test('같은 문장은 원문, 몇 단어 다르면 교체, 많이 다르면 연결', () => {
  assert.equal(E.findBest('I have a lot on my plate!', idx).type, '원문');
  const r = E.findBest('We need to get rid of some old chairs.', idx);
  assert.equal(r.type, '교체');
  assert.equal(r.d.changed, 2);
  assert.equal(E.findBest('The weather was great last weekend.', idx), null);
});

function ep(lines, extra) {
  return E.normalizeEpisode(Object.assign({ topic: '자기소개', question: { en: 'Tell me about yourself.', ko: '' }, lines }, extra));
}
const pad = n => Array.from({ length: n }, () => ({ en: "I have a lot on my plate and I'm slowly getting the hang of it now.", type: '연결' }));

test('교체 단어가 3개를 넘으면 실패', () => {
  const r = E.validate(ep([{ en: 'Brenda asked me to tell you to come in late next Friday morning.', type: '교체', src: SENT[0].en }]), idx);
  assert.ok(r.errors.some(e => e.line === 1 && /바뀐 단어/.test(e.msg)));
});

test('연결 비율 30% 넘으면 실패, 원문 유형은 저장 문장의 한국어를 쓴다', () => {
  const lines = [{ en: 'I have a lot on my plate.', type: '원문', src: 'I have a lot on my plate.' }].concat(pad(1));
  const r = E.validate(ep(lines, { kind: 'set' }), idx);
  assert.equal(r.ep.lines[0].ko, '할 일이 많아요.');
  const r2 = E.validate(ep(lines), idx);
  assert.ok(r2.errors.some(e => /연결 문장이 50%/.test(e.msg)));
});

test('연결이라고 해도 저장 문장과 같으면 원문으로 바로잡는다', () => {
  const r = E.validate(ep([{ en: "I'm slowly getting the hang of it.", type: '연결' }], { kind: 'set' }), idx);
  assert.equal(r.ep.lines[0].type, '원문');
  assert.equal(r.ep.lines[0].src, E.sid(SENT[2].en));
});

test('episodes.json 읽기: 코드 블록·여러 이름 허용', () => {
  const list = E.parseIncoming('여기요\n```json\n{"episodes":[{"topic":"사는 곳","question":"Where do you live?","lines":[{"en":"Hi.","type":"connect"},{"en":"Hello.","speaker":"상대"}]}]}\n```');
  assert.equal(list.length, 1);
  assert.equal(list[0].question.en, 'Where do you live?');
  assert.equal(list[0].lines[0].type, '연결');
  assert.equal(list[0].lines[1].speaker, 'other');
  assert.throws(() => E.parseIncoming('{"topic":"x"'), /JSON/);
});

test('기존 에피소드 찾기: id 또는 주제+질문', () => {
  const old = [{ id: 'a', topic: '자기소개', question: { en: 'Tell me about yourself.' } }];
  assert.equal(E.matchExisting({ id: 'a', topic: 'x' }, old).id, 'a');
  assert.equal(E.matchExisting({ topic: '자기소개', question: { en: 'tell me about yourself' } }, old).id, 'a');
  assert.equal(E.matchExisting({ topic: '자기소개', question: { en: 'Something else?' } }, old), null);
});

test('운전 모드 순서: 한국어 → 멈춤 → 영어 × 반복 → 전체', () => {
  const s = E.driveSteps(ep([{ en: 'I have a lot on my plate.', ko: '할 일이 많아요.' }]), { pause: 3, repeat: 2 });
  assert.deepEqual(s.map(x => x.role), ['q', 'ko', 'try', 'en', 'en', 'full']);
  assert.ok(E.estimateSec(s) > 3);
});
