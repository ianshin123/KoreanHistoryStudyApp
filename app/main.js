/** 앱 시작점과 라우터. */

import { loadToc, buildIndex } from './data.js';
import { h, initLightbox } from './ui.js';
import { initScope, currentScope, renderChip } from './scope.js';
import { renderStudy, applyReadingPrefs } from './study.js';
import { renderQuiz, clearSession } from './quiz.js';
import { renderHome, renderCoverage, renderSettings } from './views.js';

const ROUTES = {
  '#/home': renderHome,
  '#/study': renderStudy,
  '#/quiz': renderQuiz,
  '#/coverage': renderCoverage,
  '#/settings': renderSettings,
};

let ctx;
const view = document.getElementById('view');

function goto(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render() {
  const route = ROUTES[location.hash] ? location.hash : '#/home';
  // 문제 화면을 벗어나면 풀던 세션을 버린다. 돌아왔을 때 중간부터 시작하면 헷갈린다.
  if (route !== '#/quiz' && lastRoute === '#/quiz') clearSession();
  lastRoute = route;

  for (const a of document.querySelectorAll('.tabbar a')) {
    a.toggleAttribute('aria-current', a.getAttribute('href') === route);
    if (a.getAttribute('href') === route) a.setAttribute('aria-current', 'page');
  }

  try {
    view.replaceChildren(ROUTES[route](ctx, currentScope(), goto));
  } catch (err) {
    console.error(err);
    view.replaceChildren(h('div', { class: 'empty' },
      h('h3', { text: '화면을 그리지 못했습니다' }),
      h('p', { class: 'tiny muted', text: err.message })));
  }
  applyReadingPrefs();
  window.scrollTo({ top: 0 });
}

let lastRoute = null;

async function boot() {
  view.replaceChildren(h('div', { class: 'empty' }, h('p', { text: '불러오는 중…' })));
  try {
    const toc = await loadToc();
    const index = await buildIndex(toc);
    ctx = { toc, index };
  } catch (err) {
    view.replaceChildren(h('div', { class: 'empty' },
      h('h3', { text: '콘텐츠를 불러오지 못했습니다' }),
      h('p', { class: 'tiny muted', text: err.message })));
    return;
  }

  initLightbox();
  initScope(ctx, goto);
  renderChip();
  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/home';
  render();
}

boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // 오프라인 기능만 빠질 뿐, 앱 자체는 그대로 쓸 수 있다.
    });
  });
}
