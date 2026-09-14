/**
 * 연표 — 시험 범위 전체를 통으로, 시간순으로 세로로 늘어놓는다.
 * 교과서는 단원별로 끊겨 있어서 흐름이 안 보이는데, 여기서는 한 줄로 이어진다.
 */

import { h, bold } from './ui.js';
import { buildTimeline } from './data.js';

export async function renderTimeline(ctx, goto) {
  const rows = await buildTimeline(ctx.toc);
  if (!rows.length) {
    return h('div', { class: 'empty' },
      h('h3', { text: '연표가 아직 비어 있어요' }),
      h('p', { text: '소단원 콘텐츠가 채워지면 여기에 모입니다.' }));
  }

  const view = h('div');
  view.append(h('div', { class: 'book-head' },
    h('h1', { text: '연표' }),
    h('div', { class: 'rule' }),
    h('p', { text: `${rows[0].year}년 ~ ${rows[rows.length - 1].year}년 · ${rows.length}개 사건` })));

  const tl = h('div', { class: 'tl' });
  let era = null;
  for (const r of rows) {
    const decade = Math.floor(r.year / 10) * 10;
    if (decade !== era) {
      era = decade;
      tl.append(h('div', { class: 'tl__era', text: `${decade}년대` }));
    }
    tl.append(h('div', { class: 'tl__row' },
      h('span', { class: 'tl__y', text: r.year }),
      h('div', { class: 'tl__t', html: bold(r.text) }),
      h('button', {
        class: 'tl__src', type: 'button',
        onclick: () => goto(`#/s/${r.sectionId}`),
      }, r.sectionTitle)));
  }
  view.append(tl);
  return view;
}
