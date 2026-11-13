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
  kind('I have a lot of work to catch on.', 'I have a lot of work to catch up on.', 'struct');   // 누락
  kind('I have a lot of work to catch up on today.', 'I have a lot of work to catch up on.', 'struct'); // 추가
  kind('I have a lot of job to catch up on.', 'I have a lot of work to catch up on.', 'struct');  // 다른 단어
  kind('', 'We are on track.', 'struct');
  // 관사만 빠지거나 더 들어간 것은 구조 실수가 아니라 '통했어요'
  kind('I have lot of work to catch up on.', 'I have a lot of work to catch up on.', 'minor');
  kind('I have a lot of the work to catch up on.', 'I have a lot of work to catch up on.', 'minor');
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

test('부탁 머리말은 바꿔 써도 정답', () => {
  ok('Could you expand on that?', 'Can you expand on that?');
  ok('Can you expand on that?', 'Could you expand on that?');
  ok('May I ask a quick question?', 'Can I ask a quick question?');
  ok('Would you mind sending it again?', 'Do you mind sending it again?');
  ok('Could we move the meeting to Friday?', 'Can we move the meeting to Friday?');
  // 뒷부분이 틀리면 머리말을 바꿔도 여전히 틀린다
  assert.equal(G.grade('Could you expand on this?', 'Can you expand on that?').correct, false);
  // 뜻이 달라지는 조합은 인정하지 않는다
  assert.equal(G.grade('Will you expand on that?', 'Can you expand on that?').correct, false);
  assert.equal(G.grade('Could you like some coffee?', 'Would you like some coffee?').correct, false);
  assert.equal(G.grade('Would you send it again?', 'Do you send it again?').correct, false);
  // 문장 가운데의 can 은 그대로 (뜻이 달라진다)
  assert.equal(G.grade('I could do it today.', 'I can do it today.').correct, false);
});

test('관사·군더더기 말만 다르면 통했어요', () => {
  kind('Can you send me report by Friday?', 'Can you send me the report by Friday?', 'minor');
  kind('Can you send me a report by Friday?', 'Can you send me the report by Friday?', 'minor');
  kind('Can you send me the report by Friday?', 'Can you send me report by Friday?', 'minor');
  kind('Could you please share the agenda?', 'Could you share the agenda?', 'minor');
  kind('I just need a minute.', 'I need a minute.', 'minor');
  // 빠뜨린 말이 무엇인지 알려준다
  assert.deepEqual(kind('Can you share agenda?', 'Can you share the agenda?', 'minor').minor,
    [{ op: 'del', word: 'the', typed: null }]);
  // 오타가 같이 있으면 오타 쪽이 더 중요하므로 스펠링
  kind('Can you send me teh report by Friday?', 'Can you send me the report by Friday?', 'spell');
  // 뜻이 달라지는 말은 그대로 구조 실수
  kind('Can you send me my report by Friday?', 'Can you send me the report by Friday?', 'struct');
});

test('같은 뜻으로 쓰는 표현은 통했어요', () => {
  // 휴가: take ~ off ↔ get ~ off (사이에 시간을 나타내는 말이 있을 때만)
  kind('I wish I could take some time off next week.', 'I wish I could get some time off next week.', 'minor');
  kind('He took Wednesday off to take care of his kids.', 'He got Wednesday off to take care of his kids.', 'minor');
  // 도망가다: made away ↔ made off
  kind('The robbers made off after the police arrived.', 'The robbers made away after the police arrived.', 'minor');
  // 차근차근 설명하다: walk ~ through ↔ take ~ through
  kind('Could you take me through the program?', 'Could you walk me through the program?', 'minor');
  kind('Can you walk us through the sales figures?', 'Can you take us through the sales figures?', 'minor');

  // 뜻이 달라지는 자리는 그대로 틀린다
  kind('I hope my new book gets off.', 'I hope my new book takes off.', 'struct');            // 성공하다
  kind('The robber took off without jail time.', 'The robber got off without jail time.', 'struct');  // 처벌을 면하다
  kind('The company decided to make off with free coffee.', 'The company decided to make away with free coffee.', 'struct');  // 없애다
  kind('The bank robbers made away with a lot of money.', 'The bank robbers made off with a lot of money.', 'struct');
});

test('통째로 바꿔 써도 뜻이 통하는 말', () => {
  kind("I want to take a week off.", "I'd like to take a week off.", 'minor');
  kind("I'd like to take a week off.", 'I want to take a week off.', 'minor');
  kind('We have to get rid of some furniture.', 'We need to get rid of some furniture.', 'minor');
  kind("I'm going to get started.", "I'll get started.", 'minor');
  kind("I'll get started.", "I'm going to get started.", 'minor');
  // should 는 '~하는 게 좋겠어' 라 뜻이 다르다
  kind('We should get rid of the broken chair.', 'We need to get rid of the broken chair.', 'struct');
});

test('Mind if 는 머리말을 붙이든 빼든 정답', () => {
  ok('Mind if we push the meeting to Monday?', 'Would you mind if we push the meeting to Monday?');
  ok('Do you mind if we push the meeting to Monday?', 'Would you mind if we push the meeting to Monday?');
  ok('Would you mind if I jump in?', 'Mind if I jump in?');
  ok('Do you mind if I jump in?', 'Mind if I jump in?');
  // 'will you mind' 는 쓰지 않는 말이라 인정하지 않는다
  assert.equal(G.grade('Will you mind if we push the meeting to Monday?', 'Would you mind if we push the meeting to Monday?').correct, false);
  // make up one's mind 는 건드리지 않는다
  assert.equal(G.grade('Do you made up your mind about what to do?', 'Have you made up your mind about what to do?').correct, false);
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
