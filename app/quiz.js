/**
 * 문제 모드.
 *
 * 실제 시험을 닮게 만드는 데 두 가지를 신경 썼다.
 *  - 자료 제시형: 사료·그래프·사진을 먼저 보여 주고 발문을 던진다.
 *  - 부정 발문: '옳지 않은'을 눈에 띄게 표시한다. 이걸 놓쳐서 틀리는 건
 *    실력 문제가 아니라 화면 탓이다.
 * 서술형은 정적 사이트라 자동 채점이 불가능하므로, 실제 학교 채점 기준표와
 * 같은 방식(모범답안 + 배점별 체크리스트)으로 스스로 매기게 한다.
 */

import { resolve } from './data.js';
import { h, circled, renderStem, zoomable, answerMatches, meter, shuffle } from './ui.js';
import * as store from './store.js';
import { openSpread } from './study.js';

const FORMAT_LABEL = {
  'source-pos': '자료 제시', 'source-neg': '자료 제시', compare: '자료 비교',
  graph: '그래프 분석', map: '지도', 'image-id': '사진 식별', 'image-ctx': '사진',
  order: '순서 배열', timeline: '시기 찾기', cloze: '빈칸', short: '단답형',
  ox: 'O·X', essay: '서술형',
};

let session = null;

export function startSession(ctx, scope, opts = {}) {
  const { questions } = resolve(ctx.index, scope);
  let pool = questions;

  if (opts.mode === 'due') pool = pool.filter((q) => store.isDue(q.id));
  if (opts.mode === 'wrong') pool = pool.filter((q) => store.srsOf(q.id)?.lastCorrect === false);
  if (opts.mode === 'margin') pool = pool.filter((q) => (q.tier ?? 2) <= 1);

  session = {
    queue: shuffle(pool),
    at: 0,
    right: 0,
    answered: new Map(),
    mode: opts.mode ?? 'all',
  };
  return session;
}

export function hasSession() { return Boolean(session?.queue?.length); }

export function renderQuiz(ctx, scope, goto) {
  if (!session) startSession(ctx, scope);

  if (!session.queue.length) {
    return h('div', { class: 'empty' },
      h('h3', { text: '풀 문제가 없어요' }),
      h('p', { text: emptyReason(session.mode) }),
      h('button', { class: 'btn btn--primary', type: 'button',
        onclick: () => { session = null; goto('#/quiz'); } }, '전체 문항으로 풀기'));
  }

  if (session.at >= session.queue.length) return renderResult(ctx, scope, goto);

  const q = session.queue[session.at];
  const view = h('div');
  view.append(progressBar());
  view.append(questionCard(q, ctx, scope, goto));
  return view;
}

function emptyReason(mode) {
  return {
    due: '오늘 복습할 문항이 없습니다. 잘 하고 있어요.',
    wrong: '틀린 문항이 없습니다.',
    margin: '이 범위에는 주변부 문항이 없습니다.',
  }[mode] ?? '범위를 넓혀 보세요.';
}

function progressBar() {
  const { at, queue, right } = session;
  return h('div', { class: 'q-progress' },
    h('span', { text: `${at + 1} / ${queue.length}` }),
    meter(at / queue.length),
    h('span', { text: `맞힘 ${right}` }));
}

/* ─── 문항 한 개 ───────────────────────────────────────────── */

function questionCard(q, ctx, scope, goto) {
  const card = h('section', { class: 'card' });
  card.append(h('span', { class: 'q-format', text: FORMAT_LABEL[q.format] ?? '문항' }));

  for (const s of q.stimulus ?? []) card.append(stimulus(s));

  card.append(h('p', { class: 'q-stem', html: renderStem(q.stem, q.negative) }));

  const after = h('div');
  const finish = (correct) => {
    store.grade(q.id, correct);
    session.answered.set(q.id, correct);
    if (correct) session.right += 1;
    after.replaceChildren(feedback(q, correct, ctx, scope, goto));
    after.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  if (q.format === 'ox') card.append(oxBody(q, finish));
  else if (q.format === 'essay') card.append(essayBody(q, finish));
  else if (q.format === 'short' || q.format === 'cloze') card.append(shortBody(q, finish));
  else card.append(choiceBody(q, finish));

  card.append(after);
  return card;
}

function stimulus(s) {
  const box = h('div', { class: 'stim' });
  if (s.label) box.append(h('span', { class: 'stim__label', text: s.label }));
  if (s.title) box.append(h('p', {}, h('b', { text: s.title })));

  if (s.kind === 'figure' && s.img) {
    box.append(zoomable(h('img', { src: s.img, alt: s.alt ?? '', loading: 'lazy' }), s.caption ?? s.alt ?? ''));
    if (s.caption) box.append(h('p', { class: 'tiny muted', text: s.caption }));
  } else if (s.kind === 'list') {
    box.append(h('ol', {}, (s.items ?? []).map((t) => h('li', { text: t }))));
  } else {
    if (s.text) box.append(h('div', { class: 'stim__text', text: s.text }));
  }
  if (s.cite) box.append(h('p', { class: 'stim__cite', text: `— ${s.cite}` }));
  return box;
}

function choiceBody(q, finish) {
  const list = h('ul', { class: 'choices' });
  const buttons = [];

  q.choices.forEach((text, i) => {
    const btn = h('button', {
      class: 'choice', type: 'button',
      onclick: () => {
        if (buttons.some((b) => b.disabled)) return;
        const correct = i === q.answer;
        for (const [j, b] of buttons.entries()) {
          b.disabled = true;
          if (j === q.answer) b.classList.add('is-correct');
          else if (j === i) b.classList.add('is-wrong');
          const why = q.distractors?.[String(j)];
          if (why && (j === i || j === q.answer)) {
            b.querySelector('.choice__main').append(h('span', { class: 'choice__why', text: why }));
          }
        }
        finish(correct);
      },
    },
      h('span', { class: 'choice__no', text: circled(i) }),
      h('span', { class: 'choice__main' }, h('span', { text })));
    buttons.push(btn);
    list.append(h('li', {}, btn));
  });
  return list;
}

function oxBody(q, finish) {
  const row = h('div', { class: 'btn-row' });
  const pick = (value) => {
    for (const b of row.children) b.disabled = true;
    finish(value === q.answer);
  };
  row.append(
    h('button', { class: 'btn', type: 'button', onclick: () => pick(true) }, '⭕ 맞다'),
    h('button', { class: 'btn', type: 'button', onclick: () => pick(false) }, '❌ 아니다'));
  return row;
}

function shortBody(q, finish) {
  const slots = q.answers ?? [];
  const inputs = slots.map((_, i) =>
    h('input', { class: 'answer-input', type: 'text', inputmode: 'text',
      placeholder: slots.length > 1 ? `${['㉠', '㉡', '㉢'][i] ?? i + 1}에 들어갈 말` : '답을 입력하세요',
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }));

  const wrap = h('div', {}, ...inputs.map((el) => h('div', { style: 'margin-bottom:8px' }, el)));
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'button',
    onclick: () => {
      const results = slots.map((accepted, i) => answerMatches(inputs[i].value, accepted));
      for (const [i, el] of inputs.entries()) {
        el.disabled = true;
        el.style.borderColor = results[i] ? 'var(--ok)' : 'var(--bad)';
      }
      submit.disabled = true;
      wrap.append(h('p', { class: 'tiny muted', style: 'margin-top:6px' },
        `정답: ${slots.map((a) => a[0]).join(' / ')}`));
      finish(results.every(Boolean));
    } }, '채점하기');

  for (const el of inputs) {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit.click(); });
  }
  wrap.append(submit);
  return wrap;
}

/**
 * 서술형. 채점 기준을 하나씩 짚어 보게 만드는 편이,
 * 두루뭉술하게 '맞은 것 같다'고 넘기는 것보다 실제 시험에 가깝다.
 */
function essayBody(q, finish) {
  const area = h('textarea', { class: 'answer-input', placeholder: '답안을 써 보세요. 제출하면 모범답안과 채점 기준이 나옵니다.' });
  const wrap = h('div', {}, area);

  wrap.append(h('button', { class: 'btn btn--primary btn--block', type: 'button', style: 'margin-top:10px',
    onclick: (e) => {
      e.target.remove();
      area.disabled = true;
      wrap.append(gradingSheet(q, finish));
    } }, '제출하고 모범답안 보기'));
  return wrap;
}

function gradingSheet(q, finish) {
  const total = q.rubric.reduce((sum, r) => sum + r.points, 0);
  const sheet = h('div', { class: 'explain', style: 'margin-top:12px' },
    h('h4', { text: '모범답안' }),
    h('p', { text: q.model }));

  const line = h('p', { class: 'score-line' });
  const boxes = [];
  const recount = () => {
    const got = q.rubric.reduce((sum, r, i) => sum + (boxes[i].checked ? r.points : 0), 0);
    line.textContent = `자가 채점 ${got} / ${total}점`;
    return got;
  };

  const list = h('ul', { class: 'rubric' },
    q.rubric.map((r, i) => {
      const cb = h('input', { type: 'checkbox', onchange: recount });
      boxes.push(cb);
      return h('li', {}, cb, h('span', { text: r.text }), h('span', { class: 'pt', text: `${r.points}점` }));
    }));

  sheet.append(h('h4', { text: '채점 기준 — 들어갔는지 직접 확인하세요', style: 'margin-top:12px' }), list, line);
  recount();

  sheet.append(h('button', { class: 'btn btn--block', type: 'button', style: 'margin-top:12px',
    onclick: (e) => {
      e.target.disabled = true;
      for (const b of boxes) b.disabled = true;
      // 배점의 60% 이상을 채웠으면 맞힌 것으로 보고 복습 간격을 늘린다.
      finish(recount() >= total * 0.6);
    } }, '자가 채점 확정'));
  return sheet;
}

/* ─── 채점 뒤 ──────────────────────────────────────────────── */

function feedback(q, correct, ctx, scope, goto) {
  const box = h('div');
  box.append(h('p', { class: `verdict verdict--${correct ? 'ok' : 'bad'}` },
    correct ? '✓ 맞혔어요' : '✗ 틀렸어요'));

  if (q.explain) {
    box.append(h('div', { class: 'explain' },
      h('h4', { text: '해설' }),
      h('p', { text: q.explain })));
  }

  const jump = h('div', { class: 'btn-row', style: 'margin-top:10px' });
  if (q.page) {
    jump.append(h('button', { class: 'btn btn--ghost tiny', type: 'button',
      onclick: () => openSpread(q.page) }, `📖 ${q.page}쪽 원본`));
  }
  jump.append(h('button', { class: 'btn btn--primary', type: 'button',
    onclick: () => { session.at += 1; goto('#/quiz'); } },
    session.at + 1 >= session.queue.length ? '결과 보기' : '다음 문제'));
  box.append(jump);
  return box;
}

function renderResult(ctx, scope, goto) {
  const { right, queue, answered } = session;
  const ratio = queue.length ? right / queue.length : 0;
  const wrong = queue.filter((q) => answered.get(q.id) === false);

  const view = h('div', {},
    h('section', { class: 'card center' },
      h('p', { class: 'section-title', text: '채점 결과' }),
      h('p', { style: 'font-size:2.2em;font-weight:800;margin:6px 0' },
        `${right} / ${queue.length}`),
      meter(ratio, ratio >= 0.8),
      h('p', { class: 'tiny muted', style: 'margin-top:10px',
        text: `정답률 ${Math.round(ratio * 100)}%` })));

  if (wrong.length) {
    const list = h('section', { class: 'card' },
      h('p', { class: 'section-title', text: `다시 볼 문항 ${wrong.length}개` }));
    for (const q of wrong) {
      list.append(h('p', { class: 'tiny', style: 'padding:7px 0;border-bottom:1px solid var(--line-soft)' },
        h('b', { text: `${q.page}쪽 · ` }), q.stem.split('\n')[0].slice(0, 60)));
    }
    view.append(list);
  }

  view.append(h('div', { class: 'btn-row', style: 'margin-top:16px' },
    wrong.length && h('button', { class: 'btn btn--primary', type: 'button',
      onclick: () => { session = { queue: shuffle(wrong), at: 0, right: 0, answered: new Map(), mode: 'retry' }; goto('#/quiz'); } },
      '틀린 문항만 다시'),
    h('button', { class: 'btn', type: 'button',
      onclick: () => { session = null; goto('#/quiz'); } }, '새로 풀기'),
    h('button', { class: 'btn btn--ghost', type: 'button',
      onclick: () => { session = null; goto('#/home'); } }, '홈으로')));
  return view;
}

export function clearSession() { session = null; }
