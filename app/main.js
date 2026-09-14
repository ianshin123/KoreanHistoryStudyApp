/** 라우터와 시작점. 화면은 목차 · 소단원 · 문제 · 연표 넷뿐이다. */

import { loadToc, loadFigures, findSection, scopeTitle } from './data.js';
import { h, initLightbox, pageLabel } from './ui.js';
import { renderHome } from './home.js';
import { renderSection } from './section.js';
import { renderQuiz, resetQuiz } from './quiz.js';
import { renderTimeline } from './timeline.js';

const view = document.getElementById('view');
const topbar = document.getElementById('topbar');
let ctx;

function goto(hash) {
  // 같은 주소면 hashchange가 안 오므로 직접 다시 그린다(문제 다음 장 넘기기 등).
  if (location.hash === hash) render();
  else location.hash = hash;
}

/** `#/s/1-01-2/data` 같은 주소를 조각으로 나눈다. */
function parse() {
  const parts = (location.hash || '#/home').replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name: parts[0] || 'home', a: parts[1], b: parts[2] };
}

function setTop({ title, sub, back } = {}) {
  // replaceChildren는 undefined를 "undefined" 글자로 넣어 버리므로 미리 걸러낸다.
  const parts = [
    back && h('button', { class: 'topbar__back', type: 'button',
      'aria-label': '뒤로', onclick: () => goto(back) }, '‹'),
    title && h('span', { class: 'topbar__title', text: title }),
    sub && h('span', { class: 'topbar__sub', text: sub }),
  ].filter(Boolean);
  topbar.replaceChildren(...parts);
}

async function render() {
  const { name, a, b } = parse();
  for (const el of document.querySelectorAll('.tabbar a')) {
    const tab = el.dataset.tab;
    const on = (tab === 'timeline' && name === 'timeline') || (tab === 'home' && name !== 'timeline');
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }

  try {
    if (name === 'timeline') {
      setTop({ title: '연표', sub: '전범위' });
      view.replaceChildren(await renderTimeline(ctx, goto));
    } else if (name === 's' && a) {
      const meta = findSection(ctx.toc, a);
      if (!meta) throw new Error('없는 소단원입니다.');
      setTop({ title: meta.title, sub: pageLabel(meta.pages), back: '#/home' });
      view.replaceChildren(await renderSection(ctx, a, b ?? 'note', goto));
    } else if (name === 'quiz' && a) {
      setTop({ title: scopeTitle(ctx.toc, a), sub: '문제', back: backFromQuiz(a) });
      view.replaceChildren(await renderQuiz(ctx, a, goto));
    } else {
      resetQuiz();
      setTop();   // 목차 화면은 자체 제목이 있어 상단 바를 비운다

      view.replaceChildren(await renderHome(ctx, goto));
    }
  } catch (err) {
    console.error(err);
    view.replaceChildren(h('div', { class: 'empty' },
      h('h3', { text: '화면을 그리지 못했습니다' }),
      h('p', { class: 'tiny muted', text: err.message })));
  }
  window.scrollTo({ top: 0 });
}

function backFromQuiz(scopeId) {
  // 소단원 문제였다면 그 소단원으로, 중단원·전범위였다면 목차로 돌아간다.
  return findSection(ctx.toc, scopeId) ? `#/s/${scopeId}/quiz` : '#/home';
}

async function boot() {
  view.replaceChildren(h('div', { class: 'empty' }, h('p', { text: '불러오는 중…' })));
  try {
    const toc = await loadToc();
    await loadFigures();
    ctx = { toc };
  } catch (err) {
    view.replaceChildren(h('div', { class: 'empty' },
      h('h3', { text: '콘텐츠를 불러오지 못했습니다' }),
      h('p', { class: 'tiny muted', text: err.message })));
    return;
  }
  initLightbox();
  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/home';
  render();
}

boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
