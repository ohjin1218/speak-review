// 실행: node --test tests
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../grade.js');

const ok = (input, answer, alts) => assert.equal(G.grade(input, answer, alts).correct, true, `${input} ≠ ${answer}`);
const kind = (input, answer, k) => {
  const r = G.grade(input, answer);
  assert.equal(r.correct, false, `${input} 가 정답 처리됨`);
  assert.equal(r.kind, k, `${input} → ${r.kind} (기대: ${k})`);
  return r;
};

test('대소문자·문장부호·따옴표 모양은 무시', () => {
  ok('sorry i have other priorities', 'Sorry, I have other priorities.');
  ok('I’d be happy to help you out', "I'd be happy to help you out.");
  ok('Any thoughts comments or feedback', 'Any thoughts, comments, or feedback?');
  ok("We'll follow up with the punch list by the end of the day!!", "We'll follow up with the punch list by the end of the day.");
});

test('축약형과 풀어 쓴 형태는 같다', () => {
  ok('I would be happy to help you out.', "I'd be happy to help you out.");
  ok('I had been there', "I'd been there");
  ok('I can not take on any more clients.', "I can't take on any more clients.");
  ok('I cannot take on any more clients.', "I can't take on any more clients.");
  ok("I can't take on any more clients.", 'I cannot take on any more clients.');
  ok('We are on track.', "We're on track.");
  ok('It will not happen', "It won't happen");
  ok('Why do not I organize the doc?', "Why don't I organize the doc?");
  ok("I'm running late", 'I am running late');
  ok("It is getting late", "It's getting late");
  ok("Let us get down to business.", "Let's get down to business.");
  ok("I haven't gotten around to it yet.", 'I have not gotten around to it yet.');
});

test('숫자와 하이픈', () => {
  ok('We should be done in about ten minutes.', 'We should be done in about 10 minutes.');
  ok("I'd recommend we go with the long term solution.", "I'd recommend we go with the long-term solution.");
  ok("It's hard to get by on $3000 a month.", "It's hard to get by on $3,000 a month.");
});

test('철자 실수는 스펠링으로 분류하고 틀린 철자를 기록', () => {
  const r = kind('I want to see the inspction log.', 'I want to see the inspection log.', 'spell');
  assert.deepEqual(r.spell, [{ wrong: 'inspction', right: 'inspection' }]);
  const r2 = kind('Please foward the email.', 'Please forward the email.', 'spell');
  assert.deepEqual(r2.spell, [{ wrong: 'foward', right: 'forward' }]);
  kind('Teh project is delayed.', 'The project is delayed.', 'spell');          // 글자 자리바꿈
  kind('I came across an old photo.', 'I came accross an old photo.', 'spell');
  kind('Let me check my calender.', 'Let me check my calendar.', 'spell');
  kind('I can fill you in on the detials.', 'I can fill you in on the details.', 'spell');
});

test('단어 누락·추가·다른 단어는 구조 실수', () => {
  kind('I have lot of work to catch up on.', 'I have a lot of work to catch up on.', 'struct');   // 누락
  kind('I have a lot of the work to catch up on.', 'I have a lot of work to catch up on.', 'struct'); // 추가
  kind('I have a lot of job to catch up on.', 'I have a lot of work to catch up on.', 'struct');  // 다른 단어
  kind('', 'We are on track.', 'struct');
});

test('단수·복수와 동사 어미 차이는 구조 실수', () => {
  kind('Do you mind if I take a closer look at the inspection logs?', 'Do you mind if I take a closer look at the inspection log?', 'struct');
  kind('He take after his grandfather.', 'He takes after his grandfather.', 'struct');
  kind('I review the draft.', 'I reviewed the draft.', 'struct');
  kind('I am work on the report.', 'I am working on the report.', 'struct');
  kind('Commuting to work take up a lot of time.', 'Commuting to work takes up a lot of time.', 'struct');
});

test('철자가 많이 틀리면 구조 실수', () => {
  kind('Please review this prpsl.', 'Please review this proposal.', 'struct'); // 3글자 차이 / 8글자
});

test('채점 결과 표시: 빠뜨린 단어와 틀린 단어 위치', () => {
  const r = G.grade('I have lot of job to catch up', 'I have a lot of work to catch up on.');
  const missing = r.answerWords.filter((_, i) => r.answerMarks[i]);
  const wrong = r.userWords.filter((_, i) => r.userMarks[i]);
  assert.deepEqual(missing, ['a', 'work', 'on.']);
  assert.deepEqual(wrong, ['job']);
});

test('다른 정답도 인정', () => {
  ok('Could you send me the doc ahead of time?', 'Could you review the doc ahead of time?', ['Could you send me the doc ahead of time?']);
  assert.equal(G.grade('Could you send me the doc?', 'Could you review the doc ahead of time?').correct, false);
});

test('띄어쓰기만 다른 경우는 스펠링', () => {
  kind('I check it every day.', 'I check it everyday.', 'spell');
});

test('힌트', () => {
  assert.equal(G.hint("I'd recommend we go with the quicker fix.", 1), "I'd r________ w_ g_ w___ t__ q______ f__.");
  assert.equal(G.hint('We are on track to meet our deadline.', 2), 'We are on track t_ m___ o__ d_______.');
});

test('같은 문장 판정 (중복 확인)', () => {
  assert.equal(G.sameText("I'd be happy to help.", 'I would be happy to help'), true);
  assert.equal(G.sameText('I will help.', 'I can help.'), false);
});
