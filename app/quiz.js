/**
 * 문제 모드.
 *
 * 실제 모의고사를 닮게: 사료·그래프·사진을 먼저 보여 주고 발문을 던지며,
 * 부정 발문은 눈에 띄게 표시한다. 서술형은 모범답안과 배점별 채점 기준으로
 * 스스로 매긴다(정적 사이트라 자동 채점이 불가능하고, 실제 채점과도 더 가깝다).
 */

import { h, circled, renderStem, answerMatches, shuffle, openImage } from './ui.js';
import { questionsFor, scopeTitle } from './data.js';

const TAG = {
  'source-pos': '자료 제시', 'source-neg': '자료 제시', compare: '자료 비교',
  graph: '그래프', map: '지도', 'image-id': '사진', 'image-ctx': '사진',
  order: '순서 배열', timeline: '시기', cloze: '빈칸', short: '단답',
  ox: 'O · X', essay: '서술형',
};

let session = null;

export async function renderQuiz(ctx, scopeId, goto) {
  if (!session || session.scopeId !== scopeId) {
    const pool = await questionsFor(ctx.toc, scopeId);
    session = { scopeId, queue: shuffle(pool), at: 0, right: 0, wrong: [] };
  }

  if (!session.queue.length) {
    return h('div', { class: 'empty' },
      h('h3', { text: '문항이 아직 없어요' }),
      h('p', { text: `${scopeTitle(ctx.toc, scopeId)} 문항은 준비 중입니다.` }));
  }
  if (session.at >= session.queue.length) return result(ctx, goto);

  const q = session.queue[session.at];
  const view = h('div');
  view.append(h('div', { class: 'qbar' },
    h('span', { text: `${session.at + 1} / ${session.queue.length}` }),
    h('div', { class: 'track' },
      h('i', { style: `width:${(session.at / session.queue.length) * 100}%` })),
    h('span', { text: `맞힘 ${session.right}` })));
  view.append(card(q, goto));
  return view;
}

export function resetQuiz() { session = null; }

/** 제시 자료가 없는데 '자료 제시'라고 붙으면 헷갈린다. 실제 모양대로 이름 붙인다. */
function tagOf(q) {
  const hasStimulus = (q.stimulus ?? []).length > 0;
  if (!hasStimulus && (q.format === 'source-pos' || q.format === 'source-neg')) {
    return q.negative ? '옳지 않은 것' : '개념';
  }
  return TAG[q.format] ?? '문항';
}

function card(q, goto) {
  const box = h('section', { class: 'qcard' });
  box.append(h('span', { class: 'qtag', text: tagOf(q) }));
  for (const s of q.stimulus ?? []) box.append(stimulus(s));
  box.append(h('p', { class: 'qstem', html: renderStem(q.stem, q.negative) }));

  const after = h('div');
  const done = (correct) => {
    session.right += correct ? 1 : 0;
    if (!correct) session.wrong.push(q);
    after.replaceChildren(feedback(q, correct, goto));
    after.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  if (q.format === 'ox') box.append(ox(q, done));
  else if (q.format === 'essay') box.append(essay(q, done));
  else if (q.format === 'short' || q.format === 'cloze') box.append(short(q, done));
  else box.append(choices(q, done));

  box.append(after);
  return box;
}

function stimulus(s) {
  const box = h('div', { class: 'stim' });
  if (s.label) box.append(h('span', { class: 'stim__l', text: s.label }));
  if (s.title) box.append(h('p', {}, h('b', { text: s.title })));
  if (s.kind === 'figure' && s.img) {
    const img = h('img', { src: s.img, alt: s.alt ?? '', loading: 'lazy' });
    img.addEventListener('click', () => openImage(s.img, s.caption ?? s.alt ?? ''));
    box.append(img);
    if (s.caption) box.append(h('p', { class: 'tiny muted', text: s.caption }));
  } else if (s.kind === 'list') {
    box.append(h('ol', {}, (s.items ?? []).map((t) => h('li', { text: t }))));
  } else if (s.text) {
    box.append(h('div', { class: 'stim__t', text: s.text }));
  }
  if (s.cite) box.append(h('p', { class: 'stim__c', text: `— ${s.cite}` }));
  return box;
}

function choices(q, done) {
  const list = h('div', { class: 'choices' });
  const btns = [];
  q.choices.forEach((text, i) => {
    const b = h('button', { class: 'choice', type: 'button', onclick: () => {
      if (btns[0].disabled) return;
      for (const [j, x] of btns.entries()) {
        x.disabled = true;
        if (j === q.answer) x.classList.add('is-correct');
        else if (j === i) x.classList.add('is-wrong');
        const why = q.distractors?.[String(j)];
        if (why && (j === i || j === q.answer)) {
          x.querySelector('.choice__m').append(h('span', { class: 'choice__why', text: why }));
        }
      }
      done(i === q.answer);
    } },
      h('span', { class: 'choice__n', text: circled(i) }),
      h('span', { class: 'choice__m' }, h('span', { text })));
    btns.push(b);
    list.append(b);
  });
  return list;
}

function ox(q, done) {
  const row = h('div', { class: 'btn-row' });
  const pick = (v) => { for (const b of row.children) b.disabled = true; done(v === q.answer); };
  row.append(
    h('button', { class: 'btn', type: 'button', onclick: () => pick(true) }, '⭕ 맞다'),
    h('button', { class: 'btn', type: 'button', onclick: () => pick(false) }, '❌ 아니다'));
  return row;
}

function short(q, done) {
  const slots = q.answers ?? [];
  const marks = ['㉠', '㉡', '㉢', '㉣'];
  const inputs = slots.map((_, i) => h('input', {
    class: 'ansin', type: 'text', autocomplete: 'off', spellcheck: 'false',
    placeholder: slots.length > 1 ? `${marks[i] ?? i + 1}에 들어갈 말` : '답을 입력하세요',
  }));
  const wrap = h('div', {}, ...inputs.map((el) => h('div', { style: 'margin-bottom:8px' }, el)));
  const go = h('button', { class: 'btn btn--primary btn--block', type: 'button', onclick: () => {
    const ok = slots.map((acc, i) => answerMatches(inputs[i].value, acc));
    inputs.forEach((el, i) => {
      el.disabled = true;
      el.style.borderColor = ok[i] ? 'var(--ok)' : 'var(--bad)';
    });
    go.disabled = true;
    wrap.append(h('p', { class: 'tiny muted', text: `정답: ${slots.map((a) => a[0]).join(' / ')}` }));
    done(ok.every(Boolean));
  } }, '채점하기');
  for (const el of inputs) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
  wrap.append(go);
  return wrap;
}

function essay(q, done) {
  const area = h('textarea', { class: 'ansin', placeholder: '답안을 써 보세요. 제출하면 모범답안과 채점 기준이 나옵니다.' });
  const wrap = h('div', {}, area);
  wrap.append(h('button', { class: 'btn btn--primary btn--block', type: 'button',
    style: 'margin-top:10px', onclick: (e) => {
      e.target.remove();
      area.disabled = true;
      wrap.append(rubric(q, done));
    } }, '제출하고 모범답안 보기'));
  return wrap;
}

function rubric(q, done) {
  const total = q.rubric.reduce((s, r) => s + r.points, 0);
  const sheet = h('div', { class: 'explain', style: 'margin-top:12px' },
    h('h4', { text: '모범답안' }), h('p', { text: q.model }));

  const line = h('p', { class: 'score' });
  const boxes = [];
  const count = () => {
    const got = q.rubric.reduce((s, r, i) => s + (boxes[i].checked ? r.points : 0), 0);
    line.textContent = `자가 채점 ${got} / ${total}점`;
    return got;
  };
  const list = h('ul', { class: 'rubric' }, q.rubric.map((r) => {
    const cb = h('input', { type: 'checkbox', onchange: count });
    boxes.push(cb);
    return h('li', {}, cb, h('span', { text: r.text }), h('span', { class: 'pt', text: `${r.points}점` }));
  }));

  sheet.append(h('h4', { style: 'margin-top:12px', text: '채점 기준 — 들어갔는지 직접 확인하세요' }), list, line);
  count();
  sheet.append(h('button', { class: 'btn btn--block', type: 'button', style: 'margin-top:12px',
    onclick: (e) => {
      e.target.disabled = true;
      for (const b of boxes) b.disabled = true;
      done(count() >= total * 0.6);
    } }, '자가 채점 확정'));
  return sheet;
}

function feedback(q, correct, goto) {
  const box = h('div');
  box.append(h('p', { class: `verdict verdict--${correct ? 'ok' : 'bad'}`,
    text: correct ? '✓ 맞혔어요' : '✗ 틀렸어요' }));
  if (q.explain) {
    box.append(h('div', { class: 'explain' }, h('h4', { text: '해설' }), h('p', { text: q.explain })));
  }
  box.append(h('div', { class: 'btn-row', style: 'margin-top:10px' },
    q.page && h('button', { class: 'btn', type: 'button',
      onclick: () => import('./ui.js').then((m) => m.openSpread(q.page)) }, `${q.page}쪽 원본`),
    h('button', { class: 'btn btn--primary', type: 'button', onclick: () => {
      session.at += 1;
      goto(location.hash);
    } }, session.at + 1 >= session.queue.length ? '결과 보기' : '다음 문제')));
  return box;
}

function result(ctx, goto) {
  const { right, queue, wrong, scopeId } = session;
  const pct = Math.round((right / queue.length) * 100);
  const view = h('div');

  view.append(h('div', { class: 'result' },
    h('p', { class: 'tiny muted', text: scopeTitle(ctx.toc, scopeId) }),
    h('p', { class: 'big', text: `${right} / ${queue.length}` }),
    h('p', { class: 'muted', text: `정답률 ${pct}%` })));

  if (wrong.length) {
    view.append(h('h3', { class: 'note__h', style: 'margin-top:22px',
      text: `다시 볼 문항 ${wrong.length}개` }));
    view.append(h('ul', { class: 'note' }, wrong.map((q) =>
      h('li', { style: 'padding:8px 0;border-bottom:1px solid var(--line-2);font-size:.86rem' },
        h('b', { text: `${q.page}쪽 · ` }), q.stem.split('\n')[0].slice(0, 64)))));
  }

  view.append(h('div', { class: 'btn-row', style: 'margin-top:18px' },
    wrong.length && h('button', { class: 'btn btn--primary', type: 'button', onclick: () => {
      session = { scopeId, queue: shuffle(wrong), at: 0, right: 0, wrong: [] };
      goto(location.hash);
    } }, '틀린 문항 다시'),
    h('button', { class: 'btn', type: 'button', onclick: () => {
      session = null;
      goto(location.hash);
    } }, '새로 풀기'),
    h('button', { class: 'btn', type: 'button', onclick: () => { session = null; goto('#/home'); } },
      '목차로')));
  return view;
}
