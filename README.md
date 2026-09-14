# 한국사 시험대비 학습 앱

천재교육 『고등 한국사 2』(정요근 외) **교과서 8~85쪽**을 학습하고 문제를 푸는 개인용 웹앱.
빌드 단계 없이 GitHub Pages가 파일을 그대로 서빙하며, 홈 화면에 추가해 앱처럼 쓸 수 있다(PWA·오프라인 지원).

> 현재 상태: **Phase 2 파일럿** — 소단원 `Ⅰ-01-2 일제의 ‘문화 정치’`(13~15쪽) 하나로 전 과정을 관통했다.
> 설계와 남은 절차는 [`docs/PLAN.md`](docs/PLAN.md) 참고.

## 핵심 설계

**단원은 폴더가 아니라 태그다.** 교과서 위치를 계층으로 박아 넣으면 시대순·인물별 정리가 불가능해진다.
그래서 학습 원자(블록)마다 여러 축의 좌표를 함께 붙인다.

```
loc    교과서 위치 (대단원/중단원/소단원/쪽)   ← 1개, 고정
era    연표 좌표                              ← 정렬용
events 사건 태그      people 인물 태그      themes 주제 태그   ← N개
```

범위(Scope)는 축과 무관한 하나의 개념으로 통일된다.

```
Scope = { by: 'unit'|'era'|'event'|'person'|'theme', keys: [...] }
resolve(Scope) → 블록 집합 → 문항 집합
```

덕분에 **학습과 퀴즈가 같은 범위를 공유**한다. "방금 공부한 데까지만 문제 풀기"가 버튼 하나다.
범위(무엇을)와 정렬축(어떤 순서로)은 분리되어 있고, 기본값은 언제나 `단원 범위 + 교과서순`이다 — 시험이 그렇게 나오기 때문이다.

**출제 비중과 학습 커버리지는 다르다.** 본문에서 문제가 많이 나오지만 그림·인물·여백 용어·사료에서도 몇 문제는 나온다.
그래서 출제 비중은 중요도를 따르되, 범위 안의 모든 항목에는 최소 1문항이 존재하도록 한다.
「커버리지 보드」의 회색 칸이 0개가 되는 것이 시험 준비 완료의 정의이고, 「구석구석 모드」는 주변부 항목만 따로 돌린다.

## 구조

```
index.html            앱 셸
app/                  main(라우터) data(범위 엔진) store(진도·SRS)
                      scope(범위 시트) study quiz views ui
styles/main.css
data/toc.json         단원 트리 (시험 범위 전체)
data/sections/*.json  소단원 콘텐츠 — 블록마다 다축 태그
data/questions/*.json 문항
assets/img/           교과서 그림 크롭
assets/page/          펼침면 원본 (「원본 보기」용)
tools/                extract.py · crop.py — PDF → 데이터 파이프라인
```

## 문항 형식

실제 모의고사처럼 **자료 제시형**이 중심이다.

| format | 내용 |
|---|---|
| `source-pos` / `source-neg` | 사료 제시 후 옳은 / 옳지 않은 것 고르기 |
| `compare` | (가)·(나) 두 자료 비교 |
| `graph` · `map` · `image-id` · `image-ctx` | 그래프·지도·사진 제시형 |
| `order` · `timeline` | 순서 배열, 연표 시기 찾기 |
| `cloze` · `short` · `ox` | 빈칸·단답·O/X |
| `essay` | 서술형 — 모범답안 + 배점별 채점 기준 자가 채점 |

`negative: true` 문항은 화면에서 **“옳지 <u>않은</u>”**을 붉게 강조한다.
부정 발문을 놓쳐서 틀리는 건 실력이 아니라 화면 탓이다.

## 도구 사용법

```bash
pip install pymupdf pillow

python3 tools/extract.py 5 6          # PDF 5~6쪽(교과서 12~15쪽) 텍스트를 역할별로 추출
python3 tools/crop.py pages 5 6       # 펼침면 원본 렌더
python3 tools/crop.py figures 5 6 --vectors   # 그림 크롭 (벡터 도표 후보 포함)
```

PDF 1장 = 교과서 펼침 2쪽이며, PDF `n`쪽의 왼쪽이 교과서 `2n+2`쪽이다.
텍스트 레이어가 살아 있어 OCR이 필요 없다.

## 로컬에서 보기

```bash
python3 -m http.server 8801
# http://localhost:8801
```

## 저작권

교과서 본문과 이미지의 저작권은 원저작자(천재교육)에게 있다.
이 저장소는 개인 학습 목적으로만 쓰며, `robots.txt`와 `noindex`로 검색엔진 색인을 막아 두었다.
