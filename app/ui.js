/** 화면을 만들 때 되풀이되는 잔일들. */

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function esc(s = '') {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 교과서의 굵은 키워드 표기(**...**)를 하이라이트로 바꾼다. */
export function renderKeywords(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>');
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
export const circled = (i) => CIRCLED[i] ?? `(${i + 1})`;

/**
 * 실제 시험지처럼 부정 발문을 눈에 띄게 만든다.
 * 부정 발문을 놓쳐서 틀리는 건 실력이 아니라 화면 탓이다.
 */
export function renderStem(stem, negative) {
  const safe = esc(stem);
  if (!negative) return safe;
  return safe.replace(/(옳지\s*않은|적절하지\s*않은|알맞지\s*않은|틀린)/g,
    '<span class="neg">$1</span>');
}

export function pageLabel(pages) {
  if (!pages) return '';
  const [a, b] = Array.isArray(pages) ? pages : [pages, pages];
  return a === b ? `${a}쪽` : `${a}~${b}쪽`;
}

export function meter(ratio, ok = false) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return h('div', { class: `meter${ok ? ' meter--ok' : ''}` }, h('i', { style: `width:${pct}%` }));
}

export function empty(title, body, action) {
  return h('div', { class: 'empty' }, h('h3', { text: title }), h('p', { text: body }), action);
}

/** 답안 채점을 위한 느슨한 비교 — 띄어쓰기와 문장 부호 차이는 넘어간다. */
export function normalizeAnswer(s = '') {
  return String(s)
    .normalize('NFC')
    .replace(/[\s·.,''"“”‘’()（）]/g, '')
    .toLowerCase()
    .trim();
}

export function answerMatches(input, accepted = []) {
  const got = normalizeAnswer(input);
  if (!got) return false;
  return accepted.some((a) => normalizeAnswer(a) === got);
}

let lightboxEl;
export function openImage(src, caption = '') {
  lightboxEl ??= document.getElementById('lightbox');
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightboxImg').alt = caption;
  document.getElementById('lightboxCap').textContent = caption;
  lightboxEl.hidden = false;
}

export function initLightbox() {
  const box = document.getElementById('lightbox');
  box.addEventListener('click', (e) => {
    if (e.target === box || e.target.closest('.lightbox__close')) box.hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') box.hidden = true;
  });
}

/** 이미지를 누르면 크게 보이도록. 교과서 그림은 세부까지 시험에 나온다. */
export function zoomable(img, caption) {
  img.addEventListener('click', () => openImage(img.src, caption));
  return img;
}

export function shuffle(list, seed = Date.now()) {
  const arr = [...list];
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
