var CACHE_NAME = '64pad-v6.7.44';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=6.7.44',
  'pad-core/data.js?v=6.7.44',
  'pad-core/theory.js?v=6.7.44',
  'pad-core/render.js?v=6.7.44',
  'pad-core/circle.js?v=6.7.44',
  'pad-core/builder-ui.js?v=6.7.44',
  'pad-core/incremental.js?v=6.7.44',
  'data.js?v=6.7.44',
  'host-adapter.js?v=6.7.44',
  'audio-core/audio-master.js?v=6.7.44',
  'audio-core/audio-effects.js?v=6.7.44',
  'audio-core/audio-reverb.js?v=6.7.44',
  'audio-core/audio-sampler.js?v=6.7.44',
  'audio-core/audio-engines.js?v=6.7.44',
  'audio-core/audio-persistence.js?v=6.7.44',
  'audio-core/audio-overlay.js?v=6.7.44',
  'audio-core/audio-voice.js?v=6.7.44',
  'audio-core/audio.js?v=6.7.44',
  'audio-ui-binding.js?v=6.7.44',
  'theory.js?v=6.7.44',
  'tasty-stock.js?v=6.7.44',
  'staff.js?v=6.7.44',
  'instruments.js?v=6.7.44',
  'circle-ui.js?v=6.7.44',
  'parent-scales-ui.js?v=6.7.44',
  'play-controls.js?v=6.7.44',
  'double-stop.js?v=6.7.44',
  'render.js?v=6.7.44',
  'builder.js?v=6.7.44',
  'midi.js?v=6.7.44',
  'plain.js?v=6.7.44',
  'perform.js?v=6.7.44',
  'i18n.js?v=6.7.44',
  'main.js?v=6.7.44',
  'tutorial-data.js?v=6.7.44',
  'tutorial.js?v=6.7.44',
  'lang-en.js?v=6.7.44',
  'lang-ja.js?v=6.7.44',
  'lang-zh.js?v=6.7.44',
  'lang-es.js?v=6.7.44',
  'lang-fr.js?v=6.7.44',
  'lang-pt.js?v=6.7.44',
  'lang-de.js?v=6.7.44',
  'lang-ko.js?v=6.7.44',
  'lang-it.js?v=6.7.44',
  'audio-core/epiano-engine.js?v=6.7.44',
  'audio-core/epiano-worklet-engine.js?v=6.7.44',
  'audio-core/epiano-worklet-processor.js?v=6.7.44',
  'audio-core/spring-reverb-processor.js?v=6.7.44',
  'data/tasty-recipes.json?v=6.7.44',
  'favicon.svg',
  'img/icon-192.png',
  'img/icon-512.png',
  'audio-core/assets/fdtd/attack_tables.bin',
  'audio-core/assets/fdtd/manifest.json',
  'audio-core/assets/twin-cab-ir.wav',
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(ASSETS.map(function(url) {
        return fetch(url, { cache: 'reload' }).then(function(res) {
          return cache.put(url, res);
        });
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  // localhost = dev mode: always fetch from network (no stale cache)
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
    e.respondWith(fetch(e.request));
    return;
  }
  // Production: network first for navigation, cache first for assets
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(function() {
        return caches.match('index.html');
      })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request);
    })
  );
});
