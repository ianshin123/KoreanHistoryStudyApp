/** 화면을 만들 때 되풀이되는 잔일들. */

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
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

/** **핵심어**를 굵게. 정리 노트에서 눈이 먼저 가야 할 곳을 표시한다. */
export function bold(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
export const circled = (i) => CIRCLED[i] ?? `(${i + 1})`;

/** 실제 시험지처럼 부정 발문을 눈에 띄게. 이걸 놓쳐 틀리는 건 화면 탓이다. */
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

export function normalizeAnswer(s = '') {
  return String(s).normalize('NFC')
    .replace(/[\s·.,''"“”‘’()（）]/g, '').toLowerCase().trim();
}

export function answerMatches(input, accepted = []) {
  const got = normalizeAnswer(input);
  return got ? accepted.some((a) => normalizeAnswer(a) === got) : false;
}

export function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function openImage(src, caption = '') {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightboxImg').alt = caption;
  document.getElementById('lightboxCap').textContent = caption;
  document.getElementById('lightbox').hidden = false;
}

export function openSpread(page) {
  openImage(`assets/page/p${String(page).padStart(3, '0')}.jpg`, `교과서 ${page}쪽 원본`);
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
