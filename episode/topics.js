/* 기본 주제 목록. 앱 설정에서 추가·삭제한 것은 기기에 따로 저장된다.
   kind: opic(오픽 질문) · roleplay(롤플레이 질문) · life(일상생활 대화: 상황 설명 + 상대 대사) */
(function (root) {
  'use strict';
  const g = (group, kind, names) => names.map(name => ({ name, group, kind }));
  const TOPICS = [].concat(
    g('설문', 'opic', ['자기소개', '사는 곳', '직장과 하루 일과', '회의', '프로젝트 경험', '운동(헬스, 골프)', '여행(국내·해외)']),
    g('돌발', 'opic', ['날씨와 계절', '명절과 휴일', '교통과 출퇴근', '인터넷과 기술', '휴대폰', '은행', '재활용', '가구와 가전',
      '음식점과 음식', '건강과 병원', '약속과 모임', '쇼핑', '이웃', '지역 축제', '패션', '호텔']),
    g('롤플레이', 'roleplay', ['질문 3~4개 하기', '문제 설명하고 대안 제시', '경험 이야기하기', '동료에게 소식 전하기']),
    g('비교', 'opic', ['과거와 현재 비교', '한국과 미국 비교']),
    g('일상생활', 'life', ['동료와 스몰토크', '회의 시작과 마무리', '일정 잡기와 미루기', '아이 학교 선생님과 대화', '병원 예약',
      '차량 정비소', '마트와 반품', '관리 사무소에 수리 요청', '이웃과 인사']),
    g('기타', 'opic', ['어디에나 쓰는 문장'])
  );
  const GROUPS = ['설문', '돌발', '롤플레이', '비교', '일상생활', '기타'];
  const API = { TOPICS, GROUPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.EP_TOPICS = API;
})(typeof window !== 'undefined' ? window : globalThis);
