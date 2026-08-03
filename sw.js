const CACHE_NAME='telec-event-manager-v1';
const APP_SHELL=['/','/index.html','/style.css','/app-new.js','/manifest.json','/icons/icon-192.png','/icons/icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(u.pathname.startsWith('/api/')){e.respondWith(fetch(r));return;}
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).catch(()=>caches.match('/index.html')));
    return;
  }
  e.respondWith(caches.match(r).then(c=>c||fetch(r)));
});