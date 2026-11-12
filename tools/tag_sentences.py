# 스픽 문장에 세부 분류(sub)와 비슷한 문장 묶음(grp)을 붙인다.
# 입력: data/speak_sentences.csv (deck,en,ko)
# 출력: data/speak_sentences_tagged.csv (deck,sub,grp,en,ko)
import csv, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "speak_sentences.csv"
DST = ROOT / "data" / "speak_sentences_tagged.csv"

# ── 업무 회화: 상황별 분류 (원본 CSV의 행 순서 기준, 0부터) ──
BIZ_RANGES = """
0-3 요청·공유
4-24 도움·분담
25-27 의견·결정
28-38 진행보고
39 도움·분담
40 의견·결정
41 일정
42 회의
43 일정
44 회의
45-47 요청·공유
48 일정
49-50 회의
51-68 일정
69-71 요청·공유
72-75 회의
76-77 자기소개
78 일정
79-85 진행보고
86 일정
87 회의
88 일정
89-92 요청·공유
93-131 진행보고
132-148 의견·결정
149-151 도움·분담
152-155 도움·분담
156-162 요청·공유
163-176 도움·분담
177-184 일정
185-200 요청·공유
201-211 일정
212-218 회의
219-224 일정
225-254 일상·인사
255-257 진행보고
258-262 일상·인사
263-264 진행보고
265-271 요청·공유
272-275 일상·인사
276-278 자기소개
279 회의
280-284 일상·인사
285 요청·공유
286-291 자기소개
292-298 요청·공유
299-302 의견·결정
303-307 진행보고
308-315 요청·공유
316-342 의견·결정
343-351 발표
352-378 의견·결정
379-421 발표
422-424 회의
425-428 도움·분담
429-431 회의
432-441 요청·공유
442-447 회의
448-454 일정
455-467 회의
468-477 일정
478-480 일상·인사
481-482 의견·결정
483-488 현장
489-490 의견·결정
491-496 현장
497-498 회의
499-504 현장
505-506 요청·공유
507-512 현장
513-514 요청·공유
515-518 현장
519-520 의견·결정
521-530 회의
531-536 현장
537-538 회의
539-542 의견·결정
543-544 회의
545 현장
546-548 일상·인사
549 현장
550 회의
551-552 일상·인사
553-555 회의
556 일정
557 일상·인사
558 현장
559-560 일정
561 일상·인사
562 일정
563-566 현장
567-568 의견·결정
569-570 현장
571-572 회의
573 현장
574 진행보고
575-586 현장
587-593 자기소개
910-918 회의
919-924 의견·결정
"""

def biz_map():
    m = {}
    for line in BIZ_RANGES.strip().splitlines():
        rng, name = line.split(maxsplit=1)
        a, _, b = rng.partition("-")
        for i in range(int(a), int(b or a) + 1):
            m[i] = name
    return m

# ── 구동사: 기본 동사 + 짝이 되는 말(off, up …) ──
VERBS = {
    "take": "take", "takes": "take", "took": "take", "taken": "take", "taking": "take",
    "make": "make", "makes": "make", "made": "make", "making": "make",
    "get": "get", "gets": "get", "got": "get", "gotten": "get", "getting": "get",
    "come": "come", "comes": "come", "came": "come", "coming": "come",
    "break": "break", "breaks": "break", "broke": "break", "breaking": "break",
    "work": "work", "working": "work",
    "run": "run", "ran": "run",
    "let": "let",
    "pick": "pick", "picked": "pick",
}
PARTICLES = ["off", "out", "up", "down", "in", "on", "over", "through", "after", "by",
             "behind", "at", "along", "across", "away", "back", "to", "apart", "rid",
             "into"]
MAIN = {"take", "get", "make"}

def phrasal(en):
    w = re.findall(r"[a-z']+", en.lower())
    if "takeout" in w:
        return "take", "take out"
    for i, t in enumerate(w):
        if t in VERBS:
            v = VERBS[t]
            # "It took me hours to take in …" 처럼 앞쪽 동사가 짝 없이 쓰이면 다음 동사로
            for j in range(i + 1, min(i + 7, len(w))):
                if w[j] in PARTICLES:
                    # "to" 는 동사 바로 뒤일 때만 짝 (took to ○ / took me hours to take in ×)
                    if w[j] == "to" and j != i + 1:
                        continue
                    return v, f"{v} {w[j]}"
                if w[j] in VERBS:
                    break
            if v == "make" and "of" in w[i + 1:i + 5]:  # make (too much / something) of
                return v, "make of"
    return None, None

# ── 비슷한 문장 묶음 ──
def words(en):
    return re.findall(r"[a-z0-9']+", en.lower().replace("’", "'"))

STOP = set("i you we he she they it a an the to of for on in at by is are was be my our your this that and or but so".split())

def similar(a, b):
    wa, wb = words(a), words(b)
    # 앞 세 단어가 같으면 같은 문형 (예: "Why don't I …", "Can we table …")
    if len(wa) >= 3 and wa[:3] == wb[:3]:
        return True
    ca, cb = set(wa) - STOP, set(wb) - STOP
    if not ca or not cb:
        return False
    j = len(ca & cb) / len(ca | cb)
    if j >= 0.5:
        return True
    # 4단어 연속이 같으면 같은 표현
    g = lambda w: {tuple(w[k:k + 4]) for k in range(len(w) - 3)}
    return bool(g(wa) & g(wb))

def main():
    rows = list(csv.DictReader(open(SRC, encoding="utf-8-sig")))
    bm = biz_map()
    subs, keys = [], []
    for i, r in enumerate(rows):
        if r["deck"] == "업무 회화":
            if i not in bm:
                sys.exit(f"분류 누락: {i} {r['en']}")
            subs.append(bm[i]); keys.append(None)
        else:
            v, pv = phrasal(r["en"])
            if v is None:
                sys.exit(f"구동사 인식 실패: {i} {r['en']}")
            subs.append(v if v in MAIN else "기타")
            keys.append(pv)

    # 묶음: 같은 덱 안에서만. 구동사는 같은 구동사(take off …)끼리 묶는다.
    parent = list(range(len(rows)))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    def union(a, b):
        parent[find(a)] = find(b)
    idx = {}
    for i, k in enumerate(keys):
        if k:
            if k in idx: union(i, idx[k])
            else: idx[k] = i
    for i in range(len(rows)):
        if keys[i]: continue
        for j in range(i + 1, min(i + 25, len(rows))):  # 비슷한 문장은 CSV에서 가까이 붙어 있다
            if rows[j]["deck"] == rows[i]["deck"] and not keys[j] and similar(rows[i]["en"], rows[j]["en"]):
                union(i, j)

    gid, grp = {}, []
    for i in range(len(rows)):
        r = find(i)
        gid.setdefault(r, len(gid) + 1)
        grp.append(gid[r])

    with open(DST, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["deck", "sub", "grp", "en", "ko"])
        for r, s, g in zip(rows, subs, grp):
            w.writerow([r["deck"], s, g, r["en"], r["ko"]])
    print("저장:", DST)

if __name__ == "__main__":
    main()
