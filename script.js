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
    // 총 수익 (원)
    const totalProfit = completedInvestments.reduce((sum, inv) => sum + inv.profitLoss, 0);
    // 총 투자 원화 금액 (구매 시점 기준)
    const totalInvested = completedInvestments.reduce((sum, inv) => sum + inv.amountKrw, 0);
    // 전체 투자에 대한 전체 수익률 (백분율)
    const overallReturn = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

    let totalDays = 0;
    if (completedInvestments.length > 0) {
        // 모든 완료된 투자에서 첫 구매일과 마지막 매도일을 구합니다.
        const firstPurchaseTime = Math.min(...completedInvestments.map(inv => new Date(inv.date).getTime()));
        const lastSellTime = Math.max(...completedInvestments.map(inv => new Date(inv.sellDate).getTime()));
        // 두 날짜 사이의 일수 (소수점 포함)
        totalDays = (lastSellTime - firstPurchaseTime) / (1000 * 60 * 60 * 24);
    }
    
    // 총 투자 기간(일)로 전체 수익률을 나누어 총 수익률 산출
    const totalReturn = totalDays > 0 ? overallReturn / totalDays : overallReturn;
    
    document.getElementById('totalProfit').textContent = `${totalProfit.toLocaleString()}원`;
    // 기존 "평균 수익률"을 "총 수익률"로 표시 (HTML 요소 id: totalReturn 로 변경)
    document.getElementById('totalReturn').textContent = `${totalReturn.toFixed(2)}%`;
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
