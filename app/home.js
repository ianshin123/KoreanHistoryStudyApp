/**
 * 목차 화면.
 *
 * 앱에 들어오면 바로 교과서 목차가 보이고, 단원을 누르면 그 안에서
 * 학습하거나 문제를 푼다. 그 밖의 군더더기는 두지 않는다.
 */

import { h, pageLabel } from './ui.js';
import { loadQuestions } from './data.js';

export async function renderHome(ctx, goto) {
  const view = h('div');

  view.append(h('div', { class: 'book-head' },
    h('h1', { text: '고등 한국사 2' }),
    h('div', { class: 'rule' }),
    h('p', { text: `시험 범위 ${ctx.toc.range.from}~${ctx.toc.range.to}쪽` })));

  for (const unit of ctx.toc.units) {
    const box = h('section', { class: 'unit' });
    box.append(h('div', { class: 'unit__head' },
      h('span', { class: 'unit__label', text: unit.label }),
      h('h2', { class: 'unit__title', text: unit.title }),
      h('span', { class: 'unit__pg', text: pageLabel(unit.pages) })));

    for (const topic of unit.topics) {
      const ready = topic.sections.filter((s) => s.ready);
      box.append(h('div', { class: 'topic' },
        h('div', { class: 'topic__head' },
          h('span', { class: 'topic__no', text: topic.no }),
          h('h3', { class: 'topic__title', text: topic.title }),
          h('button', {
            class: 'topic__quiz', type: 'button', disabled: ready.length === 0,
            onclick: () => goto(`#/quiz/${topic.id}`),
          }, '문제')),
        h('div', { class: 'sec-list' },
          topic.sections.map((sec) => sectionRow(sec, goto)))));
    }
    view.append(box);
  }

  view.append(h('div', { class: 'btn-row', style: 'margin-top:6px' },
    h('button', { class: 'btn btn--primary btn--block', type: 'button',
      onclick: () => goto('#/quiz/all') }, '전범위 문제풀기')));

  return view;
}

function sectionRow(sec, goto) {
  if (!sec.ready) {
    return h('div', { class: 'sec is-soon' },
      h('span', { class: 'sec__no', text: sec.no }),
      h('span', { class: 'sec__title', text: sec.title }),
      h('span', { class: 'sec__pg', text: '준비 중' }));
  }
  return h('button', {
    class: 'sec', type: 'button', onclick: () => goto(`#/s/${sec.id}`),
  },
    h('span', { class: 'sec__no', text: sec.no }),
    h('span', { class: 'sec__title', text: sec.title }),
    h('span', { class: 'sec__pg', text: pageLabel(sec.pages) }),
    h('span', { class: 'sec__arrow', text: '›' }));
}
