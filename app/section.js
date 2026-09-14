/**
 * 소단원 화면 — 핵심 정리 / 자료 / 문제.
 *
 * 교과서를 그대로 옮기면 앱을 쓸 이유가 없다. 정리는 뼈대만 남기고,
 * 사료와 그림은 따로 모아 두어 직접 읽게 한다.
 */

import { h, bold, pageLabel, openImage, openSpread } from './ui.js';
import { loadSection, loadFigures, loadQuestions } from './data.js';

const TABS = [
  { key: 'note', label: '핵심 정리' },
  { key: 'data', label: '자료' },
  { key: 'quiz', label: '문제' },
];

export async function renderSection(ctx, id, tab, goto) {
  const sec = await loadSection(id);
  const view = h('div');

  view.append(h('div', { class: 'seg' },
    TABS.map((t) => h('button', {
      type: 'button', 'aria-pressed': String(t.key === tab),
      onclick: () => goto(`#/s/${id}/${t.key}`),
    }, t.label))));

  if (tab === 'quiz') {
    const pack = await loadQuestions(id);
    view.append(h('div', {},
      h('p', { class: 'muted tiny', style: 'margin-bottom:12px',
        text: `${sec.title} · ${(pack.questions ?? []).length}문항` }),
      h('button', { class: 'btn btn--primary btn--block', type: 'button',
        disabled: !(pack.questions ?? []).length,
        onclick: () => goto(`#/quiz/${id}`) },
        (pack.questions ?? []).length ? '문제 풀기 시작' : '문항 준비 중')));
    return view;
  }

  if (tab === 'data') {
    view.append(await dataTab(sec));
    return view;
  }

  view.append(noteTab(sec));
  return view;
}

/* ─── 핵심 정리 ─────────────────────────────────────────────── */

function noteTab(sec) {
  const wrap = h('div');
  if (sec.oneLine) wrap.append(h('p', { class: 'oneline', text: sec.oneLine }));

  for (const note of sec.notes ?? []) {
    const box = h('section', { class: 'note' }, h('h3', { class: 'note__h', text: note.h }));
    if (note.flow) box.append(flow(note.flow));
    if (note.compare) box.append(compare(note.compare));
    if (note.table) box.append(table(note.table));
    if (note.points) box.append(points(note.points));
    wrap.append(box);
  }

  if (sec.terms?.length) {
    wrap.append(h('section', { class: 'note' },
      h('h3', { class: 'note__h', text: '용어' }),
      h('div', { class: 'termlist' },
        sec.terms.map((t) => h('div', {},
          h('b', { text: `${t.term} ` }), t.desc)))));
  }
  return wrap;
}

function points(list) {
  return h('ul', {}, list.map((p) =>
    Array.isArray(p)
      ? h('li', { html: bold(p[0]) }, h('ul', {}, p.slice(1).map((s) => h('li', { html: bold(s) }))))
      : h('li', { html: bold(p) })));
}

function flow(steps) {
  const row = h('div', { class: 'flow' });
  steps.forEach((s, i) => {
    if (i) row.append(h('i', { text: '→' }));
    row.append(h('span', { text: s }));
  });
  return row;
}

function compare(cmp) {
  return h('table', { class: 'cmp' },
    h('thead', {}, h('tr', {},
      h('th', { text: cmp.left }), h('th', { text: cmp.right }))),
    h('tbody', {}, cmp.rows.map((r) =>
      h('tr', {}, h('td', { html: bold(r[0]) }), h('td', { html: bold(r[1]) })))));
}

function table(tbl) {
  return h('table', { class: 'cmp' },
    h('thead', {}, h('tr', {}, tbl[0].map((c) => h('th', { text: c })))),
    h('tbody', {}, tbl.slice(1).map((r) =>
      h('tr', {}, r.map((c) => h('td', { html: bold(c) }))))));
}

/* ─── 자료 ─────────────────────────────────────────────────── */

async function dataTab(sec) {
  const wrap = h('div');
  const figures = await loadFigures();

  const [from, to] = sec.pages;
  const strip = h('div', { class: 'pagestrip' });
  for (let p = from; p <= to; p++) {
    strip.append(h('button', { type: 'button', onclick: () => openSpread(p) }, `${p}쪽 원본`));
  }
  wrap.append(strip);

  if (sec.materials?.length) {
    wrap.append(h('h3', { class: 'note__h', text: '사료' }));
    for (const m of sec.materials) {
      wrap.append(h('div', { class: 'src' },
        h('div', { class: 'src__t', text: m.title }),
        h('div', { class: 'src__b', text: m.text }),
        m.cite && h('p', { class: 'src__c', text: `— ${m.cite}` }),
        m.help && h('p', { class: 'src__h', text: m.help })));
    }
  }

  const figs = (sec.figures ?? []).map((f) => {
    const id = typeof f === 'string' ? f : f.id;
    const meta = figures.get(id);
    return { id, caption: (typeof f === 'object' && f.caption) || meta?.caption || '', meta };
  }).filter((f) => f.meta);

  if (figs.length) {
    wrap.append(h('h3', { class: 'note__h', style: 'margin-top:22px', text: '그림 · 도표' }));
    wrap.append(h('div', { class: 'figgrid' },
      figs.map((f) => h('div', {
        class: 'figcard',
        onclick: () => openImage(f.meta.file, f.caption),
      },
        h('img', { src: f.meta.file, alt: f.caption, loading: 'lazy' }),
        f.caption && h('p', { text: f.caption })))));
  }

  if (!sec.materials?.length && !figs.length) {
    wrap.append(h('p', { class: 'muted tiny', text: '이 소단원에는 따로 모을 자료가 없습니다. 위 원본 보기로 확인하세요.' }));
  }
  return wrap;
}
