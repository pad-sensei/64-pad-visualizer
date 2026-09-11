var CACHE_NAME = '64pad-v180-preview-20260911-audio-sustain-1';
var ASSETS = [
  './',
  'index.html',
  'style.css?v=6.7.52',
  'pad-core/data.js?v=6.7.54',
  'pad-core/theory.js?v=6.7.54',
  'pad-core/render.js?v=6.7.52',
  'pad-core/circle.js?v=6.7.52',
  'pad-core/builder-ui.js?v=6.7.52',
  'pad-core/incremental.js?v=6.7.52',
  'data.js?v=6.7.52',
  'host-adapter.js?v=6.7.61',
  'audio-core/audio-master.js?v=6.7.61',
  'audio-core/audio-effects.js?v=6.7.61',
  'audio-core/audio-reverb.js?v=6.7.61',
  'audio-core/audio-sampler.js?v=6.7.61',
  'audio-core/audio-engines.js?v=6.7.61',
  'audio-core/audio-persistence.js?v=6.7.61',
  'audio-core/audio-overlay.js?v=6.7.61',
  'audio-core/audio-voice.js?v=6.7.61',
  'audio-core/audio.js?v=6.7.61',
  'master-tail.js?v=6.7.61',
  'audio-ui-binding.js?v=6.7.61',
  'theory.js?v=6.7.52',
  'tasty-stock.js?v=6.7.52',
  'staff.js?v=6.7.52',
  'instruments.js?v=6.7.52',
  'circle-ui.js?v=6.7.52',
  'parent-scales-ui.js?v=6.7.52',
  'play-controls.js?v=6.7.52',
  'double-stop.js?v=6.7.52',
  'render.js?v=6.7.52',
  'builder.js?v=6.7.52',
  'pad-core/observed-structure.js?v=6.7.52',
  'observed-ust-consumer.js?v=6.7.52',
  'midi-input-state.js?v=6.7.52',
  'push-midi-port-contract.js?v=1.8.0-liveport3',
  'push-midi-cc-map.js?v=1.8.0',
  'push-web-control.js?v=1.8.0-led1',
  'midi.js?v=6.7.60',
  'push-display-webusb.js?v=webusb-20260911-10',
  'push-surface-cleanup.js?v=webusb-20260911-7',
  'push-display-webusb-app.js?v=webusb-20260911-10',
  'plain.js?v=6.7.52',
  'perform.js?v=6.7.52',
  'i18n.js?v=6.7.52',
  'main.js?v=6.7.55',
  'tutorial-data.js?v=6.7.52',
  'tutorial.js?v=6.7.52',
  'lang-en.js?v=6.7.52',
  'lang-ja.js?v=6.7.52',
  'lang-zh.js?v=6.7.52',
  'lang-es.js?v=6.7.52',
  'lang-fr.js?v=6.7.52',
  'lang-pt.js?v=6.7.52',
  'lang-de.js?v=6.7.52',
  'lang-ko.js?v=6.7.52',
  'lang-it.js?v=6.7.52',
  'audio-core/epiano-engine.js?v=6.7.61',
  'audio-core/epiano-worklet-engine.js?v=6.7.61',
  'audio-core/epiano-worklet-processor.js?v=6.7.52',
  'audio-core/spring-reverb-processor.js?v=6.7.52',
  'data/tasty-recipes.json?v=6.7.52',
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
