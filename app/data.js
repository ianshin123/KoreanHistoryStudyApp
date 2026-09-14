/** 콘텐츠 적재. 진도 저장이 없으므로 상태는 들고 있지 않다. */

const cache = { toc: null, figures: null, sections: new Map(), questions: new Map() };

async function getJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} (${res.status})`);
  return res.json();
}

export async function loadToc() {
  cache.toc ??= await getJSON('data/toc.json');
  return cache.toc;
}

export async function loadFigures() {
  if (!cache.figures) {
    const list = await getJSON('data/figures.json').catch(() => []);
    cache.figures = new Map(list.map((f) => [f.id, f]));
  }
  return cache.figures;
}

export async function loadSection(id) {
  if (!cache.sections.has(id)) cache.sections.set(id, await getJSON(`data/sections/${id}.json`));
  return cache.sections.get(id);
}

export async function loadQuestions(id) {
  if (!cache.questions.has(id)) {
    cache.questions.set(id, await getJSON(`data/questions/${id}.json`).catch(() => ({ questions: [] })));
  }
  return cache.questions.get(id);
}

/** 목차를 소단원 배열로 펼친다. */
export function flatSections(toc) {
  return toc.units.flatMap((unit) =>
    unit.topics.flatMap((topic) =>
      topic.sections.map((sec) => ({
        ...sec,
        unitId: unit.id, unitLabel: unit.label, unitTitle: unit.title,
        topicId: topic.id, topicNo: topic.no, topicTitle: topic.title,
        ready: Boolean(sec.ready),
      }))));
}

export function findSection(toc, id) {
  return flatSections(toc).find((s) => s.id === id) ?? null;
}

/** 중단원·대단원·전범위 문제를 한 번에 풀 수 있도록 소단원 묶음을 돌려준다. */
export function sectionsOf(toc, scopeId) {
  const all = flatSections(toc).filter((s) => s.ready);
  if (scopeId === 'all') return all;
  return all.filter((s) => s.id === scopeId || s.topicId === scopeId || s.unitId === scopeId);
}

export function scopeTitle(toc, scopeId) {
  if (scopeId === 'all') return '전범위';
  for (const unit of toc.units) {
    if (unit.id === scopeId) return `${unit.label}. ${unit.title}`;
    for (const topic of unit.topics) {
      if (topic.id === scopeId) return `${topic.no} ${topic.title}`;
      for (const sec of topic.sections) if (sec.id === scopeId) return sec.title;
    }
  }
  return '문제';
}

export async function questionsFor(toc, scopeId) {
  const secs = sectionsOf(toc, scopeId);
  const packs = await Promise.all(secs.map((s) => loadQuestions(s.id)));
  return packs.flatMap((pack, i) =>
    (pack.questions ?? []).map((q) => ({ ...q, sectionId: secs[i].id, sectionTitle: secs[i].title })));
}

/** 전범위 연표 — 각 소단원이 들고 있는 연표 항목을 모아 시간순으로 늘어놓는다. */
export async function buildTimeline(toc) {
  const secs = flatSections(toc).filter((s) => s.ready);
  const packs = await Promise.all(secs.map((s) => loadSection(s.id)));
  const rows = packs.flatMap((sec, i) =>
    (sec.timeline ?? []).map((t) => ({ ...t, sectionId: secs[i].id, sectionTitle: secs[i].title })));

  // 같은 해에 여러 소단원이 같은 사건을 적을 수 있어 한 번 합친다.
  const seen = new Map();
  for (const r of rows) {
    const key = `${r.year}|${r.text}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()].sort((a, b) => a.year - b.year || a.text.localeCompare(b.text, 'ko'));
}
