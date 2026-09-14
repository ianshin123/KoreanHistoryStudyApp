/**
 * 범위 선택 시트.
 *
 * 단원·시대·사건·인물·주제 어느 축으로 고르든 결과는 같은 모양의 Scope다.
 * 그래서 학습 화면과 문제 화면이 범위를 그대로 주고받을 수 있고,
 * "방금 공부한 데까지만 문제 풀기"가 버튼 하나로 끝난다.
 */

import { AXES, facetOptions, resolve, describeScope, flatSections } from './data.js';
import { h, pageLabel } from './ui.js';
import * as store from './store.js';

let ctx;            // { toc, index }
let draft;          // 시트에서 만지는 중인 범위
let activeAxis = 'unit';

const el = {};

export function initScope(context, onApply) {
  ctx = context;
  el.sheet = document.getElementById('scopeSheet');
  el.tabs = document.getElementById('axisTabs');
  el.body = document.getElementById('scopeBody');
  el.summary = document.getElementById('scopeSummary');
  el.chipLabel = document.getElementById('scopeLabel');

  document.getElementById('scopeChip').addEventListener('click', open);
  el.sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.sheet.hidden) close();
  });

  const apply = (route) => {
    store.setScope(draft);
    renderChip();
    close();
    onApply?.(route);
  };
  document.getElementById('scopeStudy').addEventListener('click', () => apply('#/study'));
  document.getElementById('scopeQuiz').addEventListener('click', () => apply('#/quiz'));

  renderChip();
}

/** 저장된 범위가 없으면 준비된 소단원 전체를 기본 범위로 삼는다. */
export function currentScope() {
  const saved = store.getScope();
  if (saved?.keys?.length) return saved;
  const ready = flatSections(ctx.toc).filter((s) => s.ready).map((s) => s.id);
  return { by: 'unit', keys: ready };
}

export function renderChip() {
  el.chipLabel.textContent = describeScope(ctx.toc, ctx.index, currentScope());
}

function open() {
  draft = structuredClone(currentScope());
  activeAxis = draft.by ?? 'unit';
  el.sheet.hidden = false;
  renderTabs();
  renderBody();
}

function close() { el.sheet.hidden = true; }

function renderTabs() {
  el.tabs.replaceChildren(
    ...AXES.map((axis) =>
      h('button', {
        type: 'button',
        'aria-pressed': String(axis.by === activeAxis),
        onclick: () => {
          if (activeAxis === axis.by) return;
          activeAxis = axis.by;
          // 축을 바꾸면 선택은 비운다. 축이 다르면 키의 뜻도 다르기 때문이다.
          draft = { by: axis.by, keys: [] };
          renderTabs();
          renderBody();
        },
      }, axis.label)
    )
  );
}

function toggleKey(key) {
  const keys = new Set(draft.keys);
  keys.has(key) ? keys.delete(key) : keys.add(key);
  draft.keys = [...keys];
  renderBody();
}

function renderBody() {
  el.body.replaceChildren(activeAxis === 'unit' ? unitTree() : facetChips(activeAxis));
  renderSummary();
}

/* ─── 단원 축: 대단원 → 중단원 → 소단원 트리 ─────────────────── */

function unitTree() {
  const wrap = h('div');
  const readyIds = new Set(ctx.index.ready.map((s) => s.id));

  for (const unit of ctx.toc.units) {
    const unitSecs = unit.topics.flatMap((t) => t.sections);
    const unitReady = unitSecs.some((s) => readyIds.has(s.id));
    const box = h('div', { class: 'tree-unit' });

    box.append(row({
      cls: 'tree-row--unit',
      id: unit.id,
      label: `${unit.label}. ${unit.title}`,
      pages: unit.pages,
      enabled: unitReady,
      childIds: [unit.id, ...unit.topics.map((t) => t.id), ...unitSecs.map((s) => s.id)],
    }));

    for (const topic of unit.topics) {
      const topicReady = topic.sections.some((s) => readyIds.has(s.id));
      box.append(row({
        cls: 'tree-row--topic',
        id: topic.id,
        label: `${topic.no} ${topic.title}`,
        pages: topic.pages,
        enabled: topicReady,
        childIds: [topic.id, ...topic.sections.map((s) => s.id)],
      }));

      for (const sec of topic.sections) {
        box.append(row({
          cls: 'tree-row--sec',
          id: sec.id,
          label: `${sec.no} ${sec.title}`,
          pages: sec.pages,
          enabled: readyIds.has(sec.id),
          childIds: [sec.id],
        }));
      }
    }
    wrap.append(box);
  }
  return wrap;
}

function row({ cls, id, label, pages, enabled, childIds }) {
  const checked = draft.keys.includes(id);
  const input = h('input', {
    type: 'checkbox',
    checked,
    disabled: !enabled,
    onchange: () => {
      const keys = new Set(draft.keys);
      // 상위를 켜면 그 아래 선택은 흡수한다. 같은 범위를 두 번 세지 않기 위해서다.
      if (input.checked) {
        for (const cid of childIds) keys.delete(cid);
        keys.add(id);
      } else {
        keys.delete(id);
      }
      draft.keys = [...keys];
      renderBody();
    },
  });

  return h('label', {
    class: `tree-row ${cls}${enabled ? '' : ' is-empty'}`,
  },
    input,
    h('span', { text: label }),
    !enabled && h('span', { class: 'badge-soon', text: '준비 중' }),
    h('span', { class: 'pg', text: pageLabel(pages) })
  );
}

/* ─── 나머지 축: 태그 칩 ─────────────────────────────────────── */

function facetChips(axis) {
  const options = facetOptions(ctx.index, axis);
  if (!options.length) {
    return h('p', { class: 'muted tiny', text: '이 축으로 고를 수 있는 항목이 아직 없습니다. 콘텐츠가 쌓이면 늘어납니다.' });
  }

  const hint = {
    era: '연대별로 묶어 봅니다. 흐름과 순서를 잡을 때 좋습니다.',
    event: '사건 하나를 원인·전개·영향까지 통으로 모읍니다.',
    person: '한 인물이 등장하는 대목을 교과서 순서와 상관없이 전부 모읍니다. 인물 종합 문제 대비용입니다.',
    theme: '성격이 비슷한 정책·운동을 나란히 놓고 비교합니다.',
  }[axis];

  return h('div', {},
    hint && h('p', { class: 'muted tiny', text: hint }),
    h('div', { class: 'chip-grid' },
      options.map((opt) =>
        h('button', {
          type: 'button',
          'aria-pressed': String(draft.keys.includes(opt.key)),
          onclick: () => toggleKey(opt.key),
        },
          opt.label ?? opt.key,
          h('span', { class: 'n', text: opt.count })
        )
      )
    )
  );
}

function renderSummary() {
  const { blocks, questions } = resolve(ctx.index, draft);
  const ok = blocks.length > 0;
  el.summary.textContent = ok
    ? `학습 항목 ${blocks.length}개 · 문항 ${questions.length}개`
    : '선택된 항목이 없습니다.';
  document.getElementById('scopeStudy').disabled = !ok;
  document.getElementById('scopeQuiz').disabled = questions.length === 0;
}
