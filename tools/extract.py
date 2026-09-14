#!/usr/bin/env python3
"""교과서 PDF 펼침면에서 텍스트를 역할별로 분류해 뽑아낸다.

이 PDF는 스캔본이 아니라 텍스트 레이어가 살아 있는 원본이라 OCR이 필요 없다.
요소의 역할(본문/소제목/사료/여백 용어/캡션...)이 글꼴·크기·색으로 일관되게
구분되므로, 그 조합을 서명(signature)으로 삼아 분류한다.

출력은 최종 콘텐츠 JSON이 아니라 '검수용 1차 추출본'이다.
펼침면 이미지를 같이 보면서 손으로 다듬는 것을 전제로 한다.

    python3 tools/extract.py 5 6          # PDF 5~6쪽
    python3 tools/extract.py 5 6 --json   # JSON으로
"""

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

import pymupdf

PDF_PATH = Path(
    "/root/.claude/uploads/115edb50-9e42-5311-873b-986beaa3f9dc/"
    "cb27716b-____________________2_______________.pdf"
)

# PDF 1장 = 교과서 펼침 2쪽. PDF n쪽의 왼쪽이 교과서 2n+2쪽.
def textbook_pages(pdf_page: int) -> tuple[int, int]:
    return 2 * pdf_page + 2, 2 * pdf_page + 3


# ─────────────────────────────────────────────────────────────────────────
# 역할 분류 규칙
#
# (글꼴 접두사, 크기 하한, 크기 상한, 색) → 역할
# 색이 None이면 색을 보지 않는다. 위에서부터 먼저 맞는 규칙을 쓴다.
# ─────────────────────────────────────────────────────────────────────────
RULES: list[tuple[str, float, float, str | None, str]] = [
    # 그림 위에 흰 글씨로 얹힌 라벨 — 색이 가장 확실한 단서라 맨 앞에 둔다
    (None,                   0.0, 99.0, "#ffffff", "overlay_label"),
    # 소단원 표제
    ("DXHanlgrumStd",       20.0, 99.0, None,      "section_number"),
    ("DXMgoRStd-B",         12.0, 20.0, None,      "section_title"),
    # 본문
    ("SDGothicNeoc-eSm",     6.8,  7.6, "#8d4b37", "heading"),       # 본문 소제목(갈색)
    ("SDGothicNeoc-eSm",     6.0,  6.6, None,      "activity_question"),  # 탐구 발문
    ("YDVYMjO13",            6.8,  7.6, None,      "body"),          # 본문 명조
    ("YDVYGO13",             6.6,  7.2, "#231f20", "keyword"),       # 본문 속 굵은 키워드
    # 사료 박스
    ("SDBook-cBd",           5.8,  6.6, None,      "source_strong"), # 사료 제목·조문 번호
    ("SDBook-aLt",           5.8,  6.6, None,      "source_body"),
    # 여백 용어(바깥쪽 단, 제목 + 설명). 제목은 붉은색일 때도 검은색일 때도 있다.
    ("YDVYGO14",             5.2,  5.6, None,      "term_title"),
    ("YDVYGO12",             5.2,  5.6, "#231f20", "term_body"),
    ("SDGothicNeoc-eSm",     4.3,  4.9, "#005aaa", "vocab_title"),   # '어휘 톡톡해요'
    # 자료 설명 박스
    ("YDVYGO14",             6.3,  6.9, None,      "box_title"),
    ("YDVYGO12",             6.1,  6.6, None,      "box_body"),
    # 학습 목표
    ("YDVYGO14",             5.5,  5.8, "#e86e24", "objective_label"),
    ("YDVYGO12",             5.5,  5.8, None,      "objective"),
    # 활동·말풍선
    ("SDGyeokdongGL2-eBd",   7.5, 10.0, None,      "activity_title"),
    ("JalnanOTF",            7.5, 10.0, None,      "activity_title"),
    ("GangwonEduSaeeum",     6.0, 12.0, None,      "speech"),
    ("SDGothicNeoRound",     6.0,  8.0, None,      "activity_body"),
    # 그림 위 라벨·배지
    (None,                   0.0, 99.0, "#ffffff", "overlay_label"),
    ("YDVYGO14",             4.5,  5.1, None,      "figure_label"),
    # 출처·쪽번호·러닝헤더
    ("YDVYGO12",             5.0,  5.4, None,      "cite"),
    ("YDVYGO13",             5.3,  5.9, None,      "running_head"),
    ("Dinmed",               6.0,  9.0, None,      "folio"),
]

# 본문 흐름에 인라인으로 섞이는 역할 — 문단 재조립 시 본문과 합쳐야 한다.
INLINE_WITH_BODY = {"keyword"}

# 항상 한 줄로 끝나는 역할. 이웃한 줄과 묶으면 제목과 내용이 붙어 버린다.
STANDALONE = {
    "heading", "section_title", "section_number", "source_strong",
    "term_title", "box_title", "vocab_title", "activity_title",
    "overlay_label", "objective_label", "figure_label",
}

# 쪽 아래 이 높이보다 밑은 러닝 푸터(단원명·쪽번호) 영역이다.
FOOTER_Y = 528.0


def classify(font: str, size: float, color: str) -> str:
    for fpat, lo, hi, col, role in RULES:
        if fpat is not None and not font.startswith(fpat):
            continue
        if not (lo <= size <= hi):
            continue
        if col is not None and color != col:
            continue
        return role
    return "unknown"


def norm(text: str) -> str:
    """한글 자모 결합 정규화 + 공백 정리."""
    text = unicodedata.normalize("NFC", text)
    return re.sub(r"[ \t]+", " ", text)


def collect_spans(page: pymupdf.Page) -> list[dict]:
    spans = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for s in line["spans"]:
                text = norm(s["text"])
                if not text.strip():
                    continue
                color = f"#{s['color']:06x}"
                spans.append(
                    {
                        "text": text,
                        "font": s["font"],
                        "size": round(s["size"], 1),
                        "color": color,
                        "bbox": [round(v, 1) for v in s["bbox"]],
                        "role": classify(s["font"], round(s["size"], 1), color),
                    }
                )
    return spans


def split_columns(spans: list[dict], page_width: float, side: str) -> list[dict]:
    """펼침면을 좌/우 교과서 쪽으로 나누고, 각 쪽 안에서 본문단/여백단을 가른다.

    여백 용어 단은 항상 펼침면 '바깥쪽'에 붙는다(왼쪽 쪽이면 왼쪽 끝).
    """
    half = page_width / 2
    if side == "left":
        page_spans = [s for s in spans if s["bbox"][0] < half]
        margin_edge = min((s["bbox"][0] for s in page_spans), default=0.0)
        # 바깥쪽(왼쪽) 끝에서 일정 폭까지가 여백 단
        for s in page_spans:
            s["column"] = "margin" if s["bbox"][0] < margin_edge + 62 else "main"
    else:
        page_spans = [s for s in spans if s["bbox"][0] >= half]
        margin_edge = max((s["bbox"][2] for s in page_spans), default=page_width)
        for s in page_spans:
            s["column"] = "margin" if s["bbox"][2] > margin_edge - 62 else "main"
    return page_spans


HANGUL_OR_WORD = re.compile(r"[가-힣A-Za-z0-9]")
CITE_PATTERN = re.compile(r"^[-–—]\s*\S.*[-–—]\s*$")


def is_meaningful(span: dict) -> bool:
    """장식용 글리프(깨진 기호, 말머리 아이콘)를 걸러낸다."""
    return bool(HANGUL_OR_WORD.search(span["text"]))


def refine_role(span: dict) -> str:
    """글꼴만으로 갈리지 않는 역할을 글의 생김새로 보정한다."""
    text = span["text"].strip()
    # 사료 출처는 여백 설명과 글꼴이 같다. '- 《...》, 1911. 9. 1. -' 꼴로 구분한다.
    if span["role"] in {"term_body", "cite"} and CITE_PATTERN.match(text):
        return "cite"
    return span["role"]


def merge_lines(spans: list[dict]) -> list[dict]:
    """같은 줄(y가 거의 같고 x가 이어지는) 조각들을 한 줄로 합친다."""
    spans = sorted(spans, key=lambda s: (round(s["bbox"][1] / 3), s["bbox"][0]))
    lines: list[dict] = []
    for s in spans:
        if lines:
            prev = lines[-1]
            same_row = abs(prev["bbox"][1] - s["bbox"][1]) < 3.2
            # 굵은 키워드의 상자는 뒤따르는 본문과 조금 겹치므로 음수 간격도 허용한다.
            adjacent = -9 <= s["bbox"][0] - prev["bbox"][2] < 14
            if same_row and adjacent and prev["role"] == s["role"]:
                prev["text"] += s["text"]
                prev["keywords"] = prev.get("keywords", []) + s.get("keywords", [])
                prev["bbox"][2] = s["bbox"][2]
                prev["bbox"][3] = max(prev["bbox"][3], s["bbox"][3])
                continue
        lines.append(dict(s))
    return lines


def absorb_keywords(spans: list[dict], enabled: bool = True) -> list[dict]:
    """본문 흐름에 인라인으로 박힌 굵은 키워드를 본문으로 되돌린다.

    키워드는 줄바꿈에 걸쳐 잘리기도 하므로('제1차 세' / '계 대전'),
    본문과 같은 흐름으로 합쳐 두고 원래 문자열만 따로 기록해 둔다.
    """
    if not enabled:
        return spans
    out = []
    for s in spans:
        if s["role"] in INLINE_WITH_BODY:
            s = dict(s, role="body", keywords=[s["text"].strip()])
            s["text"] = f"**{s['text'].strip()}**"
        out.append(s)
    return out


def group_paragraphs(lines: list[dict], indent_base: float | None) -> list[dict]:
    """연속한 같은 역할의 줄을 문단으로 묶는다.

    본문은 문단 첫 줄이 한 글자 들여쓰기 되어 있어서, 들여쓰기가
    문단 경계의 가장 확실한 신호다.
    """
    paras: list[dict] = []
    for ln in lines:
        indented = (
            indent_base is not None
            and ln["role"] == "body"
            and ln["bbox"][0] > indent_base + 3
        )
        if paras and not indented and ln["role"] not in STANDALONE:
            prev = paras[-1]
            gap = ln["bbox"][1] - prev["bbox"][3]
            if prev["role"] == ln["role"] and -2 < gap < 9:
                # 줄 끝의 공백이 곧 어절 구분이므로 strip 하지 않고 그대로 잇는다.
                prev["text"] = prev["text"] + ln["text"]
                prev["keywords"] = prev.get("keywords", []) + ln.get("keywords", [])
                prev["bbox"][2] = max(prev["bbox"][2], ln["bbox"][2])
                prev["bbox"][3] = ln["bbox"][3]
                continue
        paras.append(dict(ln))
    for p in paras:
        p["text"] = re.sub(r"\s+", " ", p["text"]).strip()
        # 줄바꿈에 걸려 잘린 키워드 조각을 본문에서 다시 이어 붙인다
        p["text"] = re.sub(r"\*\*\s*\*\*", "", p["text"])
        if p.get("keywords"):
            p["keywords"] = stitch_keywords(p["text"], p["keywords"])
    return paras


def stitch_keywords(text: str, fragments: list[str]) -> list[str]:
    """'**제1차 세****계 대전**' 처럼 잘린 조각을 온전한 키워드로 되돌린다."""
    joined = re.findall(r"\*\*(.+?)\*\*", text.replace("****", ""))
    return sorted({k.strip() for k in (joined or fragments) if k.strip()})


def extract_page(doc, pdf_page: int) -> dict:
    page = doc[pdf_page - 1]
    spans = [s for s in collect_spans(page) if is_meaningful(s)]
    left_no, right_no = textbook_pages(pdf_page)
    out = {"pdfPage": pdf_page, "pages": []}

    for side, number in (("left", left_no), ("right", right_no)):
        page_spans = split_columns([dict(s) for s in spans], page.rect.width, side)
        page_spans = [s for s in page_spans if s["bbox"][1] < FOOTER_Y]
        blocks: list[dict] = []
        # 본문단과 여백단은 y좌표가 서로 얽혀 있으므로 반드시 따로 조립한다.
        for column in ("main", "margin"):
            col_spans = [s for s in page_spans if s["column"] == column]
            if not col_spans:
                continue
            body_x = [s["bbox"][0] for s in col_spans if s["role"] == "body"]
            indent_base = min(body_x) if body_x else None
            # 굵은 키워드 흡수는 본문이 흐르는 단에서만 의미가 있다.
            lines = merge_lines(absorb_keywords(col_spans, enabled=bool(body_x)))
            for b in group_paragraphs(lines, indent_base):
                b["role"] = refine_role(b)
                blocks.append(b)
        out["pages"].append({"page": number, "side": side, "blocks": blocks})
    return out


def render_text(result: dict) -> str:
    lines = []
    for pg in result["pages"]:
        lines.append(f"\n{'=' * 78}\n교과서 {pg['page']}쪽  (PDF {result['pdfPage']}쪽 {pg['side']})\n{'=' * 78}")
        for b in pg["blocks"]:
            if b["role"] in {"folio", "running_head"}:
                continue
            kw = f"  [키워드: {', '.join(b['keywords'])}]" if b.get("keywords") else ""
            mark = "·" if b["column"] == "main" else "▸"
            lines.append(f"\n{mark} <{b['role']}>{kw}\n  {b['text']}")
            if b["role"] == "unknown":
                lines[-1] += f"\n    (미분류: {b['font']} {b['size']} {b['color']})"
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("start", type=int, help="시작 PDF 쪽 (1부터)")
    ap.add_argument("end", type=int, nargs="?", help="끝 PDF 쪽 (생략 시 start)")
    ap.add_argument("--json", action="store_true", help="JSON으로 출력")
    ap.add_argument("--pdf", default=str(PDF_PATH))
    args = ap.parse_args()

    doc = pymupdf.open(args.pdf)
    results = [extract_page(doc, p) for p in range(args.start, (args.end or args.start) + 1)]

    if args.json:
        json.dump(results, sys.stdout, ensure_ascii=False, indent=2)
    else:
        for r in results:
            print(render_text(r))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
