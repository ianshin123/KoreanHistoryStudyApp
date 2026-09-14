/** 홈 · 커버리지 · 설정 화면. */

import { resolve, describeScope } from './data.js';
import { h, meter, pageLabel } from './ui.js';
import * as store from './store.js';
import { startSession } from './quiz.js';
import { openSpread } from './study.js';

/* ─── 홈 ───────────────────────────────────────────────────── */

export function renderHome(ctx, scope, goto) {
  const { blocks, questions } = resolve(ctx.index, scope);
  const left = store.daysLeft();
  const seen = blocks.filter((b) => store.hasSeen(b.key)).length;
  const due = questions.filter((q) => store.isDue(q.id)).length;
  const known = questions.filter((q) => (store.srsOf(q.id)?.box ?? 0) >= 3).length;

  const view = h('div');

  view.append(h('section', { class: 'card' },
    left == null
      ? h('div', {},
          h('p', { class: 'section-title', text: '시험일' }),
          h('p', { class: 'muted tiny', text: '설정에서 시험일을 정하면 남은 날짜에 맞춰 복습 간격을 조절합니다.' }),
          h('button', { class: 'btn btn--ghost btn--block', type: 'button', style: 'margin-top:8px',
            onclick: () => goto('#/settings') }, '시험일 정하기'))
      : h('div', { class: 'dday' },
          h('span', { class: 'dday__num', text: left > 0 ? `D-${left}` : left === 0 ? 'D-DAY' : `D+${-left}` }),
          h('span', { class: 'muted tiny', text: store.settings().dday })),
    h('div', { class: 'stat-row' },
      stat(blocks.length ? seen / blocks.length : 0, `${seen}/${blocks.length}`, '학습'),
      stat(questions.length ? known / questions.length : 0, `${known}/${questions.length}`, '익힘'),
      stat(0, String(due), '오늘 복습'))));

  view.append(h('section', { class: 'card' },
    h('p', { class: 'section-title', text: '지금 할 일' }),
    h('p', { class: 'tiny muted', style: 'margin-bottom:10px',
      text: describeScope(ctx.toc, ctx.index, scope) }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => goto('#/study') }, '학습하기'),
      h('button', { class: 'btn', type: 'button',
        onclick: () => { startSession(ctx, scope); goto('#/quiz'); } }, '문제풀기')),
    h('div', { class: 'btn-row', style: 'margin-top:8px' },
      due > 0 && h('button', { class: 'btn btn--ghost', type: 'button',
        onclick: () => { startSession(ctx, scope, { mode: 'due' }); goto('#/quiz'); } },
        `오늘의 복습 ${due}`),
      h('button', { class: 'btn btn--ghost', type: 'button',
        onclick: () => { startSession(ctx, scope, { mode: 'margin' }); goto('#/quiz'); } },
        '구석구석 모드'),
      h('button', { class: 'btn btn--ghost', type: 'button',
        onclick: () => { startSession(ctx, scope, { mode: 'wrong' }); goto('#/quiz'); } },
        '오답노트'))));

  view.append(h('section', { class: 'card' },
    h('p', { class: 'section-title', text: '구석구석 모드란?' }),
    h('p', { class: 'tiny muted' },
      '본문에서 문제가 많이 나오지만, 그림·인물·여백 용어·사료에서도 몇 문제는 나옵니다. ',
      '이 모드는 그 주변부 항목만 따로 모아 돌립니다. 적게 나온다고 안 보고 넘어가지 않도록 만든 장치입니다.')));

  view.append(planCard(left));
  view.append(readyCard(ctx, goto));
  return view;
}

function stat(ratio, big, label) {
  return h('div', { class: 'stat' },
    h('b', { text: big }), h('span', { text: label }),
    ratio > 0 ? meter(ratio) : null);
}

function planCard(left) {
  const steps = [
    { when: '이해', what: '중단원 하나씩 · 교과서순으로 학습 → 소단원 퀴즈', from: 22 },
    { when: '정착', what: '대단원 범위 · 오늘의 복습 + 구석구석 모드', from: 14 },
    { when: '종합', what: '전범위 · 인물별·사건별로 다시 묶어 보기 + 오답노트', from: 6 },
    { when: '점검', what: '커버리지 보드의 회색 칸 지우기', from: 0 },
  ];
  const now = left == null ? null : steps.findLast((s) => left <= s.from) ?? steps[0];

  return h('section', { class: 'card' },
    h('p', { class: 'section-title', text: '공부 단계' }),
    steps.map((s) => h('div', { class: 'plan-step' },
      h('span', { class: 'plan-step__when', text: s.when }),
      h('span', {
        class: 'plan-step__what',
        style: now && now.when === s.when ? 'font-weight:700' : 'opacity:.62',
        text: s.what,
      }))));
}

function readyCard(ctx, goto) {
  const all = ctx.index.ready;
  const total = ctx.toc.units.flatMap((u) => u.topics).flatMap((t) => t.sections).length;
  return h('section', { class: 'card' },
    h('p', { class: 'section-title', text: `콘텐츠 준비 상황 ${all.length} / ${total} 소단원` }),
    meter(all.length / total),
    h('p', { class: 'tiny muted', style: 'margin-top:10px' },
      '준비된 소단원부터 바로 공부할 수 있습니다. 나머지는 대주제 단위로 채워 나갑니다.'),
    all.map((s) => h('p', { class: 'tiny', style: 'margin:6px 0 0' },
      h('b', { text: `${s.topicNo}-${s.no} ` }), `${s.title} · ${pageLabel(s.pages)}`)));
}

/* ─── 커버리지 보드 ─────────────────────────────────────────── */

export function renderCoverage(ctx, scope, goto) {
  const { blocks, questions } = resolve(ctx.index, scope);
  if (!blocks.length) {
    return h('div', { class: 'empty' }, h('h3', { text: '범위가 비어 있어요' }),
      h('p', { text: '위쪽 범위 칩에서 단원을 골라 주세요.' }));
  }

  const qByBlock = new Map();
  for (const q of questions) {
    for (const ref of q.refs ?? []) {
      const key = `${q.sectionId}#${ref}`;
      if (!qByBlock.has(key)) qByBlock.set(key, []);
      qByBlock.get(key).push(q.id);
    }
  }

  const cells = blocks.map((b) => ({ b, status: store.statusOf(b.key, qByBlock.get(b.key) ?? []) }));
  const remaining = cells.filter((c) => c.status === 'new').length;

  const view = h('div');
  view.append(h('section', { class: 'card' },
    h('p', { class: 'section-title', text: '커버리지 보드' }),
    h('p', { class: 'tiny muted', style: 'margin-bottom:10px' },
      '범위 안의 모든 항목이 칸 하나씩입니다. ',
      h('b', { text: '회색 칸을 0개로 만드는 것' }),
      '이 시험 준비 완료의 정의입니다.'),
    remaining === 0
      ? h('p', { style: 'color:var(--ok);font-weight:800' }, '✓ 회색 칸이 없습니다. 범위를 한 번씩 다 훑었어요.')
      : h('p', { style: 'font-weight:700' }, `아직 보지 않은 항목 ${remaining}개`),
    h('div', { class: 'cov-legend' },
      legend('var(--line-soft)', '미학습'),
      legend('color-mix(in srgb, var(--brand) 35%, var(--surface))', '학습함'),
      legend('color-mix(in srgb, var(--bad) 40%, var(--surface))', '틀림'),
      legend('var(--ok)', '익힘'))));

  const byPage = new Map();
  for (const c of cells) {
    const p = c.b.page ?? 0;
    if (!byPage.has(p)) byPage.set(p, []);
    byPage.get(p).push(c);
  }

  for (const [page, list] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    const card = h('section', { class: 'card' },
      h('p', { class: 'section-title' },
        `${page}쪽 · 항목 ${list.length}개 `,
        h('button', { class: 'btn btn--ghost tiny', type: 'button',
          style: 'padding:2px 8px;min-height:auto;margin-left:4px',
          onclick: () => openSpread(page) }, '원본')),
      h('div', { class: 'cov-grid' },
        list.map(({ b, status }) =>
          h('button', {
            class: `cov-cell s-${status}`,
            type: 'button',
            title: cellTitle(b),
            onclick: () => openSpread(b.page),
          }, tierMark(b.tier)))));
    view.append(card);
  }
  return view;
}

function legend(color, label) {
  return h('span', {}, h('i', { style: `background:${color}` }), label);
}

function tierMark(tier) {
  return tier === 3 ? '●' : tier === 2 ? '◐' : '○';
}

function cellTitle(b) {
  const kind = { para: '본문', heading: '소제목', source: '사료', figure: '그림',
    term: '용어', vocab: '어휘', box: '읽기 자료', explore: '탐구' }[b.type] ?? b.type;
  const label = b.text ?? b.title ?? b.term ?? b.caption ?? '';
  return `${kind} · ${String(label).slice(0, 40)}`;
}

/* ─── 설정 ─────────────────────────────────────────────────── */

export function renderSettings(ctx, scope, goto) {
  const s = store.settings();
  const view = h('div');

  view.append(h('section', { class: 'card' },
    h('p', { class: 'section-title', text: '시험' }),
    h('div', { class: 'field' },
      h('label', { for: 'dday', text: '시험일' }),
      h('input', { type: 'date', id: 'dday', value: s.dday ?? '',
        onchange: (e) => { store.setSetting('dday', e.target.value || null); goto('#/settings'); } })),
    h('p', { class: 'tiny muted' },
      '시험일을 정하면 복습 간격을 눌러서, 남은 기간 안에 모든 문항이 한 번은 더 돌아오게 만듭니다.')));

  view.append(h('section', { class: 'card' },
    h('p', { class: 'section-title', text: '읽기' }),
    toggle('키워드 강조 표시', 'showKeywords', goto),
    toggle('본문을 명조체로 읽기', 'serif', goto)));

  view.append(h('section', { class: 'card' },
    h('p', { class: 'section-title', text: '진도 백업' }),
    h('p', { class: 'tiny muted', style: 'margin-bottom:10px' },
      '진도는 이 기기의 브라우저에만 저장됩니다. 홈 화면에 추가한 앱은 저장 공간이 통째로 비워지는 일이 있으니, 가끔 내보내 두세요.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: exportProgress }, '내보내기'),
      h('button', { class: 'btn', type: 'button', onclick: () => importProgress(goto) }, '가져오기'))));

  view.append(h('section', { class: 'card' },
    h('p', { class: 'section-title', text: '초기화' }),
    h('button', { class: 'btn btn--block', type: 'button',
      onclick: () => {
        if (!confirm('학습 진도와 복습 기록을 모두 지웁니다. 되돌릴 수 없어요. 계속할까요?')) return;
        store.resetProgress();
        goto('#/settings');
      } }, '진도 초기화')));

  view.append(h('section', { class: 'card' },
    h('p', { class: 'section-title', text: '이 앱에 대해' }),
    h('p', { class: 'tiny muted' },
      '천재교육 『고등 한국사 2』(정요근 외) 8~85쪽을 바탕으로 만든 개인 학습용 도구입니다. ',
      '교과서 본문과 이미지의 저작권은 원저작자에게 있습니다.')));

  return view;
}

function toggle(label, key, goto) {
  return h('div', { class: 'switch-row' },
    h('label', { for: `t-${key}`, text: label }),
    h('input', { type: 'checkbox', id: `t-${key}`, checked: Boolean(store.settings()[key]),
      onchange: (e) => store.setSetting(key, e.target.checked) }));
}

function exportProgress() {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url, download: `한국사학습진도-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importProgress(goto) {
  const input = h('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      store.importJSON(await file.text());
      alert('진도를 불러왔습니다.');
      goto('#/home');
    } catch (err) {
      alert(`불러오지 못했습니다. ${err.message}`);
    }
  });
  input.click();
}
