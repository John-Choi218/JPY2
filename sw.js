const CACHE_NAME = 'my-pwa-cache-v13';
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
                return Promise.all(
                    urlsToCache.map(url => {
                        return fetch(url, {
                            headers: {
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
                            }
                        })
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`${url} 로드 실패`);
                            }
                            return cache.put(url, response);
                        })
                        .catch(error => {
                            console.error(`${url} 캐시 실패:`, error);
                        });
                    })
                );
            })
    );
});

// 활성화 단계
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('이전 캐시 삭제:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// fetch 이벤트 처리
self.addEventListener('fetch', event => {
    // 지원되지 않는 스킴이나 Firebase 요청 필터링
    if (event.request.url.includes('firestore.googleapis.com') || 
        !event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }

                return fetch(event.request.clone())
                    .then(response => {
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        const responseToCache = response.clone();
                        
                        // 캐시 저장 시도
                        try {
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    if (event.request.url.startsWith('http')) {
                                        cache.put(event.request, responseToCache);
                                    }
                                });
                        } catch (error) {
                            console.error('캐시 저장 실패:', error);
                        }

                        return response;
                    });
            })
            .catch(() => {
                // 오프라인이고 캐시된 응답이 없는 경우
                console.log('리소스 로드 실패');
            })
    );
}); 