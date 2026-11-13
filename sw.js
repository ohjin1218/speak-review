/* 오프라인용: 앱 파일을 기기에 저장해 두고 인터넷 없이도 켜지게 한다.
   앱 파일을 고치면 VERSION 숫자를 올린다. */
const VERSION = 'speak-v3';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'grade.js', 'logic.js', 'store.js', 'data.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// 인터넷이 되면 새 파일을 받아 저장하고, 안 되면 저장해 둔 파일을 쓴다
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
