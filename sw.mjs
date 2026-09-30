const cacheName='hibou-shell-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(cacheName).then(c=>c.addAll(['/offline.html','/icon.svg']))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hibou-shell-')&&k!==cacheName).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate'&&new URL(event.request.url).origin===self.location.origin)event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));});
