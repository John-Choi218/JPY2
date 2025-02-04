// 투자 데이터를 저장할 배열들
let currentInvestments = [];
let completedInvestments = [];

// 전역 변수에 설정값 추가
let settings = {
    buyThreshold: 2, // 매수 알림 기준 (원 단위)
    sellThreshold: 2 // 매도 알림 기준 (원 단위)
};

// Firebase 초기화
const firebaseConfig = {
    apiKey: "AIzaSyDNH3kgVbLnf-1-htdxoSvSYpZu2yQKtKg",
    authDomain: "jpyi-dbeb8.firebaseapp.com",
    projectId: "jpyi-dbeb8",
    storageBucket: "jpyi-dbeb8.firebasestorage.app",
    messagingSenderId: "453717733641",
    appId: "1:453717733641:web:260fb49f655fef4fd663d8"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 데이터 로드
async function loadData() {
    try {
        // 현재 투자 데이터 로드
        const currentSnapshot = await db.collection('currentInvestments').get();
        currentInvestments = currentSnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id  // Firestore 문서 ID를 명시적으로 저장
        }));

        // 완료된 투자 데이터 로드
        const completedSnapshot = await db.collection('completedInvestments').get();
        completedInvestments = completedSnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id  // Firestore 문서 ID를 명시적으로 저장
        }));

        updateTables();
        updateSummary();
    } catch (error) {
        console.error('데이터 로드 실패:', error);
        alert('데이터 로드에 실패했습니다.');
    }
}

// 데이터 저장
function saveData() {
    localStorage.setItem('currentInvestments', JSON.stringify(currentInvestments));
    localStorage.setItem('completedInvestments', JSON.stringify(completedInvestments));
}

// 투자 수정
async function editInvestment(id) {
    const investment = currentInvestments.find(inv => inv.id === id);
    if (!investment) return;
    
    document.getElementById('purchaseDate').value = new Date(investment.date).toISOString().split('T')[0];
    document.getElementById('amountYen').value = investment.amountYen;
    document.getElementById('exchangeRate').value = investment.exchangeRate;
    
    // 폼의 submit 버튼 텍스트 변경
    const submitButton = document.querySelector('#investmentForm button[type="submit"]');
    submitButton.textContent = '수정';
    
    // 수정 모드 설정
    document.getElementById('investmentForm').dataset.editMode = id;
    
    // 취소 버튼 추가
    if (!document.getElementById('cancelEdit')) {
        const cancelButton = document.createElement('button');
        cancelButton.id = 'cancelEdit';
        cancelButton.type = 'button';
        cancelButton.textContent = '취소';
        cancelButton.onclick = cancelEdit;
        document.getElementById('investmentForm').appendChild(cancelButton);
    }
}

// 투자 폼 제출 이벤트 수정
document.getElementById('investmentForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const purchaseDate = document.getElementById('purchaseDate').value;
    const amountYen = Number(document.getElementById('amountYen').value);
    const exchangeRate = Number(document.getElementById('exchangeRate').value);
    const amountKrw = amountYen * (exchangeRate / 100);
    
    const investment = {
        date: new Date(purchaseDate).toISOString(),
        amountYen: amountYen,
        exchangeRate: exchangeRate,
        amountKrw: amountKrw
    };
    
    try {
        const editMode = this.dataset.editMode;
        
        if (editMode) {
            // 수정 모드: 기존 문서 업데이트
            await db.collection('currentInvestments').doc(editMode).update(investment);
            
            // 로컬 배열에서 해당 항목 업데이트
            const index = currentInvestments.findIndex(inv => inv.id === editMode);
            if (index !== -1) {
                currentInvestments[index] = { ...investment, id: editMode };
            }
            
            // 수정 모드 해제
            delete this.dataset.editMode;
            document.querySelector('#investmentForm button[type="submit"]').textContent = '추가';
            if (document.getElementById('cancelEdit')) {
                document.getElementById('cancelEdit').remove();
            }
        } else {
            // 추가 모드: 새 문서 생성
            const docRef = await db.collection('currentInvestments').add(investment);
            investment.id = docRef.id;
            currentInvestments.push(investment);
        }
        
        updateTables();
        this.reset();
        
        Swal.fire({
            icon: 'success',
            title: editMode ? '수정 완료' : '추가 완료',
            text: editMode ? '투자 내역이 수정되었습니다.' : '새로운 투자가 추가되었습니다.',
            timer: 1500
        });
    } catch (error) {
        console.error(editMode ? '투자 수정 실패:' : '투자 추가 실패:', error);
        Swal.fire({
            icon: 'error',
            title: '오류',
            text: editMode ? '투자 수정에 실패했습니다.' : '투자 추가에 실패했습니다.'
        });
    }
});

// 수정 취소
function cancelEdit() {
    document.getElementById('investmentForm').reset();
    document.getElementById('investmentForm').removeAttribute('data-edit-mode');
    document.querySelector('#investmentForm button[type="submit"]').textContent = '추가';
    document.getElementById('cancelEdit').remove();
    loadData();
}

// 투자 삭제
async function deleteInvestment(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    
    try {
        console.log('삭제 시도:', id); // 삭제 시도 로그
        
        // Firestore에서 문서 삭제
        const docRef = db.collection('currentInvestments').doc(id);
        await docRef.delete();
        console.log('Firestore 삭제 완료'); // 삭제 완료 로그
        
        // 로컬 배열에서 삭제
        currentInvestments = currentInvestments.filter(inv => inv.id !== id);
        console.log('로컬 배열 삭제 완료'); // 로컬 삭제 로그
        
        // 화면 업데이트
        updateTables();
        updateSummary();
        
        // 삭제 확인을 위해 다시 한번 문서 조회
        const deletedDoc = await docRef.get();
        if (!deletedDoc.exists) {
            console.log('문서가 성공적으로 삭제됨');
        } else {
            console.log('문서가 여전히 존재함');
        }
        
    } catch (error) {
        console.error('투자 삭제 실패:', error);
        alert('투자 삭제에 실패했습니다. 에러: ' + error.message);
    }
}

// 투자 매도
async function sellInvestment(id) {
    const investment = currentInvestments.find(inv => inv.id === id);
    if (!investment) return;
    
    const sellRate = prompt('매도 환율을 입력하세요 (100엔 기준):', '');
    if (!sellRate) return;
    
    const sellExchangeRate = Number(sellRate);
    if (isNaN(sellExchangeRate) || sellExchangeRate <= 0) {
        alert('올바른 환율을 입력해주세요.');
        return;
    }
    
    const sellAmountKrw = investment.amountYen * (sellExchangeRate / 100);
    const profitLoss = sellAmountKrw - investment.amountKrw;
    const profitLossRate = (profitLoss / investment.amountKrw) * 100;
    
    const completedInvestment = {
        ...investment,
        sellDate: new Date().toISOString(),
        sellExchangeRate: sellExchangeRate,
        sellAmountKrw: sellAmountKrw,
        profitLoss: profitLoss,
        profitLossRate: profitLossRate
    };
    
    try {
        // 현재 투자에서 삭제
        await db.collection('currentInvestments').doc(id).delete();
        
        // 완료된 투자에 추가
        const docRef = await db.collection('completedInvestments').add(completedInvestment);
        completedInvestment.id = docRef.id; // 새로 생성된 문서 ID 저장
        
        // 로컬 배열 업데이트
        currentInvestments = currentInvestments.filter(inv => inv.id !== id);
        completedInvestments.push(completedInvestment);
        
        updateTables();
        updateSummary();
        
        // 투자 완료 알림 전송
        await sendInvestmentCompletedNotification(id, investment.amountYen);
    } catch (error) {
        console.error('매도 처리 실패:', error);
        alert('매도 처리에 실패했습니다.');
    }
}

// 테이블 업데이트
function updateTables() {
    const currentTable = document.querySelector('#currentInvestmentsTable tbody');
    currentTable.innerHTML = currentInvestments.map(inv => {
        const amountYen = inv.amountYen.toLocaleString();
        const amountKrw = inv.amountKrw.toLocaleString();
        const buyTarget = (inv.exchangeRate - settings.buyThreshold).toFixed(2);
        const sellTarget = (inv.exchangeRate + settings.sellThreshold).toFixed(2);
        
        return `
        <tr>
            <td>${new Date(inv.date).toLocaleDateString()}</td>
            <td>${amountYen}엔</td>
            <td>${inv.exchangeRate.toFixed(2)}원</td>
            <td>${amountKrw}원</td>
            <td>
                <div class="target-rates">
                    <span class="buy-target">매수: ${buyTarget}원</span>
                    <span class="sell-target">매도: ${sellTarget}원</span>
                </div>
                <div class="button-group">
                    <button class="edit-button" onclick="editInvestment('${inv.id}')">수정</button>
                    <button class="delete-button" onclick="deleteInvestment('${inv.id}')">삭제</button>
                    <button class="sell-button" onclick="sellInvestment('${inv.id}')">매도</button>
                </div>
            </td>
        </tr>
    `}).join('');
    
    // 투자 실적 테이블 업데이트
    const historyTable = document.querySelector('#historyTable tbody');
    historyTable.innerHTML = completedInvestments.map(inv => {
        console.log('완료된 투자 ID:', inv.id); // ID 확인 로그
        const amountYen = inv.amountYen.toLocaleString();
        
        return `
        <tr>
            <td>${new Date(inv.date).toLocaleDateString()}</td>
            <td>${new Date(inv.sellDate).toLocaleDateString()}</td>
            <td>${amountYen}엔</td>
            <td>${inv.exchangeRate.toFixed(2)}원</td>
            <td>${inv.sellExchangeRate.toFixed(2)}원</td>
            <td>${inv.profitLoss.toLocaleString()}원</td>
            <td>${inv.profitLossRate.toFixed(2)}%</td>
            <td>
                <div class="button-group">
                    <button class="edit-button" onclick="editCompletedInvestment('${inv.id}')">수정</button>
                    <button class="delete-button" onclick="deleteCompletedInvestment('${inv.id}')">삭제</button>
                </div>
            </td>
        </tr>
    `}).join('');
}

// 요약 정보 업데이트
function updateSummary() {
    const totalProfit = completedInvestments.reduce((sum, inv) => sum + inv.profitLoss, 0);
    const averageReturn = completedInvestments.length > 0
        ? completedInvestments.reduce((sum, inv) => sum + inv.profitLossRate, 0) / completedInvestments.length
        : 0;
    
    document.getElementById('totalProfit').textContent = `${totalProfit.toLocaleString()}원`;
    document.getElementById('averageReturn').textContent = `${averageReturn.toFixed(2)}%`;
}

// 설정 로드 함수
async function loadSettings() {
    try {
        // Firestore에서 설정 로드
        const doc = await db.collection('settings').doc('thresholds').get();
        if (doc.exists) {
            settings = doc.data();
        } else {
            // 기본값 설정
            settings = {
                buyThreshold: 2, // 기본값: 2원
                sellThreshold: 2 // 기본값: 2원
            };
            // 기본값을 Firestore에 저장
            await saveSettings();
        }
        
        // 테이블 업데이트
        updateTables();
    } catch (error) {
        console.error('설정 로드 실패:', error);
        // 오류 발생 시 기본값 사용
        settings = {
            buyThreshold: 2,
            sellThreshold: 2
        };
    }
}

// 설정 저장 함수
async function saveSettings() {
    try {
        await db.collection('settings').doc('thresholds').set(settings);
    } catch (error) {
        console.error('설정 저장 실패:', error);
    }
}

// 설정 버튼 클릭 이벤트
document.getElementById('openSettings').addEventListener('click', async function() {
    // 현재 설정값 가져오기
    try {
        const doc = await db.collection('settings').doc('thresholds').get();
        const currentSettings = doc.exists ? doc.data() : { buyThreshold: 2, sellThreshold: 2 };
        
        // SweetAlert2로 설정 모달 표시
        const { value: formValues } = await Swal.fire({
            title: '목표 환율 설정',
            html: `
                <div class="settings-form">
                    <div class="form-group">
                        <label for="buyThreshold">매수 목표 환율 차이 (원)</label>
                        <input type="number" id="buyThreshold" class="swal2-input" 
                            value="${currentSettings.buyThreshold}" step="0.01">
                    </div>
                    <div class="form-group">
                        <label for="sellThreshold">매도 목표 환율 차이 (원)</label>
                        <input type="number" id="sellThreshold" class="swal2-input" 
                            value="${currentSettings.sellThreshold}" step="0.01">
                    </div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: '저장',
            cancelButtonText: '취소',
            preConfirm: () => {
                return {
                    buyThreshold: Number(document.getElementById('buyThreshold').value),
                    sellThreshold: Number(document.getElementById('sellThreshold').value)
                }
            }
        });

        if (formValues) {
            settings = formValues;
            await saveSettings();
            updateTables();
            
            Swal.fire({
                icon: 'success',
                title: '설정 저장 완료',
                text: '설정이 성공적으로 저장되었습니다.',
                timer: 1500
            });
        }
    } catch (error) {
        console.error('설정 처리 실패:', error);
        Swal.fire({
            icon: 'error',
            title: '오류',
            text: '설정 처리 중 오류가 발생했습니다.'
        });
    }
});

// 초기 로드 시 설정도 함께 로드
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadData();
        await loadSettings();
        
        initializeDarkMode();
        requestNotificationPermission();
        startExchangeRateUpdates();  // 환율 업데이트 시마다 checkAndSendNotifications 호출됨
    } catch (error) {
        console.error('초기 로드 중 오류 발생:', error);
    }
});

// 완료된 투자 수정 함수 수정
async function editCompletedInvestment(id) {
    const investment = completedInvestments.find(inv => inv.id === id);
    if (!investment) return;
    
    // 현재 날짜들을 YYYY-MM-DD 형식으로 변환
    const purchaseDate = new Date(investment.date).toISOString().split('T')[0];
    const sellDate = new Date(investment.sellDate).toISOString().split('T')[0];
    
    // 수정할 정보를 입력받을 폼 생성
    const form = document.createElement('form');
    form.innerHTML = `
        <div style="margin: 10px 0;">
            <label>구매일:<br>
                <input type="date" id="editPurchaseDate" value="${purchaseDate}" required>
            </label>
        </div>
        <div style="margin: 10px 0;">
            <label>매도일:<br>
                <input type="date" id="editSellDate" value="${sellDate}" required>
            </label>
        </div>
        <div style="margin: 10px 0;">
            <label>엔화 금액:<br>
                <input type="number" id="editAmountYen" value="${investment.amountYen}" required>
            </label>
        </div>
        <div style="margin: 10px 0;">
            <label>구매 환율 (100엔):<br>
                <input type="number" step="0.01" id="editExchangeRate" value="${investment.exchangeRate}" required>
            </label>
        </div>
        <div style="margin: 10px 0;">
            <label>매도 환율 (100엔):<br>
                <input type="number" step="0.01" id="editSellExchangeRate" value="${investment.sellExchangeRate}" required>
            </label>
        </div>
    `;
    
    // 사용자에게 폼 표시
    const result = await Swal.fire({
        title: '투자 실적 수정',
        html: form,
        showCancelButton: true,
        confirmButtonText: '수정',
        cancelButtonText: '취소',
        preConfirm: () => {
            return {
                purchaseDate: document.getElementById('editPurchaseDate').value,
                sellDate: document.getElementById('editSellDate').value,
                amountYen: Number(document.getElementById('editAmountYen').value),
                exchangeRate: Number(document.getElementById('editExchangeRate').value),
                sellExchangeRate: Number(document.getElementById('editSellExchangeRate').value)
            };
        }
    });
    
    if (!result.isConfirmed) return;
    
    const newData = result.value;
    
    // 유효성 검사
    if (!newData.purchaseDate || !newData.sellDate || 
        !newData.amountYen || !newData.exchangeRate || !newData.sellExchangeRate) {
        alert('모든 필드를 입력해주세요.');
        return;
    }
    
    // 새로운 금액 계산
    const amountKrw = newData.amountYen * (newData.exchangeRate / 100);
    const sellAmountKrw = newData.amountYen * (newData.sellExchangeRate / 100);
    const profitLoss = sellAmountKrw - amountKrw;
    const profitLossRate = (profitLoss / amountKrw) * 100;
    
    const updatedInvestment = {
        ...investment,
        date: new Date(newData.purchaseDate).toISOString(),
        sellDate: new Date(newData.sellDate).toISOString(),
        amountYen: newData.amountYen,
        exchangeRate: newData.exchangeRate,
        sellExchangeRate: newData.sellExchangeRate,
        amountKrw: amountKrw,
        sellAmountKrw: sellAmountKrw,
        profitLoss: profitLoss,
        profitLossRate: profitLossRate
    };
    
    try {
        // Firestore 업데이트
        await db.collection('completedInvestments').doc(id).update(updatedInvestment);
        
        // 로컬 배열 업데이트
        const index = completedInvestments.findIndex(inv => inv.id === id);
        if (index !== -1) {
            completedInvestments[index] = updatedInvestment;
        }
        
        // 화면 업데이트
        updateTables();
        updateSummary();
        
        Swal.fire({
            icon: 'success',
            title: '수정 완료',
            text: '투자 실적이 성공적으로 수정되었습니다.'
        });
    } catch (error) {
        console.error('투자 실적 수정 실패:', error);
        Swal.fire({
            icon: 'error',
            title: '수정 실패',
            text: '투자 실적 수정에 실패했습니다.'
        });
    }
}

// 완료된 투자 삭제 함수
async function deleteCompletedInvestment(id) {
    if (!confirm('정말 이 투자 실적을 삭제하시겠습니까?')) return;
    
    try {
        console.log('완료된 투자 삭제 시도:', id); // 삭제 시도 로그
        
        // Firestore에서 문서 삭제
        const docRef = db.collection('completedInvestments').doc(id);
        await docRef.delete();
        console.log('Firestore 삭제 완료'); // 삭제 완료 로그
        
        // 로컬 배열에서 삭제
        completedInvestments = completedInvestments.filter(inv => inv.id !== id);
        console.log('로컬 배열 삭제 완료'); // 로컬 삭제 로그
        
        // 화면 업데이트
        updateTables();
        updateSummary();
        
        // 삭제 확인을 위해 다시 한번 문서 조회
        const deletedDoc = await docRef.get();
        if (!deletedDoc.exists) {
            console.log('문서가 성공적으로 삭제됨');
        } else {
            console.log('문서가 여전히 존재함');
        }
        
    } catch (error) {
        console.error('투자 실적 삭제 실패:', error);
        alert('투자 실적 삭제에 실패했습니다. 에러: ' + error.message);
    }
}

// FCM 초기화 및 토큰 관리
let messagingToken = null;

// 알림 권한 상태 체크 함수
async function checkNotificationPermission() {
    const permission = await Notification.requestPermission();
    console.log('현재 알림 권한 상태:', permission);
    
    // Android Chrome 알림 설정 확인
    if ('permissions' in navigator) {
        const result = await navigator.permissions.query({ name: 'notifications' });
        console.log('Chrome 알림 권한:', result.state);
    }
}

// Service Worker 등록 함수 수정
async function registerServiceWorker() {
    // 현재 전체 URL 확인
    const currentUrl = window.location.href;
    console.log('현재 URL:', currentUrl);
    
    // GitHub Pages인지 확인
    const isGitHubPages = currentUrl.includes('github.io');
    console.log('GitHub Pages 여부:', isGitHubPages);
    
    let swPath, scope;
    
    if (isGitHubPages) {
        // GitHub Pages 환경
        swPath = '/JPY2/firebase-messaging-sw.js';  // 전체 경로 지정
        scope = '/JPY2/';  // 전체 경로 지정
    } else {
        // 로컬 환경
        swPath = '/firebase-messaging-sw.js';
        scope = '/';
    }
    
    console.log('Service Worker 설정:', { swPath, scope });
    
    try {
        // 기존 Service Worker 제거
        const existingRegistration = await navigator.serviceWorker.getRegistration();
        if (existingRegistration) {
            console.log('기존 Service Worker 제거');
            await existingRegistration.unregister();
        }
        
        // 잠시 대기 (Service Worker 제거 완료를 위해)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 새 Service Worker 등록
        console.log('새 Service Worker 등록 시도:', { swPath, scope });
        const registration = await navigator.serviceWorker.register(swPath, { scope: scope });
        console.log('Service Worker 등록 성공:', registration);
        
        // Service Worker 활성화 대기
        await navigator.serviceWorker.ready;
        console.log('Service Worker 활성화됨');
        
        return registration;
    } catch (error) {
        console.error('Service Worker 등록 실패:', error);
        
        if (isGitHubPages) {
            // GitHub Pages에서 다른 경로 시도
            try {
                const altPath = 'firebase-messaging-sw.js';
                const altScope = './';
                console.log('대체 경로로 재시도:', { altPath, altScope });
                const registration = await navigator.serviceWorker.register(altPath, { scope: altScope });
                console.log('대체 경로로 등록 성공:', registration);
                return registration;
            } catch (retryError) {
                console.error('대체 경로로도 실패:', retryError);
                throw retryError;
            }
        } else {
            throw error;
        }
    }
}

// FCM 초기화 함수는 동일
async function initializeFCM() {
    try {
        console.log('FCM 초기화 시작...');
        
        // 알림 권한 먼저 요청
        const permission = await Notification.requestPermission();
        console.log('알림 권한 상태:', permission);
        
        if (permission !== 'granted') {
            throw new Error('알림 권한이 거부되었습니다.');
        }
        
        // Service Worker 등록
        if ('serviceWorker' in navigator) {
            const registration = await registerServiceWorker();
            console.log('Service Worker 등록 완료:', registration);
        } else {
            throw new Error('이 브라우저는 Service Worker를 지원하지 않습니다.');
        }

        const messaging = firebase.messaging();
        console.log('Firebase Messaging 인스턴스 생성됨');
        
        // FCM 토큰 가져오기
        console.log('FCM 토큰 요청 중...');
        messagingToken = await messaging.getToken({
            vapidKey: 'BL1Pu4t4Hrwq_qOAkM3QA4g5AjDyRZISVVWaf30VW0MEfPOyxYTfpiFj4tP1AhlPaAvaQtJvWyOXg-JFC4CxeVo',
            serviceWorkerRegistration: await navigator.serviceWorker.getRegistration()
        });
        
        if (!messagingToken) {
            throw new Error('FCM 토큰을 가져오지 못했습니다.');
        }
        
        console.log('FCM 토큰 생성됨:', messagingToken);
        localStorage.setItem('fcmToken', messagingToken);
        
        // 토큰 변경 감지
        messaging.onTokenRefresh = async () => {
            try {
                messagingToken = await messaging.getToken({
                    vapidKey: 'BL1Pu4t4Hrwq_qOAkM3QA4g5AjDyRZISVVWaf30VW0MEfPOyxYTfpiFj4tP1AhlPaAvaQtJvWyOXg-JFC4CxeVo',
                    serviceWorkerRegistration: await navigator.serviceWorker.getRegistration()
                });
                console.log('FCM 토큰 갱신됨:', messagingToken);
                localStorage.setItem('fcmToken', messagingToken);
            } catch (error) {
                console.error('토큰 갱신 실패:', error);
            }
        };
        
        // 포그라운드 메시지 처리
        messaging.onMessage((payload) => {
            console.log('포그라운드 메시지 수신:', payload);
            
            // 알림 표시
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                const options = {
                    body: payload.notification.body,
                    vibrate: [200, 100, 200]
                };
                
                navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification(payload.notification.title, options);
                });
            }
        });
        
    } catch (error) {
        console.error('FCM 초기화 실패:', error);
        console.error('상세 에러:', error.message);
        
        // 사용자에게 알림
        Swal.fire({
            icon: 'error',
            title: 'FCM 초기화 실패',
            text: `오류: ${error.message}`,
            confirmButtonText: '확인'
        });
        
        // localStorage에서 토큰 복구 시도
        messagingToken = localStorage.getItem('fcmToken');
        if (messagingToken) {
            console.log('localStorage에서 토큰 복구됨:', messagingToken);
        }
    }
}

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', async () => {
    console.log('페이지 로드됨 - FCM 초기화 시작');
    
    try {
        await initializeFCM();
        
        if (messagingToken) {
            console.log('FCM 토큰 사용 가능:', messagingToken);
        } else {
            console.log('FCM 토큰 없음');
            // 알림 권한 다시 요청
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                await initializeFCM();
            }
        }
    } catch (error) {
        console.error('초기화 중 오류 발생:', error);
    }
});

// 브라우저 콘솔에서 실행
navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
        registration.unregister();
    }
});

// 알림 전송 기본 함수
async function sendNotification(title, body, data = {}) {
    try {
        console.log('알림 전송 시작:', { title, body, data });
        
        if (!messagingToken) {
            console.error('FCM 토큰 없음!');
            throw new Error('FCM 토큰이 없습니다. 알림 설정을 다시 해주세요.');
        }
        
        // 서비스 워커 상태 확인
        const registration = await navigator.serviceWorker.getRegistration();
        console.log('현재 Service Worker 상태:', registration);
        
        // Firestore에 알림 요청 저장
        const notificationRef = await db.collection('notifications').add({
            token: messagingToken,
            title: title,
            body: body,
            data: data,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            type: data.type || 'general'
        });
        
        console.log('알림 요청 Firestore에 저장됨:', notificationRef.id);
        
        // 로컬 알림 즉시 표시
        if (registration) {
            console.log('로컬 알림 표시 시도...');
            await registration.showNotification(title, {
                body: body,
                icon: '/icon.png',
                vibrate: [200, 100, 200],
                tag: data.type || 'notification',
                data: data
            });
            console.log('로컬 알림 표시 완료');
        }
        
        return true;
    } catch (error) {
        console.error('알림 전송 실패:', error);
        throw error;
    }
}

// sendPushNotification 함수 정의 (방법 2)
async function sendPushNotification(title, body, data = {}) {
    return await sendNotification(title, body, data);
}

// 목표가 달성되었을 때 알림
async function sendTargetReachedNotification(rate, targetRate, type) {
    try {
        const title = '목표 환율 달성!';
        const body = `현재 환율(${rate}원)이 ${type === 'upper' ? '상향' : '하향'} 목표치(${targetRate}원)에 도달했습니다.`;
        
        await sendNotification(title, body, {
            type: 'target_reached',
            rate: rate,
            targetRate: targetRate,
            targetType: type
        });
        
        Swal.fire({
            icon: 'success',
            title: '알림 전송 완료',
            text: '목표 달성 알림이 전송되었습니다.'
        });
    } catch (error) {
        console.error('목표 달성 알림 실패:', error);
        Swal.fire({
            icon: 'error',
            title: '알림 전송 실패',
            text: `오류: ${error.message}`
        });
    }
}

// 투자 완료 알림
async function sendInvestmentCompletedNotification(investmentId, amount) {
    try {
        const title = '투자 완료';
        const body = `${amount}엔 투자가 완료되었습니다.`;
        
        await sendNotification(title, body, {
            type: 'investment_completed',
            investmentId: investmentId,
            amount: amount
        });
        console.log('투자 완료 알림 전송됨');
    } catch (error) {
        console.error('투자 완료 알림 실패:', error);
    }
}

// 환율 변동 알림
async function sendExchangeRateChangeNotification(newRate, oldRate) {
    try {
        const difference = (newRate - oldRate).toFixed(2);
        const direction = difference > 0 ? '상승' : '하락';
        
        const title = '환율 변동 알림';
        const body = `환율이 ${Math.abs(difference)}원 ${direction}했습니다. (현재: ${newRate}원)`;
        
        await sendNotification(title, body, {
            type: 'rate_change',
            newRate: newRate,
            oldRate: oldRate,
            difference: difference
        });
        
        console.log('환율 변동 알림 전송됨');
    } catch (error) {
        console.error('환율 변동 알림 실패:', error);
    }
}

// 테스트 알림
async function sendTestNotification() {
    try {
        console.log('테스트 알림 시작...');
        
        if (!messagingToken) {
            console.error('FCM 토큰 없음!');
            throw new Error('FCM 토큰이 없습니다. 알림 설정을 다시 해주세요.');
        }
        
        console.log('현재 FCM 토큰:', messagingToken);
        
        // 서비스 워커 상태 확인
        const registration = await navigator.serviceWorker.getRegistration();
        console.log('현재 Service Worker 상태:', registration);
        
        // Firestore에 알림 요청 저장
        const notificationRef = await db.collection('notifications').add({
            token: messagingToken,
            title: '테스트 알림',
            body: `테스트 알림입니다. (${new Date().toLocaleString()})`,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            type: 'test'
        });
        
        console.log('알림 요청 Firestore에 저장됨:', notificationRef.id);
        
        // 로컬 알림 즉시 표시
        if (registration) {
            console.log('로컬 알림 표시 시도...');
            await registration.showNotification('테스트 알림 (로컬)', {
                body: `로컬 테스트 알림입니다. (${new Date().toLocaleString()})`,
                icon: '/icon.png',
                vibrate: [200, 100, 200],
                tag: 'test-notification'
            });
            console.log('로컬 알림 표시 완료');
        }
        
        // 포그라운드 메시지 핸들러 설정
        const messaging = firebase.messaging();
        messaging.onMessage((payload) => {
            console.log('포그라운드 메시지 수신:', payload);
            
            if (registration) {
                registration.showNotification(payload.notification.title, {
                    body: payload.notification.body,
                    icon: '/icon.png',
                    vibrate: [200, 100, 200],
                    tag: 'fcm-notification'
                });
            }
        });
        
        console.log('테스트 알림 프로세스 완료');
        
        Swal.fire({
            icon: 'success',
            title: '알림 전송 완료',
            text: '알림이 전송되었습니다. 잠시 후 알림이 도착해야 합니다.'
        });
        
    } catch (error) {
        console.error('테스트 알림 실패:', error);
        console.error('상세 에러:', error.message);
        
        Swal.fire({
            icon: 'error',
            title: '알림 전송 실패',
            text: `오류: ${error.message}`
        });
    }
}

// 포그라운드 메시지 핸들러 설정
function setupMessageHandler() {
    const messaging = firebase.messaging();
    messaging.onMessage(async (payload) => {
        console.log('포그라운드 메시지 수신:', payload);
        
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
            await registration.showNotification(payload.notification.title, {
                body: payload.notification.body,
                icon: '/icon.png',
                vibrate: [200, 100, 200],
                tag: 'fcm-notification',
                data: payload.data
            });
        }
    });
}

// 페이지 로드 시 메시지 핸들러 설정
document.addEventListener('DOMContentLoaded', () => {
    setupMessageHandler();
    // ... 기존 코드 ...
});

// 테스트 버튼 추가
document.addEventListener('DOMContentLoaded', () => {
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
        const testButton = document.createElement('button');
        testButton.textContent = '알림 테스트';
        testButton.className = 'settings-button';
        testButton.style.marginRight = '10px';
        testButton.onclick = sendTestNotification;
        headerActions.insertBefore(testButton, headerActions.firstChild);
    }
});

// FCM 토큰 표시 함수
function showFCMToken() {
    if (!messagingToken) {
        Swal.fire({
            icon: 'error',
            title: 'FCM 토큰 없음',
            text: 'FCM 토큰이 아직 생성되지 않았습니다. 페이지를 새로고침 해보세요.',
            confirmButtonText: '확인'
        });
        return;
    }

    Swal.fire({
        title: 'FCM 토큰',
        html: `
            <div style="word-break: break-all; margin-bottom: 10px;">
                ${messagingToken}
            </div>
            <div style="font-size: 12px; color: #666;">
                * 이 토큰은 이 기기에서 푸시 알림을 받기 위한 고유 식별자입니다.
            </div>
        `,
        confirmButtonText: '복사',
        showCancelButton: true,
        cancelButtonText: '닫기'
    }).then((result) => {
        if (result.isConfirmed) {
            // 모바일에서도 작동하는 복사 기능
            const textarea = document.createElement('textarea');
            textarea.value = messagingToken;
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                Swal.fire({
                    icon: 'success',
                    title: '복사 완료',
                    text: '토큰이 클립보드에 복사되었습니다.',
                    timer: 1500,
                    showConfirmButton: false
                });
            } catch (err) {
                console.error('토큰 복사 실패:', err);
                Swal.fire({
                    icon: 'error',
                    title: '복사 실패',
                    text: '토큰을 수동으로 복사해주세요.'
                });
            }
            document.body.removeChild(textarea);
        }
    });
}

// 헤더에 FCM 토큰 확인 버튼 추가
document.addEventListener('DOMContentLoaded', () => {
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
        const tokenButton = document.createElement('button');
        tokenButton.textContent = 'FCM 토큰';
        tokenButton.className = 'settings-button';
        tokenButton.style.marginRight = '10px';
        tokenButton.onclick = showFCMToken;
        headerActions.insertBefore(tokenButton, headerActions.firstChild);
    }
});

// 환율 정보 가져오기 함수
async function fetchExchangeRate() {
    try {
        console.log('환율 정보 요청 시작');
        const response = await fetch('https://m.search.naver.com/p/csearch/content/qapirender.nhn?key=calculator&pkid=141&q=%ED%99%98%EC%9C%A8&where=m&u1=keb&u6=standardUnit&u7=0&u3=JPY&u4=KRW&u8=down&u2=100', {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('네이버 환율 데이터:', data);

        if (data && data.country && data.country[1]) {
            // 문자열로 반환된 환율을 파싱 후 소수점 두자리로 고정
            const newRate = parseFloat(data.country[1].value.replace(/,/g, '')).toFixed(2);
            return parseFloat(newRate);
        } else {
            throw new Error('환율 데이터를 찾을 수 없습니다');
        }
    } catch (error) {
        console.error('환율 정보 가져오기 실패:', error);
        return null;
    }
}

// 환율 업데이트 함수: 업데이트될 때마다 현재 환율을 적용하고, 로컬 푸시 알림 조건 검사 호출
async function updateCurrentRate() {
    try {
        const now = new Date();
        console.log('환율 업데이트 시작:', now.toLocaleString());
        
        const response = await fetch('https://m.search.naver.com/p/csearch/content/qapirender.nhn?key=calculator&pkid=141&q=%ED%99%98%EC%9C%A8&where=m&u1=keb&u6=standardUnit&u7=0&u3=JPY&u4=KRW&u8=down&u2=100', {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('네이버 환율 데이터:', data);
        
        if (data && data.country && data.country[1]) {
            // 가져온 환율 정보를 파싱합니다.
            const rate = parseFloat(data.country[1].value.replace(/,/g, '')).toFixed(2);
            
            console.log('=== 환율 정보 ===');
            console.log('현재 시각:', now.toLocaleString());
            console.log('100엔:', rate);
            
            const rateElement = document.getElementById('currentRate');
            if (rateElement) {
                rateElement.textContent = `${rate}원 (${now.toLocaleTimeString()})`;
                console.log('환율 업데이트 완료');
            }
            
            // 환율 업데이트 될 때마다 최소 매수 목표 조건 검사 및 알림 전송 (이미 가져온 환율값을 이용)
            await checkAndSendNotifications(parseFloat(rate));
        } else {
            throw new Error('환율 데이터를 찾을 수 없습니다');
        }
    } catch (error) {
        console.error('환율 정보 가져오기 실패:', error);
        console.error('상세 에러:', error.message);
        const rateElement = document.getElementById('currentRate');
        if (rateElement) {
            rateElement.textContent = '환율 정보 없음';
        }
    }
}

// 환율 업데이트 주기 설정: 3분마다 updateCurrentRate 호출 (updateCurrentRate 내부에서 푸시 알림 검사 진행)
function startExchangeRateUpdates() {
    // 즉시 실행
    updateCurrentRate();
    
    // 3분마다 실행 (3분 = 3 * 60 * 1000 밀리초)
    setInterval(updateCurrentRate, 3 * 60 * 1000);
}

// 페이지 로드 시 환율 업데이트 시작
document.addEventListener('DOMContentLoaded', () => {
    startExchangeRateUpdates();
});

// 환율 체크 및 알림 함수
async function checkAndSendNotifications(currentRate) {
    // 전달받은 currentRate 사용, 없으면 새로 가져오기
    if (typeof currentRate === 'undefined') {
        currentRate = await fetchExchangeRate();
        if (currentRate === null) return;
    }
    
    console.log(`현재 환율: ${currentRate}원`);
    
    // 현재 투자 내역에서 매수 목표(투자 환율 - settings.buyThreshold) 계산
    const buyTargets = currentInvestments
        .map(inv => inv.exchangeRate - settings.buyThreshold)
        .filter(target => !isNaN(target));
    
    if (buyTargets.length === 0) {
        console.warn("매수 목표 금액을 계산할 수 있는 투자 내역이 없습니다.");
        return;
    }
    
    // 모든 투자 내역 중 가장 낮은 매수 목표 금액 계산
    const minBuyTarget = Math.min(...buyTargets);
    console.log(`최소 매수 목표 금액: ${minBuyTarget.toFixed(2)}원`);
    
    // 조건: 현재 환율이 최소 매수 목표 금액에서 2원 이상 낮을 때
    if (currentRate <= (minBuyTarget - 2)) {
        try {
            await sendPushNotification(
                '매수 기회!',
                `현재 환율(${currentRate}원)이 최소 매수 목표 금액(${minBuyTarget.toFixed(2)}원)보다 2원 이상 낮습니다.`,
                { type: 'buy_opportunity' }
            );
            console.log("매수 기회 알림 전송됨");
        } catch (error) {
            console.error("매수 알림 전송 실패:", error);
        }
    } else {
        console.log("알림 조건 미충족: 현재 환율이 최소 매수 목표 금액 - 2원보다 높습니다.");
    }
}

// 다크 모드 토글 및 상태 유지 함수
function initializeDarkMode() {
    const darkModeBtn = document.getElementById('dark-mode-btn');

    // 저장된 다크 모드 설정 불러오기
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
        darkModeBtn.textContent = '라이트 모드';
    } else {
        darkModeBtn.textContent = '다크 모드';
    }

    darkModeBtn.addEventListener('click', function () {
        console.log('다크 모드 버튼 클릭됨'); // 디버깅용 로그
        document.body.classList.toggle('dark-mode');

        if (document.body.classList.contains('dark-mode')) {
            darkModeBtn.textContent = '라이트 모드';
            localStorage.setItem('darkMode', 'enabled');
            console.log('다크 모드 활성화됨'); // 디버깅용 로그
        } else {
            darkModeBtn.textContent = '다크 모드';
            localStorage.setItem('darkMode', 'disabled');
            console.log('라이트 모드 활성화됨'); // 디버깅용 로그
        }
    });
}

// 푸시 알림 권한 요청 함수
async function requestNotificationPermission() {
    // 브라우저에서 푸시 알림 권한을 요청합니다.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        alert('푸시 알림 권한이 필요합니다.');
    }
}

// 푸시 알림 전송 함수
async function sendPushNotification(title, body, data = {}) {
    return await sendNotification(title, body, data);
}

// FCM 토큰 새로고침 함수
function refreshFCMToken() {
    // 페이지 새로고침
    location.reload();
}

// 페이지 로드 시 다크 모드 상태 유지
document.addEventListener('DOMContentLoaded', () => {
    const isDarkMode = localStorage.getItem('darkMode') === 'true'; // 로컬 스토리지에서 다크 모드 상태 확인
    if (isDarkMode) {
        document.body.classList.add('dark-mode'); // 다크 모드 클래스 추가
    }
});

// 다크 모드 토글 함수 수정
function toggleDarkMode() {
    const isDarkMode = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDarkMode); // 다크 모드 상태를 로컬 스토리지에 저장
}
