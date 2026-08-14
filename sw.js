var CACHE_NAME = '64pad-v6.7.51';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=6.7.51',
  'pad-core/data.js?v=6.7.51',
  'pad-core/theory.js?v=6.7.51',
  'pad-core/render.js?v=6.7.51',
  'pad-core/circle.js?v=6.7.51',
  'pad-core/builder-ui.js?v=6.7.51',
  'pad-core/incremental.js?v=6.7.51',
  'data.js?v=6.7.51',
  'host-adapter.js?v=6.7.51',
  'audio-core/audio-master.js?v=6.7.51',
  'audio-core/audio-effects.js?v=6.7.51',
  'audio-core/audio-reverb.js?v=6.7.51',
  'audio-core/audio-sampler.js?v=6.7.51',
  'audio-core/audio-engines.js?v=6.7.51',
  'audio-core/audio-persistence.js?v=6.7.51',
  'audio-core/audio-overlay.js?v=6.7.51',
  'audio-core/audio-voice.js?v=6.7.51',
  'audio-core/audio.js?v=6.7.51',
  'audio-ui-binding.js?v=6.7.51',
  'theory.js?v=6.7.51',
  'tasty-stock.js?v=6.7.51',
  'staff.js?v=6.7.51',
  'instruments.js?v=6.7.51',
  'circle-ui.js?v=6.7.51',
  'parent-scales-ui.js?v=6.7.51',
  'play-controls.js?v=6.7.51',
  'double-stop.js?v=6.7.51',
  'render.js?v=6.7.51',
  'builder.js?v=6.7.51',
  'pad-core/observed-structure.js?v=6.7.51',
  'observed-ust-consumer.js?v=6.7.51',
  'midi-input-state.js?v=6.7.51',
  'launchpad-adapter.js?v=6.7.51',
  'midi.js?v=6.7.51',
  'plain.js?v=6.7.51',
  'perform.js?v=6.7.51',
  'i18n.js?v=6.7.51',
  'main.js?v=6.7.51',
  'tutorial-data.js?v=6.7.51',
  'tutorial.js?v=6.7.51',
  'lang-en.js?v=6.7.51',
  'lang-ja.js?v=6.7.51',
  'lang-zh.js?v=6.7.51',
  'lang-es.js?v=6.7.51',
  'lang-fr.js?v=6.7.51',
  'lang-pt.js?v=6.7.51',
  'lang-de.js?v=6.7.51',
  'lang-ko.js?v=6.7.51',
  'lang-it.js?v=6.7.51',
  'audio-core/epiano-engine.js?v=6.7.51',
  'audio-core/epiano-worklet-engine.js?v=6.7.51',
  'audio-core/epiano-worklet-processor.js?v=6.7.51',
  'audio-core/spring-reverb-processor.js?v=6.7.51',
  'data/tasty-recipes.json?v=6.7.51',
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
