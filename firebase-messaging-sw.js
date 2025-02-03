importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyDNH3kgVbLnf-1-htdxoSvSYpZu2yQKtKg",
    authDomain: "jpyi-dbeb8.firebaseapp.com",
    projectId: "jpyi-dbeb8",
    storageBucket: "jpyi-dbeb8.firebasestorage.app",
    messagingSenderId: "453717733641",
    appId: "1:453717733641:web:260fb49f655fef4fd663d8"
});

const messaging = firebase.messaging();

// 백그라운드 메시지 처리
messaging.onBackgroundMessage((payload) => {
    console.log('백그라운드 메시지 수신:', payload);
    
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/icon.png',
        vibrate: [200, 100, 200],
        data: payload.data
    };
    
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
    console.log('알림 클릭됨:', event);
    
    event.notification.close();
    
    // 알림 클릭 시 앱/사이트 열기
    event.waitUntil(
        clients.matchAll({type: 'window'}).then(windowClients => {
            // 이미 열린 창이 있으면 포커스
            for (let client of windowClients) {
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            // 없으면 새 창 열기
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
}); 
