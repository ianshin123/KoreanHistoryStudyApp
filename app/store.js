/**
 * 진도·복습 상태 저장소.
 *
 * 백엔드가 없으므로 전부 localStorage에 둔다. iOS의 홈 화면 앱은 저장소가
 * 통째로 비워질 수 있어서, 읽기·쓰기를 모두 감싸 두고 설정 화면에서
 * JSON 내보내기/가져오기를 항상 제공한다.
 */

const KEY = 'khs.v1';

const EMPTY = {
  srs: {},        // 문항별 간격 반복 상태
  seen: {},       // 학습 모드에서 읽은 블록
  scope: null,    // 마지막으로 고른 범위
  order: 'book',  // 마지막으로 고른 정렬축
  settings: { dday: null, serif: false, showKeywords: true, theme: 'auto' },
};

// 라이트너 상자별 복습 간격(일). 시험이 가까우면 compress()로 눌러 쓴다.
const INTERVALS = [0, 1, 2, 4, 7, 14];
export const MAX_BOX = INTERVALS.length - 1;

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(EMPTY),
      ...parsed,
      settings: { ...EMPTY.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 사생활 보호 모드나 저장 공간 부족. 이번 세션 동안은 메모리로만 굴린다.
  }
}

export function getState() { return state; }
export function settings() { return state.settings; }

export function setSetting(key, value) {
  state.settings[key] = value;
  persist();
}

export function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDay(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
}

export function daysLeft() {
  const dday = state.settings.dday;
  if (!dday) return null;
  const target = new Date(`${dday}T00:00:00`);
  return Math.ceil((target - today()) / 86400000);
}

/**
 * 남은 일수가 짧으면 복습 간격을 눌러 시험 전에 모든 상자를 한 번 더 돌게 한다.
 * 간격이 시험일을 넘어가 버리면 복습이 영영 오지 않기 때문이다.
 */
function compress(days) {
  const left = daysLeft();
  if (left == null || left > 21) return days;
  if (left <= 0) return 0;
  return Math.max(1, Math.min(days, Math.ceil(left / 3)));
}

export function srsOf(questionId) {
  return state.srs[questionId] ?? null;
}

export function isDue(questionId) {
  const rec = state.srs[questionId];
  if (!rec) return true;                 // 아직 한 번도 안 푼 문항
  return rec.due <= isoDay(today());
}

export function dueCount(questionIds) {
  return questionIds.filter(isDue).length;
}

/** 채점 결과를 반영한다. correct=true면 상자를 올리고, 틀리면 1로 되돌린다. */
export function grade(questionId, correct) {
  const prev = state.srs[questionId] ?? { box: 0, wrong: 0, seen: 0 };
  const box = correct ? Math.min(prev.box + 1, MAX_BOX) : 1;
  const wait = compress(INTERVALS[box]);
  const due = new Date(today().getTime() + wait * 86400000);

  state.srs[questionId] = {
    box,
    due: isoDay(due),
    wrong: prev.wrong + (correct ? 0 : 1),
    seen: prev.seen + 1,
    last: isoDay(today()),
    lastCorrect: correct,
  };
  persist();
  return state.srs[questionId];
}

export function markSeen(blockKey) {
  if (state.seen[blockKey]) return;
  state.seen[blockKey] = isoDay(today());
  persist();
}

export function hasSeen(blockKey) {
  return Boolean(state.seen[blockKey]);
}

/** 커버리지 보드의 칸 색을 정하는 상태. */
export function statusOf(blockKey, relatedQuestionIds) {
  const records = relatedQuestionIds.map((id) => state.srs[id]).filter(Boolean);
  if (records.some((r) => !r.lastCorrect)) return 'wrong';
  if (records.length && records.every((r) => r.box >= 3)) return 'known';
  if (records.length || hasSeen(blockKey)) return 'seen';
  return 'new';
}

export function setScope(scope) { state.scope = scope; persist(); }
export function getScope() { return state.scope; }
export function setOrder(order) { state.order = order; persist(); }
export function getOrder() { return state.order ?? 'book'; }

export function exportJSON() {
  return JSON.stringify({ app: 'korean-history-study', version: 1, saved: new Date().toISOString(), data: state }, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const data = parsed?.data ?? parsed;
  if (!data || typeof data !== 'object') throw new Error('형식을 알 수 없는 파일입니다.');
  state = {
    ...structuredClone(EMPTY),
    ...data,
    settings: { ...EMPTY.settings, ...(data.settings ?? {}) },
  };
  persist();
}

export function resetProgress() {
  const keep = state.settings;
  state = { ...structuredClone(EMPTY), settings: keep };
  persist();
}
