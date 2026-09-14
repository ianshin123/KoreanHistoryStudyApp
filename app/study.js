/**
 * 학습 모드.
 *
 * 범위(무엇을 볼까)와 정렬축(어떤 순서로 볼까)은 다른 문제다.
 * 범위는 문제 화면과 공유되지만, 정렬축은 이 화면 안에서만 바뀐다.
 * 기본값은 언제나 '교과서순' — 시험이 그 순서로 나오기 때문이다.
 */

import { resolve, yearOf } from './data.js';
import { h, renderKeywords, pageLabel, zoomable, esc } from './ui.js';
import * as store from './store.js';

export const ORDERS = [
  { key: 'book',   label: '교과서순' },
  { key: 'era',    label: '연표순' },
  { key: 'event',  label: '사건별' },
  { key: 'person', label: '인물별' },
  { key: 'theme',  label: '주제별' },
];

export function renderStudy(ctx, scope, goto) {
  const { blocks } = resolve(ctx.index, scope);
  const view = h('div');

  if (!blocks.length) {
    return h('div', { class: 'empty' },
      h('h3', { text: '범위가 비어 있어요' }),
      h('p', { text: '위쪽 범위 칩을 눌러 공부할 단원을 골라 주세요.' }));
  }

  const order = store.getOrder();
  view.append(orderBar(order, (next) => { store.setOrder(next); goto('#/study'); }));
  view.append(toolRow());

  for (const group of groupBlocks(blocks, order)) {
    view.append(groupHead(group));
    // 쪽이 바뀌는 자리에만 원본 보기를 둔다. 블록마다 달면 읽는 흐름을 끊는다.
    let page = null;
    for (const block of group.blocks) {
      if (block.page && block.page !== page) {
        page = block.page;
        view.append(pageMark(page));
      }
      view.append(renderBlock(block));
    }
  }

  view.append(h('div', { class: 'btn-row', style: 'margin-top:26px' },
    h('button', { class: 'btn btn--primary btn--block', type: 'button',
      onclick: () => goto('#/quiz') }, '이 범위 문제풀기')
  ));

  // 화면에 닿은 블록은 읽은 것으로 본다. 커버리지 보드의 회색 칸이 줄어든다.
  queueMicrotask(() => observeSeen(view));
  return view;
}

function orderBar(current, onPick) {
  return h('div', { class: 'order-bar' },
    ORDERS.map((o) =>
      h('button', {
        type: 'button',
        'aria-pressed': String(o.key === current),
        onclick: () => onPick(o.key),
      }, o.label))
  );
}

function toolRow() {
  const s = store.settings();
  const mk = (label, key) => {
    const btn = h('button', {
      type: 'button', class: 'btn btn--ghost tiny',
      'aria-pressed': String(Boolean(s[key])),
      onclick: () => {
        store.setSetting(key, !store.settings()[key]);
        applyReadingPrefs();
        btn.setAttribute('aria-pressed', String(Boolean(store.settings()[key])));
      },
    }, label);
    return btn;
  };
  return h('div', { class: 'btn-row', style: 'margin-bottom:14px' },
    mk('키워드 강조', 'showKeywords'),
    mk('명조체로 읽기', 'serif'));
}

export function applyReadingPrefs() {
  const s = store.settings();
  document.body.classList.toggle('hide-kw', !s.showKeywords);
  for (const el of document.querySelectorAll('.blk__body')) {
    el.classList.toggle('is-serif', Boolean(s.serif));
  }
}

/* ─── 정렬축별 묶기 ─────────────────────────────────────────── */

function groupBlocks(blocks, order) {
  if (order === 'book') {
    const bySection = new Map();
    for (const b of blocks) {
      if (!bySection.has(b.sectionId)) {
        bySection.set(b.sectionId, { title: b.sectionTitle, sub: b.topicTitle, pages: null, blocks: [] });
      }
      bySection.get(b.sectionId).blocks.push(b);
    }
    for (const g of bySection.values()) {
      const pages = g.blocks.map((b) => b.page).filter(Boolean);
      g.pages = pages.length ? [Math.min(...pages), Math.max(...pages)] : null;
    }
    return [...bySection.values()];
  }

  if (order === 'era') {
    const sorted = [...blocks].sort((a, b) => yearOf(a) - yearOf(b));
    const groups = new Map();
    for (const b of sorted) {
      const y = yearOf(b);
      const key = Number.isFinite(y) ? `${Math.floor(y / 10) * 10}년대` : '연도 미상';
      if (!groups.has(key)) groups.set(key, { title: key, sub: '', blocks: [] });
      groups.get(key).blocks.push(b);
    }
    return [...groups.values()];
  }

  const field = { event: 'events', person: 'people', theme: 'themes' }[order];
  const groups = new Map();
  const orphans = [];
  for (const b of blocks) {
    const tags = b[field] ?? [];
    if (!tags.length) { orphans.push(b); continue; }
    for (const tag of tags) {
      if (!groups.has(tag)) groups.set(tag, { title: tag, sub: '', blocks: [] });
      groups.get(tag).blocks.push(b);
    }
  }
  // 여러 곳에 흩어진 항목일수록 먼저 보여 준다. 교과서순으로는 모이지 않는 것들이다.
  const out = [...groups.values()].sort((a, b) => b.blocks.length - a.blocks.length);
  if (orphans.length) out.push({ title: '그 밖의 내용', sub: '태그가 붙지 않은 항목', blocks: orphans });
  return out;
}

function groupHead(group) {
  const pages = group.pages ?? spread(group.blocks);
  return h('div', { class: 'group-head' },
    h('h2', { text: group.title }),
    h('span', { class: 'pg', text: pages ? pageLabel(pages) : `${group.blocks.length}개` }),
    group.sub && h('span', { class: 'sub', text: group.sub }));
}

function pageMark(page) {
  return h('div', { class: 'page-mark' },
    h('button', { type: 'button', onclick: () => openSpread(page) },
      `${page}쪽 · 원본 보기`));
}

function spread(blocks) {
  const pages = blocks.map((b) => b.page).filter(Boolean);
  return pages.length ? [Math.min(...pages), Math.max(...pages)] : null;
}

/* ─── 블록 종류별 그리기 ────────────────────────────────────── */

function renderBlock(block) {
  const wrap = h('div', { class: 'blk', dataset: { key: block.key } });
  const serif = store.settings().serif ? ' is-serif' : '';

  switch (block.type) {
    case 'heading':
      wrap.append(h('h3', { class: 'blk__heading', text: block.text }));
      break;

    case 'para':
      wrap.append(h('p', { class: `blk__body${serif}`, html: renderKeywords(block.text) }));
      if (block.note) wrap.append(h('p', { class: 'note-hint', text: `⚑ ${block.note}` }));
      break;

    case 'term':
      wrap.append(aside('term', block.term, block.desc));
      break;

    case 'vocab':
      wrap.append(h('div', { class: 'aside aside--term' },
        h('div', { class: 'aside__title', text: '어휘 뜻매김' }),
        ...block.items.map((it) =>
          h('p', {}, h('b', { text: `${it.term} ` }), it.desc))));
      break;

    case 'source':
      wrap.append(sourceBox(block));
      break;

    case 'box':
      wrap.append(boxBlock(block));
      break;

    case 'figure':
      wrap.append(figure(block));
      break;

    case 'explore':
      wrap.append(explore(block));
      break;

    default:
      wrap.append(h('p', { class: 'blk__body', text: block.text ?? '' }));
  }

  return wrap;
}

function aside(kind, title, body) {
  return h('div', { class: `aside aside--${kind}` },
    h('div', { class: 'aside__title', text: title }),
    h('p', { text: body }));
}

function sourceBox(block) {
  return h('div', { class: 'aside aside--source' },
    h('div', { class: 'aside__title', text: `사료 · ${block.title}` }),
    h('pre', { text: block.text }),
    block.cite && h('p', { class: 'aside__cite', text: `— ${block.cite}` }),
    block.help && h('p', { class: 'aside__help', text: `도움말 · ${block.help}` }));
}

function boxBlock(block) {
  const box = h('div', { class: 'aside aside--box' },
    h('div', { class: 'aside__title', text: block.title }),
    h('pre', { text: block.text }));
  if (block.img) box.append(figure(block));
  return box;
}

function figure(block) {
  const img = zoomable(
    h('img', { src: block.img, alt: block.caption ?? '', loading: 'lazy' }),
    block.caption ?? '');
  return h('figure', { class: 'fig' },
    img,
    h('figcaption', {},
      h('b', { text: block.caption ?? '' }),
      block.note && h('span', { text: ` ${block.note}` }),
      block.cite && h('span', { class: 'muted', text: ` [${block.cite}]` })));
}

function explore(block) {
  const wrap = h('div', { class: 'aside aside--box' },
    h('div', { class: 'aside__title', text: block.title }),
    block.intro && h('p', { text: block.intro }));

  for (const m of block.materials ?? []) {
    const card = h('div', { class: 'stim' },
      h('span', { class: 'stim__label', text: m.label }),
      m.title && h('p', {}, h('b', { text: m.title })));
    if (m.kind === 'source') {
      card.append(h('div', { class: 'stim__text', text: m.text }));
      if (m.cite) card.append(h('p', { class: 'stim__cite', text: `— ${m.cite}` }));
      for (const g of m.gloss ?? []) {
        card.append(h('p', { class: 'tiny muted', text: `${g.term} · ${g.desc}` }));
      }
    } else if (m.img) {
      card.append(zoomable(h('img', { src: m.img, alt: m.alt ?? m.title ?? '', loading: 'lazy' }), m.title ?? ''));
      if (m.note) card.append(h('p', { class: 'tiny muted', text: m.note }));
      if (m.cite) card.append(h('p', { class: 'stim__cite', text: `[${m.cite}]` }));
    }
    wrap.append(card);
  }

  for (const [i, q] of (block.questions ?? []).entries()) {
    wrap.append(h('p', { class: 'tiny' }, h('b', { text: `활동 ${i + 1} · ` }), q));
  }
  return wrap;
}

/** 데이터가 틀렸을 때 기댈 곳은 원본이다. 어디서든 한 번에 펼쳐 볼 수 있게 한다. */
export function openSpread(page) {
  import('./ui.js').then(({ openImage }) =>
    openImage(`assets/page/p${String(page).padStart(3, '0')}.jpg`, `교과서 ${page}쪽 원본`));
}

function observeSeen(root) {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      store.markSeen(e.target.dataset.key);
      io.unobserve(e.target);
    }
  }, { threshold: 0.45 });
  for (const el of root.querySelectorAll('.blk[data-key]')) io.observe(el);
}
