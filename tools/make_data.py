# data/speak_sentences_tagged.csv -> data.js (앱이 처음 켜질 때 넣는 기본 문장)
import csv, json
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
rows = list(csv.DictReader(open(ROOT / "data" / "speak_sentences_tagged.csv", encoding="utf-8-sig")))
seed = [{"id": f"s{i}", "deck": r["deck"], "sub": r["sub"], "grp": int(r["grp"]), "en": r["en"], "ko": r["ko"], "order": i}
        for i, r in enumerate(rows)]
js = "/* 초기 문장 (data/speak_sentences_tagged.csv 에서 생성) */\nwindow.SEED = " + json.dumps(seed, ensure_ascii=False, separators=(",", ":")) + ";\n"
(ROOT / "data.js").write_text(js, encoding="utf-8")
print("data.js:", len(seed), "문장")
