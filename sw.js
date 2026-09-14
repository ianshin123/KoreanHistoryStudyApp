/**
 * 오프라인 학습을 위한 서비스 워커.
 *
 * 앱 껍데기와 콘텐츠(JSON·그림)는 미리 받아 둔다. 다만 펼침면 원본 이미지는
 * 용량이 커서 선캐시에서 빼고, 실제로 열어 본 쪽만 그때그때 저장한다.
 * 시험 전에 지하철에서 데이터 없이도 공부가 되어야 하기 때문이다.
 */

const VERSION = 'khs-v1';
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'styles/main.css',
  'app/main.js',
  'app/data.js',
  'app/store.js',
  'app/ui.js',
  'app/scope.js',
  'app/study.js',
  'app/quiz.js',
  'app/views.js',
  'data/toc.json',
  'data/sections/1-01-2.json',
  'data/questions/1-01-2.json',
  'assets/icon/icon-180.png',
  'assets/icon/icon-192.png',
  'assets/icon/icon-512.png',
  'assets/img/p013-f01.jpg',
  'assets/img/p013-f02.jpg',
  'assets/img/p013-f03.jpg',
  'assets/img/p014-f01.jpg',
  'assets/img/p015-v01.jpg',
  'assets/img/p015-v02.jpg',
  'assets/img/p015-v04.jpg',
  'assets/img/p015-v05.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      // 파일 하나가 없어도 설치 전체가 실패하지 않게 개별로 담는다.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // 펼침면 원본은 본 것만 모아 둔다(런타임 캐시).
  if (url.pathname.includes('/assets/page/')) {
    event.respondWith(cacheThenNetwork(request, PAGES));
    return;
  }

  // 새로고침으로 들어온 화면은 오프라인이면 저장해 둔 껍데기를 돌려준다.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('index.html', { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(cacheThenNetwork(request, SHELL));
});

async function cacheThenNetwork(request, cacheName) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) {
    // 콘텐츠가 갱신될 수 있으니 뒤에서 조용히 새로 받아 둔다.
    fetchAndStore(request, cacheName).catch(() => {});
    return cached;
  }
  return fetchAndStore(request, cacheName);
}

async function fetchAndStore(request, cacheName) {
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}
