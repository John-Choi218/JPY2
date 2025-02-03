self.addEventListener('install', (event) => {
    console.log('Service Worker 설치됨');
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker 활성화됨');
});

self.addEventListener('push', (event) => {
    const options = {
        body: event.data.text(),
        icon: 'images/icon-192.png',
        badge: 'images/badge-72.png',
        vibrate: [200, 100, 200]
    };

    event.waitUntil(
        self.registration.showNotification('환율 알림', options)
    );
}); 
