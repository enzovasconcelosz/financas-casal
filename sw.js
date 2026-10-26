/* ==========================================================================
   sw.js — service worker: deixa o site abrir sem internet

   Estrategia:
     - HTML: rede primeiro (para pegar atualizacoes), cache como reserva
     - resto (css/js/icones): cache primeiro, atualizando por tras
     - nada de API externa entra no cache
   ========================================================================== */

var VERSAO = 'financas-casal-v3';

var ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/charts.css',
  './css/print.css',
  './js/format.js',
  './js/dom.js',
  './js/crypto.js',
  './js/parser.js',
  './js/merge.js',
  './js/seed.js',
  './js/store.js',
  './js/model.js',
  './js/ui.js',
  './js/charts.js',
  './js/indicators.js',
  './js/sync.js',
  './js/nuvem-config.js',
  './js/nuvem.js',
  './js/pdf.js',
  './js/forms.js',
  './js/views/login.js',
  './js/views/overview.js',
  './js/views/person.js',
  './js/views/forecast.js',
  './js/views/invest.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './js/views/inbox.js',
  './js/app.js',
  './assets/icon.svg',
  './assets/favicon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSAO).then(function (cache) {
      return cache.addAll(ARQUIVOS);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (chaves) {
      return Promise.all(chaves.map(function (k) {
        if (k !== VERSAO) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // API e CDN passam direto

  /* HTML e a configuração da nuvem: rede primeiro, para mudanças chegarem já */
  var ehHTML = req.mode === 'navigate' ||
               (req.headers.get('accept') || '').indexOf('text/html') >= 0 ||
               url.pathname.slice(-15) === 'nuvem-config.js';

  if (ehHTML) {
    e.respondWith(
      fetch(req).then(function (r) {
        var copia = r.clone();
        caches.open(VERSAO).then(function (c) { c.put(req, copia); });
        return r;
      }).catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match('./index.html');
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (cacheado) {
      var rede = fetch(req).then(function (r) {
        if (r && r.status === 200) {
          var copia = r.clone();
          caches.open(VERSAO).then(function (c) { c.put(req, copia); });
        }
        return r;
      }).catch(function () { return cacheado; });
      return cacheado || rede;
    })
  );
});
