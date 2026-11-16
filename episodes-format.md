# episodes.json 형식 (채팅 → 오픽 에피소드 앱)

채팅에서 에피소드를 만들거나 고치면 이 형식의 JSON 하나로 넘긴다.
앱은 받은 내용을 저장 문장 목록과 대조해 검증하고, "이전 / 변경안"을 보여준 뒤 승인받아 저장한다.

## 전체 모양

```json
{
  "format": "speak-episodes/1",
  "episodes": [
    {
      "id": "ep-rp-news",
      "topic": "동료에게 소식 전하기",
      "kind": "roleplay",
      "question": { "en": "Your manager asked you to pass along some news to a coworker. Call your coworker and give them the message.", "ko": "매니저가 동료에게 소식을 전해 달라고 했습니다. 동료에게 전화해서 메시지를 전하세요." },
      "note": "Sally, John 문장 넣고 연결 문장 2개 뺌",
      "lines": [
        { "en": "Hi Mike, it's Jinwoo.", "ko": "안녕하세요 Mike, 진우예요.", "type": "연결" },
        { "en": "Kelly told me to tell you to come in early tomorrow.", "ko": "Kelly가 저한테 내일 일찍 출근하시라고 전해달래요.", "type": "원문", "src": "Kelly told me to tell you to come in early tomorrow." },
        { "en": "Have you heard Tom is getting promoted?", "ko": "Tom이 승진한다는 소식 들으셨어요?", "type": "교체", "src": "Have you heard Audrey is getting promoted?" }
      ]
    }
  ]
}
```

## 필드

| 필드 | 내용 |
|---|---|
| `id` | **기존 에피소드를 고칠 때는 반드시 같은 id.** 새 에피소드는 비워 두거나 `ep-` 로 시작하는 새 이름 |
| `topic` | 주제 이름. 앱의 주제 목록 이름 그대로 (예: 자기소개, 날씨와 계절, 병원 예약) |
| `kind` | `opic` 오픽 질문 · `roleplay` 롤플레이 · `life` 일상생활 대화 · `set` 문장 모음 |
| `question` | 오픽 질문 영어·한국어. `life` 는 없음 |
| `situation` | `life` 만: 상황 설명 (한국어) |
| `note` | 무엇을 바꿨는지 한 줄 (고친 기록에 남음) |
| `lines` | 문장 목록. 한 줄에 한 문장 |

**lines 한 줄**

| 필드 | 내용 |
|---|---|
| `en` | 영어 문장 하나 |
| `ko` | 그 문장의 한국어 해석 (문장마다 따로) |
| `type` | `원문` · `교체` · `연결` |
| `src` | 원문·교체일 때 **출처 저장 문장의 영어 원문을 CSV 그대로**. 연결은 빈칸 |
| `speaker` | `life` 의 상대방 대사만 `"other"`. 내 대사는 생략 |
| `tag` | `set` 에서만: 쓰는 자리 (시작, 마무리 등) |

## 앱이 검사하는 규칙 (어기면 승인 버튼이 막힘)

1. **원문**: `en` 이 `src` 와 글자 그대로 같다 (대소문자·문장부호 차이는 괜찮음)
2. **교체**: `src` 에서 단어 **3개 이하**만 바뀜. 원래 문장 단어의 절반 이상은 그대로. 덧붙인 단어도 바뀐 단어로 센다
   - 예: Kelly → Bob, tomorrow → on Monday = 3개 (통과)
   - 예: 앞에 "To be honest," + 뒤에 "these days" = 5개 (실패 → 연결이 됨)
3. **연결**: 내 문장 수의 **30% 이하**
4. **오픽·롤플레이 답변 길이**: 80~170단어 (목표 90~150)
5. `life`: 상황 설명이 있고 내 대사 4개 이상

앱은 유형을 스스로 다시 판정한다. 연결이라고 적었어도 저장 문장과 같으면 원문으로 바꾸고,
교체 단어가 너무 많으면 그 문장을 빨갛게 표시한 뒤 **"고쳐 달라는 글"** 을 만들어 준다. 그 글을 채팅에 붙여 넣으면 된다.

## 쓰는 요령

* 문장 **일부만** 저장 문장인 경우(예: "My boss **was not happy with** it")는 앱에서 연결로 잡힌다.
  저장 문장은 되도록 **문장 하나를 통째로** 쓰고, 앞뒤 말은 짧은 연결 문장으로 따로 뺀다.
* 보강할 때는 **에피소드 전체**를 다시 보낸다 (바뀐 줄만 보내지 않는다).
* 여러 에피소드를 한 번에 보내도 된다. 앱이 하나씩 승인받는다.
* 지금 앱에 있는 상태가 필요하면 앱의 가져오기 → "지금 에피소드 전체 복사" 결과를 채팅에 붙여 넣는다.

## 지금 있는 에피소드 id (2026-11-16)

| id | 주제 |
|---|---|
| ep-intro | 자기소개 |
| ep-home | 사는 곳 |
| ep-day | 직장과 하루 일과 |
| ep-problem | 프로젝트 경험 (문제 해결) |
| ep-meeting | 회의 |
| ep-gym | 운동(헬스, 골프) |
| ep-trip | 여행(국내·해외) |
| ep-rp-gym | 질문 3~4개 하기 (헬스장) |
| ep-rp-dinner | 문제 설명하고 대안 제시 (저녁 약속) |
| ep-rp-coworker | 질문 3~4개 하기 (오랜만에 만난 동료) |
| ep-rp-news | 동료에게 소식 전하기 |
| ep-anywhere | 어디에나 쓰는 문장 (`set`) |
