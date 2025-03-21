const CACHE_NAME = 'my-pwa-cache-v14';
const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './script.js',
    './images/icon-192.png'
];

// 설치 단계
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('캐시 열기 성공');
                return cache.addAll(urlsToCache);
            })
    );
});

// fetch 이벤트 처리
self.addEventListener('fetch', event => {
    // Yahoo Finance API 요청은 캐시하지 않음
    if (event.request.url.includes('finance.yahoo.com')) {
        return fetch(event.request);
    }
    
    // 다른 리소스들은 캐시 사용
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

// 캐시 정리
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('push', function(event) {
    const data = event.data.json();
    const title = data.title || '알림';
    const options = {
        body: data.body || '',
        icon: '/images/icon-192.png', // 아이콘 경로
    };
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    // 알림 클릭 시 열릴 페이지 지정
    event.waitUntil(
        clients.openWindow('/')
    );
}); 
