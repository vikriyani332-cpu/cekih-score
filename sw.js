const CACHE_NAME = 'score-cekih-v7';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/joker.png',
  '/joker.ico'
];

const AUDIO_NAMES = [
  'audio/nama/pak_budi.mp3',
  'audio/nama/pak_agus.mp3',
  'audio/nama/mang_aceng.mp3',
  'audio/nama/mang_wandy.mp3',
  'audio/nama/a_yudi.mp3',
  'audio/nama/a_erwin.mp3',
  'audio/nama/bah_nanang.mp3',
  'audio/nama/wildan.mp3'
];

const AUDIO_ANGKA = [
  'audio/angka/minus.mp3',
  'audio/angka/1.mp3','audio/angka/2.mp3','audio/angka/3.mp3','audio/angka/4.mp3',
  'audio/angka/5.mp3','audio/angka/6.mp3','audio/angka/7.mp3','audio/angka/8.mp3',
  'audio/angka/9.mp3','audio/angka/10.mp3','audio/angka/11.mp3','audio/angka/12.mp3',
  'audio/angka/13.mp3','audio/angka/14.mp3','audio/angka/15.mp3','audio/angka/16.mp3',
  'audio/angka/17.mp3','audio/angka/18.mp3','audio/angka/19.mp3',
  'audio/angka/20.mp3','audio/angka/30.mp3','audio/angka/40.mp3','audio/angka/50.mp3',
  'audio/angka/60.mp3','audio/angka/70.mp3','audio/angka/80.mp3','audio/angka/90.mp3',
  'audio/angka/100.mp3','audio/angka/200.mp3','audio/angka/300.mp3','audio/angka/400.mp3',
  'audio/angka/500.mp3','audio/angka/600.mp3','audio/angka/700.mp3','audio/angka/800.mp3',
  'audio/angka/900.mp3','audio/angka/1000.mp3'
];

const AUDIO_KATA = [
  'audio/kata/mendapatkan.mp3',
  'audio/kata/poin.mp3',
  'audio/kata/membakar.mp3',
  'audio/kata/oleh.mp3',
  'audio/kata/selamat_ya.mp3',
  'audio/kata/dapat.mp3',
  'audio/kata/bintang.mp3',
  'audio/kata/tolong.mp3',
  'audio/kata/kocok.mp3',
  'audio/kata/kartunya_ya.mp3',
  'audio/kata/permainan_dimulai.mp3',
  'audio/kata/ronde_selesai.mp3',
  'audio/kata/selamat_berjuang_dan_fokus.mp3',
  'audio/kata/kalau_gabisa_maen_tidur_aja_sana.mp3',
  'audio/kata/mulai_dari_0_ya_bapak.mp3'
];

const ALL_ASSETS = [...STATIC_ASSETS, ...AUDIO_NAMES, ...AUDIO_ANGKA, ...AUDIO_KATA];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        ALL_ASSETS.map(url =>
          cache.add(url).catch(() => {})
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
