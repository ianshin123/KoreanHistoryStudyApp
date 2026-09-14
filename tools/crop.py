#!/usr/bin/env python3
"""교과서 펼침면에서 그림을 잘라내고, 쪽 원본 이미지를 렌더링한다.

교과서 그림·사진·지도·인물 사진도 시험에 나오므로 앱에 실물이 필요하다.
PDF가 각 이미지의 배치 좌표를 그대로 들고 있어서, 고해상도로 렌더한 뒤
그 좌표대로 오려내면 된다. 사람이 할 일은 잘린 그림에 캡션과 중요도를
붙이는 라벨링뿐이다.

    python3 tools/crop.py pages 5 6      # 교과서 쪽 원본 렌더 (「원본 보기」용)
    python3 tools/crop.py figures 5 6    # 그림 크롭 + 목록 출력
"""

import argparse
import json
from pathlib import Path

import pymupdf

PDF_PATH = Path(
    "/root/.claude/uploads/115edb50-9e42-5311-873b-986beaa3f9dc/"
    "cb27716b-____________________2_______________.pdf"
)
ROOT = Path(__file__).resolve().parent.parent
PAGE_DIR = ROOT / "assets" / "page"
FIG_DIR = ROOT / "assets" / "img"

PAGE_DPI = 160      # 원본 보기용 — 확대해도 글자가 읽혀야 한다
FIG_DPI = 300       # 그림 크롭용

# 너무 작은 조각(장식용 아이콘·말풍선 꼬리)과 배경 일러스트를 걸러낸다.
MIN_SIDE = 26.0     # pt
MIN_AREA = 1600.0   # pt²
MAX_AREA_RATIO = 0.42   # 쪽 면적 대비 이 비율을 넘으면 배경 그림으로 본다


def textbook_pages(pdf_page: int) -> tuple[int, int]:
    return 2 * pdf_page + 2, 2 * pdf_page + 3


def overlaps(a: list[float], b: list[float], pad: float = 3.0) -> bool:
    return not (
        a[2] + pad < b[0] or b[2] + pad < a[0]
        or a[3] + pad < b[1] or b[3] + pad < a[1]
    )


def merge_boxes(boxes: list[list[float]]) -> list[list[float]]:
    """겹치거나 맞닿은 상자를 하나로 합친다.

    한 장의 그림이 본체·마스크·덧그림 여러 조각으로 나뉘어 들어 있는 경우가
    많아서, 그대로 자르면 같은 그림이 여러 번 나온다.
    """
    merged = [list(b) for b in boxes]
    changed = True
    while changed:
        changed = False
        out: list[list[float]] = []
        for box in merged:
            for kept in out:
                if overlaps(kept, box):
                    kept[0] = min(kept[0], box[0])
                    kept[1] = min(kept[1], box[1])
                    kept[2] = max(kept[2], box[2])
                    kept[3] = max(kept[3], box[3])
                    changed = True
                    break
            else:
                out.append(box)
        merged = out
    return merged


def figure_boxes(page: pymupdf.Page, x_lo: float, x_hi: float) -> list[list[float]]:
    page_area = (x_hi - x_lo) * page.rect.height
    raw = []
    for info in page.get_image_info():
        x0, y0, x1, y1 = info["bbox"]
        # 재단선 물림으로 지면 밖까지 뻗은 그림이 있다. 어느 쪽 지면에
        # 속하는지는 가장자리가 아니라 중심으로 판정하고, 상자는 잘라 맞춘다.
        if not (x_lo <= (x0 + x1) / 2 <= x_hi):
            continue
        x0, x1 = max(x0, x_lo), min(x1, x_hi)
        y0, y1 = max(y0, 0.0), min(y1, page.rect.height)
        if (x1 - x0) < MIN_SIDE or (y1 - y0) < MIN_SIDE:
            continue
        if (x1 - x0) * (y1 - y0) < MIN_AREA:
            continue
        raw.append([x0, y0, x1, y1])
    boxes = [
        b for b in merge_boxes(raw)
        if (b[2] - b[0]) * (b[3] - b[1]) < page_area * MAX_AREA_RATIO
    ]
    return sorted(boxes, key=lambda b: (round(b[1] / 20), b[0]))


# 벡터로 그려진 도표·지도는 래스터 이미지 목록에 잡히지 않는다. 이런 그림은
# 흰색으로 채워진 테두리 상자 안에 들어 있어서, 그 상자를 후보로 삼는다.
VEC_MIN_W, VEC_MIN_H = 52.0, 42.0


def vector_boxes(page: pymupdf.Page, x_lo: float, x_hi: float) -> list[list[float]]:
    page_area = (x_hi - x_lo) * page.rect.height
    raw = []
    for g in page.get_drawings():
        r = g["rect"]
        if not (x_lo <= (r.x0 + r.x1) / 2 <= x_hi):
            continue
        if r.width < VEC_MIN_W or r.height < VEC_MIN_H:
            continue
        if r.width * r.height > page_area * MAX_AREA_RATIO:
            continue
        raw.append([max(r.x0, x_lo), max(r.y0, 0.0),
                    min(r.x1, x_hi), min(r.y1, page.rect.height)])
    merged = merge_boxes(raw)
    # 큰 상자 안에 완전히 들어가는 작은 상자는 같은 그림의 일부다.
    outer = [
        b for b in merged
        if not any(
            o is not b and o[0] <= b[0] and o[1] <= b[1]
            and o[2] >= b[2] and o[3] >= b[3]
            for o in merged
        )
    ]
    return sorted(outer, key=lambda b: (round(b[1] / 20), b[0]))


def save_crop(page: pymupdf.Page, box: list[float], name: str) -> dict:
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    pix = page.get_pixmap(dpi=FIG_DPI, clip=pymupdf.Rect(*box))
    path = FIG_DIR / f"{name}.jpg"
    pix.pil_save(path, format="JPEG", quality=80, optimize=True)
    return {
        "id": name,
        "file": f"assets/img/{name}.jpg",
        "bbox": [round(v, 1) for v in box],
        "px": [pix.width, pix.height],
        "kb": round(path.stat().st_size / 1024),
    }


def render_pages(doc, start: int, end: int) -> list[dict]:
    PAGE_DIR.mkdir(parents=True, exist_ok=True)
    out = []
    for pdf_page in range(start, end + 1):
        page = doc[pdf_page - 1]
        half = page.rect.width / 2
        for side, number in zip(("left", "right"), textbook_pages(pdf_page)):
            clip = pymupdf.Rect(0 if side == "left" else half, 0,
                                half if side == "left" else page.rect.width,
                                page.rect.height)
            pix = page.get_pixmap(dpi=PAGE_DPI, clip=clip)
            path = PAGE_DIR / f"p{number:03d}.jpg"
            pix.pil_save(path, format="JPEG", quality=72, optimize=True)
            out.append({"page": number, "file": str(path.relative_to(ROOT)),
                        "kb": round(path.stat().st_size / 1024)})
    return out


def crop_figures(doc, start: int, end: int, vectors: bool) -> list[dict]:
    manifest = []
    for pdf_page in range(start, end + 1):
        page = doc[pdf_page - 1]
        half = page.rect.width / 2
        for side, number in zip(("left", "right"), textbook_pages(pdf_page)):
            x_lo, x_hi = (0, half) if side == "left" else (half, page.rect.width)
            for i, box in enumerate(figure_boxes(page, x_lo, x_hi), start=1):
                rec = save_crop(page, box, f"p{number:03d}-f{i:02d}")
                manifest.append({**rec, "page": number, "kind": "raster"})
            if not vectors:
                continue
            # 벡터 도표는 사료 텍스트 상자까지 함께 잡히므로 '후보'로만 낸다.
            # 무엇을 남길지는 펼침면을 보고 사람이 고른다.
            for i, box in enumerate(vector_boxes(page, x_lo, x_hi), start=1):
                rec = save_crop(page, box, f"p{number:03d}-v{i:02d}")
                manifest.append({**rec, "page": number, "kind": "vector?"})
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("mode", choices=["pages", "figures", "box"])
    ap.add_argument("start", type=int)
    ap.add_argument("end", type=int, nargs="?")
    ap.add_argument("--vectors", action="store_true",
                    help="벡터로 그려진 도표·지도 후보도 함께 잘라낸다")
    ap.add_argument("--rect", nargs=4, type=float, metavar=("X0", "Y0", "X1", "Y1"),
                    help="box 모드: 펼침면 좌표계에서 잘라낼 영역")
    ap.add_argument("--name", help="box 모드: 저장할 파일 이름(확장자 제외)")
    ap.add_argument("--pdf", default=str(PDF_PATH))
    args = ap.parse_args()
    end = args.end or args.start

    doc = pymupdf.open(args.pdf)
    if args.mode == "pages":
        result = render_pages(doc, args.start, end)
    elif args.mode == "box":
        if not args.rect or not args.name:
            ap.error("box 모드에는 --rect 와 --name 이 필요하다")
        result = [save_crop(doc[args.start - 1], args.rect, args.name)]
    else:
        result = crop_figures(doc, args.start, end, args.vectors)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
