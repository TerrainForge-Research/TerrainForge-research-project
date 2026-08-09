var CACHE_NAME = 'terrainforge-v1';

var APP_SHELL = [
  './',
  './css/animation-coords.css',
  './css/base.css',
  './css/chaos-wavelab.css',
  './css/home-modals-hud.css',
  './css/panels-controls.css',
  './css/regions-fpp-misc.css',
  './icons/apple-touch-icon.png',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './index.html',
  './js/animation/keyframe-animation.js',
  './js/camera/camera-controls.js',
  './js/camera/coord-inspector.js',
  './js/camera/fpp-mode.js',
  './js/chaos/chaos-engine.js',
  './js/chaos/chaos-events.js',
  './js/core/generate.js',
  './js/core/init.js',
  './js/core/render-loop.js',
  './js/core/scene-setup.js',
  './js/export/anim-export.js',
  './js/export/export-glb-obj.js',
  './js/export/export-heightmap-texture.js',
  './js/foliage/foliage.js',
  './js/persistence/project-storage.js',
  './js/platform/offline-support.js',
  './js/platform/zoom-lock.js',
  './js/state/state.js',
  './js/terrain/analysis-tools.js',
  './js/terrain/climate-biome.js',
  './js/terrain/erosion.js',
  './js/terrain/heightmap.js',
  './js/terrain/node-graph.js',
  './js/terrain/rivers.js',
  './js/terrain/terrain-mesh.js',
  './js/ui/home-screens.js',
  './js/ui/import-placement.js',
  './js/ui/regions-layers.js',
  './js/ui/stats-dna-docs.js',
  './js/ui/ui-bindings.js',
  './js/util/color-utils.js',
  './js/util/dom-helpers.js',
  './js/util/noise-lib.js',
  './js/util/simplex-noise.js',
  './js/water/water-equation.js',
  './js/water/water.js',
  './js/water/wave-lab.js',
  './manifest.json'
];

self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(APP_SHELL);
    })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(names.filter(function(n){ return n !== CACHE_NAME; })
                              .map(function(n){ return caches.delete(n); }));
    }).then(function(){ return self.clients.claim(); })
  );
});


self.addEventListener('fetch', function(event){
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function(cached){
      if (cached) return cached;
      return fetch(event.request).then(function(response){
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return response;
      }).catch(function(){
        // Offline and not cached: nothing sensible to return for most
        // requests, but for a navigation, fall back to the app shell.
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
