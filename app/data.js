/**
 * 콘텐츠 적재와 범위(Scope) 엔진.
 *
 * 이 앱의 중심 생각: 교과서의 단원은 '폴더'가 아니라 '태그'다.
 * 블록마다 단원 위치(loc)·연표(era)·사건·인물·주제 좌표를 함께 달아 두면,
 * 어느 축으로 범위를 고르든 결국 같은 모양의 '블록 집합'으로 환원된다.
 * 그래서 학습 엔진도 하나, 문제 엔진도 하나면 된다.
 */

const cache = { toc: null, sections: new Map(), questions: new Map() };

async function getJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} 를 불러오지 못했습니다 (${res.status})`);
  return res.json();
}

export async function loadToc() {
  if (!cache.toc) cache.toc = await getJSON('data/toc.json');
  return cache.toc;
}

/** 목차를 소단원 배열로 펼친다. */
export function flatSections(toc) {
  const out = [];
  for (const unit of toc.units) {
    for (const topic of unit.topics) {
      for (const sec of topic.sections) {
        out.push({
          ...sec,
          unitId: unit.id,
          unitLabel: unit.label,
          unitTitle: unit.title,
          topicId: topic.id,
          topicNo: topic.no,
          topicTitle: topic.title,
          ready: Boolean(sec.ready),
        });
      }
    }
  }
  return out;
}

export async function loadSection(id) {
  if (!cache.sections.has(id)) {
    cache.sections.set(id, await getJSON(`data/sections/${id}.json`));
  }
  return cache.sections.get(id);
}

export async function loadQuestions(id) {
  if (!cache.questions.has(id)) {
    cache.questions.set(id, await getJSON(`data/questions/${id}.json`));
  }
  return cache.questions.get(id);
}

/**
 * 준비된 소단원의 블록을 전부 읽어 하나의 색인으로 만든다.
 * 블록마다 소속 소단원 정보를 복사해 두어, 이후 어떤 축으로든 바로 묶을 수 있게 한다.
 */
export async function buildIndex(toc) {
  const ready = flatSections(toc).filter((s) => s.ready);
  const blocks = [];
  const questions = [];

  for (const meta of ready) {
    const [sec, qs] = await Promise.all([
      loadSection(meta.id),
      loadQuestions(meta.id).catch(() => ({ questions: [] })),
    ]);
    for (const b of sec.blocks) {
      blocks.push({
        ...b,
        key: `${sec.id}#${b.id}`,
        sectionId: sec.id,
        sectionTitle: sec.title,
        unitId: meta.unitId,
        unitLabel: meta.unitLabel,
        topicId: meta.topicId,
        topicTitle: meta.topicTitle,
        topicNo: meta.topicNo,
      });
    }
    for (const q of qs.questions ?? []) {
      questions.push({ ...q, sectionId: sec.id, sectionTitle: sec.title,
                       unitId: meta.unitId, topicId: meta.topicId });
    }
  }
  return { ready, blocks, questions, facets: buildFacets(blocks) };
}

/** 사건·인물·주제·시대 축의 선택지를 블록 태그에서 뽑아낸다. */
function buildFacets(blocks) {
  const tally = (field) => {
    const map = new Map();
    for (const b of blocks) {
      for (const v of b[field] ?? []) {
        map.set(v, (map.get(v) ?? 0) + 1);
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
      .map(([key, count]) => ({ key, count }));
  };

  const decades = new Map();
  for (const b of blocks) {
    for (const d of decadesOf(b)) decades.set(d, (decades.get(d) ?? 0) + 1);
  }

  return {
    event: tally('events'),
    person: tally('people'),
    theme: tally('themes'),
    era: [...decades.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([key, count]) => ({ key: String(key), label: `${key}년대`, count })),
  };
}

/** 블록이 걸쳐 있는 연대(10년 단위)를 모두 돌려준다. */
export function decadesOf(block) {
  const era = block.era;
  if (!era) return [];
  const [from, to] = era.span ?? [era.year, era.year];
  if (from == null) return [];
  const out = [];
  for (let y = Math.floor(from / 10) * 10; y <= (to ?? from); y += 10) out.push(y);
  return out;
}

/** 정렬·그룹에 쓸 대표 연도. */
export function yearOf(block) {
  const era = block.era;
  if (!era) return Infinity;
  return era.year ?? era.span?.[0] ?? Infinity;
}

/* ─── 범위(Scope) ─────────────────────────────────────────────
 * { by: 'unit' | 'era' | 'event' | 'person' | 'theme', keys: [...] }
 * 어느 축이든 resolve()를 거치면 같은 모양의 결과가 된다.
 * ------------------------------------------------------------ */

export const AXES = [
  { by: 'unit',   label: '단원' },
  { by: 'era',    label: '시대' },
  { by: 'event',  label: '사건' },
  { by: 'person', label: '인물' },
  { by: 'theme',  label: '주제' },
];

const MATCHERS = {
  unit:   (b, keys) => keys.some((k) => b.sectionId === k || b.topicId === k || b.unitId === k),
  era:    (b, keys) => decadesOf(b).some((d) => keys.includes(String(d))),
  event:  (b, keys) => (b.events ?? []).some((v) => keys.includes(v)),
  person: (b, keys) => (b.people ?? []).some((v) => keys.includes(v)),
  theme:  (b, keys) => (b.themes ?? []).some((v) => keys.includes(v)),
};

export function resolve(index, scope) {
  const keys = scope?.keys ?? [];
  if (!keys.length) return { blocks: [], questions: [], sectionIds: [] };

  const match = MATCHERS[scope.by] ?? MATCHERS.unit;
  const blocks = index.blocks.filter((b) => match(b, keys));
  const blockKeys = new Set(blocks.map((b) => b.key));
  const sectionIds = [...new Set(blocks.map((b) => b.sectionId))];

  // 문항은 근거 블록(refs)이 범위 안에 있으면 범위에 든 것으로 본다.
  // 단원 축에서는 근거가 없더라도 그 소단원 문항이면 포함한다.
  const questions = index.questions.filter((q) => {
    const refs = (q.refs ?? []).map((r) => `${q.sectionId}#${r}`);
    if (refs.some((r) => blockKeys.has(r))) return true;
    return scope.by === 'unit' && sectionIds.includes(q.sectionId);
  });

  return { blocks, questions, sectionIds };
}

export function describeScope(toc, index, scope) {
  const keys = scope?.keys ?? [];
  if (!keys.length) return '범위가 비어 있음';
  if (scope.by !== 'unit') {
    const label = AXES.find((a) => a.by === scope.by)?.label ?? '';
    return keys.length === 1 ? `${label} · ${keys[0]}` : `${label} · ${keys[0]} 외 ${keys.length - 1}`;
  }

  // 단원 축은 가장 큰 덩어리를 대표 이름으로 삼는다.
  for (const unit of toc.units) {
    if (keys.includes(unit.id)) return `${unit.label}. ${unit.title}`;
  }
  const sections = flatSections(toc);
  const topics = toc.units.flatMap((u) => u.topics);
  const picked = topics.filter((t) => keys.includes(t.id));
  if (picked.length === 1) return `${picked[0].no} ${picked[0].title}`;
  if (picked.length > 1) return `${picked[0].no} ${picked[0].title} 외 ${picked.length - 1}개 중단원`;
  const secs = sections.filter((s) => keys.includes(s.id));
  if (secs.length === 1) return `${secs[0].title}`;
  return `소단원 ${secs.length}개`;
}

/** 특정 축의 모든 선택지 목록. 단원 축은 트리라 별도로 그린다. */
export function facetOptions(index, by) {
  return index.facets[by] ?? [];
}
