#!/usr/bin/env python3
"""목차의 `ready` 표시를 실제로 있는 콘텐츠 파일에 맞춘다.

소단원을 하나 채울 때마다 목차를 손으로 고치면 언젠가 어긋난다.
파일이 있으면 준비된 것으로 보고, 문항 수도 함께 적어 둔다.

    python3 tools/sync_toc.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def check_figures() -> int:
    """소단원이 가리키는 그림이 실제로 잘려 나와 있는지 확인하고, 없는 것은 뺀다.

    쪽 번호만 보고 그림 번호를 짐작해 적으면 어긋나기 쉬운데,
    빠진 그림은 화면에서 조용히 사라져 눈에 띄지 않는다. 그래서 여기서 잡는다.
    """
    have = {f["id"] for f in json.loads((DATA / "figures.json").read_text(encoding="utf-8"))}
    dropped = 0
    for path in sorted((DATA / "sections").glob("*.json")):
        sec = json.loads(path.read_text(encoding="utf-8"))
        figs = sec.get("figures") or []
        keep = [f for f in figs if (f if isinstance(f, str) else f["id"]) in have]
        if len(keep) != len(figs):
            missing = [f if isinstance(f, str) else f["id"] for f in figs
                       if (f if isinstance(f, str) else f["id"]) not in have]
            print(f"  {path.stem}: 없는 그림 {len(missing)}개 제거 → {', '.join(missing)}")
            dropped += len(missing)
            sec["figures"] = keep
            path.write_text(json.dumps(sec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return dropped


def main() -> int:
    toc = json.loads((DATA / "toc.json").read_text(encoding="utf-8"))
    ready = changed = 0
    dropped = check_figures()

    for unit in toc["units"]:
        for topic in unit["topics"]:
            for sec in topic["sections"]:
                has = (DATA / "sections" / f"{sec['id']}.json").exists()
                qfile = DATA / "questions" / f"{sec['id']}.json"
                count = 0
                if qfile.exists():
                    count = len(json.loads(qfile.read_text(encoding="utf-8")).get("questions", []))

                before = (sec.get("ready"), sec.get("q"))
                if has:
                    sec["ready"] = True
                    ready += 1
                else:
                    sec.pop("ready", None)
                if count:
                    sec["q"] = count
                else:
                    sec.pop("q", None)
                if before != (sec.get("ready"), sec.get("q")):
                    changed += 1

    (DATA / "toc.json").write_text(
        json.dumps(toc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    total = sum(len(t["sections"]) for u in toc["units"] for t in u["topics"])
    qtotal = sum(s.get("q", 0) for u in toc["units"] for t in u["topics"] for s in t["sections"])
    print(f"준비된 소단원 {ready}/{total} · 문항 {qtotal}개 · 바뀐 항목 {changed}개 · 제거된 그림 {dropped}개")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
