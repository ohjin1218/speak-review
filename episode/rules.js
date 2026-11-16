/* 에피소드 검증 규칙 — 숫자만 고치면 된다 */
(function (root) {
  'use strict';
  const RULES = {
    maxSwap: 3,              // 교체 문장: 원래 문장에서 바뀐 단어 최대 개수
    swapKeepRatio: 0.5,      // 교체 문장: 원래 문장 단어 중 이만큼은 그대로 남아야 함
    maxConnectRatio: 0.3,    // 연결 문장 비율 최대 (내 대사 기준)
    connectMaxWords: 14,     // 연결 문장 최대 단어 수 (짧고 쉬운 문장)
    wordsMin: 80,            // 오픽 답변 단어 수: 이보다 적으면 실패
    wordsMax: 170,           //                    이보다 많으면 실패
    wordsTargetMin: 90,      // 목표 범위 (벗어나면 주의만)
    wordsTargetMax: 150,
    lifeMinLines: 4,         // 일상생활 대화: 내 대사 최소 개수
    maxRetries: 2,           // 검증 실패 시 다시 요청 최대 횟수
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = RULES;
  else root.EP_RULES = RULES;
})(typeof window !== 'undefined' ? window : globalThis);
