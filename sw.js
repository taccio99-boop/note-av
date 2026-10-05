/* NOTE AV - service worker
   Serve a due cose: rendere Note Av installabile come app (Android, iPhone, PC)
   e ricevere le notifiche. Mette in memoria SOLO i file della pagina, mai i
   dati: quelli arrivano sempre da Supabase dopo l'accesso. */
'use strict';

const VERSIONE = 'note-av-v7';
const FILE = ['./', 'index.html', 'app.css', 'app.js', 'config.js', 'vendor/supabase.min.js',
  'manifest.webmanifest', 'icone/icona-192.png', 'icone/icona-512.png', 'icone/icona.svg', 'icone/qr-note-av.svg'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(x => x !== VERSIONE).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});

// Prima la rete (cosi' gli aggiornamenti arrivano subito), poi la copia.
self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== self.location.origin) return;
  ev.respondWith(fetch(ev.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSIONE).then(c => c.put(ev.request, copia)); }
    return r;
  }).catch(() => caches.match(ev.request).then(r => r || caches.match('index.html'))));
});

self.addEventListener('push', ev => {
  let d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch (e) { d = { corpo: ev.data && ev.data.text() }; }
  ev.waitUntil(self.registration.showNotification(d.titolo || 'Note Av', {
    body: d.corpo || 'Ci sono novità per te.',
    icon: 'icone/icona-192.png',
    badge: 'icone/icona-192.png',
    tag: d.tag || 'note-av',
    renotify: true,
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  const dove = new URL(ev.notification.data && ev.notification.data.url || './', self.location.href).href;
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(fin => {
    for (const f of fin) if (f.url.startsWith(self.registration.scope)) { f.focus(); return; }
    return self.clients.openWindow(dove);
  }));
});
