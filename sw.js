/**
 * 오프라인용 서비스 워커.
 *
 * 앱 껍데기와 목차만 미리 받아 두고, 소단원 콘텐츠·그림·펼침면 원본은
 * 실제로 열어 본 것만 저장한다. 그림이 12MB를 넘어서 전부 미리 받으면
 * 설치가 너무 무겁기 때문이다. 한 번 본 단원은 그 뒤로 오프라인에서도 열린다.
 */

const VERSION = 'khs-v2';
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'styles/main.css',
  'app/main.js',
  'app/data.js',
  'app/ui.js',
  'app/home.js',
  'app/section.js',
  'app/quiz.js',
  'app/timeline.js',
  'data/toc.json',
  'data/figures.json',
  'assets/icon/icon-180.png',
  'assets/icon/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      // 하나가 없어도 설치 전체가 실패하지 않도록 개별로 담는다.
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('index.html', { ignoreSearch: true })));
    return;
  }

  const bucket = /\/(assets|data)\//.test(url.pathname) ? DATA : SHELL;
  event.respondWith(cacheFirst(request, bucket));
});

async function cacheFirst(request, cacheName) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (hit) {
    fetchAndStore(request, cacheName).catch(() => {});   // 뒤에서 조용히 갱신
    return hit;
  }
  return fetchAndStore(request, cacheName);
}

async function fetchAndStore(request, cacheName) {
  const res = await fetch(request);
  if (res.ok) (await caches.open(cacheName)).put(request, res.clone());
  return res;
}
