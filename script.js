// 투자 데이터를 저장할 배열들
let currentInvestments = [];
let completedInvestments = [];

// 전역 변수에 설정값 추가
let settings = {
    buyThreshold: 2,
    sellThreshold: 2,
    initialCapital: null, // Firestore에 저장될 투자 원금
    startDate: null,      // Firestore에 저장될 시작 날짜
    endDate: null         // Firestore에 저장될 종료 날짜
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

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 데이터 로드
async function loadData() {
    try {
        const currentSnapshot = await db.collection('currentInvestments').get();
        currentInvestments = currentSnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id
        }));

        const completedSnapshot = await db.collection('completedInvestments').get();
        completedInvestments = completedSnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id
        }));

        await loadSettings(); // 설정 로드 추가
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
    
    const submitButton = document.querySelector('#investmentForm button[type="submit"]');
    submitButton.textContent = '수정';
    
    document.getElementById('investmentForm').dataset.editMode = id;
    
    if (!document.getElementById('cancelEdit')) {
        const cancelButton = document.createElement('button');
        cancelButton.id = 'cancelEdit';
        cancelButton.type = 'button';
        cancelButton.textContent = '취소';
        cancelButton.onclick = cancelEdit;
        document.getElementById('investmentForm').appendChild(cancelButton);
    }
}

// 투자 폼 제출 이벤트
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
            const updateData = {
                ...investment,
                shortSell: false,
                shortSellSellRate: firebase.firestore.FieldValue.delete(),
                shortSellTargetBuy: firebase.firestore.FieldValue.delete()
            };
            await db.collection('currentInvestments').doc(editMode).update(updateData);
            const index = currentInvestments.findIndex(inv => inv.id === editMode);
            if (index !== -1) {
                currentInvestments[index] = { ...investment, id: editMode, shortSell: false };
            }
            delete this.dataset.editMode;
            document.querySelector('#investmentForm button[type="submit"]').textContent = '추가';
            if (document.getElementById('cancelEdit')) {
                document.getElementById('cancelEdit').remove();
            }
        } else {
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
        await db.collection('currentInvestments').doc(id).delete();
        currentInvestments = currentInvestments.filter(inv => inv.id !== id);
        updateTables();
        updateSummary();
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
        await db.collection('currentInvestments').doc(id).delete();
        const docRef = await db.collection('completedInvestments').add(completedInvestment);
        completedInvestment.id = docRef.id;
        
        currentInvestments = currentInvestments.filter(inv => inv.id !== id);
        completedInvestments.push(completedInvestment);
        
        updateTables();
        updateSummary();
    } catch (error) {
        console.error('매도 처리 실패:', error);
        alert('매도 처리에 실패했습니다.');
    }
}

// 테이블 업데이트
function updateTables() {
    currentInvestments.sort((a, b) => new Date(a.date) - new Date(b.date));
    completedInvestments.sort((a, b) => new Date(b.sellDate) - new Date(a.sellDate));

    const tableBody = document.querySelector('#currentInvestmentsTable tbody');
    tableBody.innerHTML = '';

    currentInvestments.forEach(investment => {
        const row = document.createElement('tr');
        const dateCell = document.createElement('td');
        dateCell.textContent = new Date(investment.date).toLocaleDateString();
        row.appendChild(dateCell);

        const amountCell = document.createElement('td');
        amountCell.textContent = investment.amountYen;
        row.appendChild(amountCell);

        const exchangeRateCell = document.createElement('td');
        exchangeRateCell.textContent = investment.exchangeRate;
        row.appendChild(exchangeRateCell);

        const amountKrwCell = document.createElement('td');
        amountKrwCell.textContent = investment.amountKrw.toLocaleString() + '원';
        row.appendChild(amountKrwCell);

        const actionCell = document.createElement('td');
        const buyTargetVal = Number(investment.exchangeRate) - settings.buyThreshold;
        const sellTargetVal = Number(investment.exchangeRate) + settings.sellThreshold;

        const buySpan = document.createElement('span');
        buySpan.className = 'buy-target';
        buySpan.textContent = `매수: ${buyTargetVal.toFixed(2)}원`;
        actionCell.appendChild(buySpan);
        actionCell.appendChild(document.createElement('br'));

        const sellSpan = document.createElement('span');
        sellSpan.className = 'sell-target';
        sellSpan.textContent = `매도: ${sellTargetVal.toFixed(2)}원`;
        actionCell.appendChild(sellSpan);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'action-buttons';

        const editButton = document.createElement('button');
        editButton.textContent = '수정';
        editButton.className = 'table-btn edit';
        editButton.onclick = function() { editInvestment(investment.id); };
        buttonContainer.appendChild(editButton);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = '삭제';
        deleteButton.className = 'table-btn delete';
        deleteButton.onclick = function() { deleteInvestment(investment.id); };
        buttonContainer.appendChild(deleteButton);

        const sellButton = document.createElement('button');
        sellButton.textContent = '매도';
        sellButton.className = 'table-btn sell';
        sellButton.onclick = function() { sellInvestment(investment.id); };
        buttonContainer.appendChild(sellButton);

        const shortSellButton = document.createElement('button');
        shortSellButton.textContent = '공매도';
        shortSellButton.className = 'table-btn shortsell';
        shortSellButton.onclick = function() { handleShortSell(investment.id, row, actionCell); };
        buttonContainer.appendChild(shortSellButton);

        actionCell.appendChild(buttonContainer);
        row.appendChild(actionCell);

        if (investment.shortSell) {
            row.style.backgroundColor = '#cce5ff';
            const shortSellLabel = document.createElement('span');
            shortSellLabel.textContent = ' *공매도 중*';
            shortSellLabel.style.color = 'blue';
            shortSellLabel.style.fontWeight = 'bold';
            actionCell.appendChild(shortSellLabel);

            if (investment.shortSellTargetBuy !== undefined) {
                const targetBuyDiv = document.createElement('div');
                targetBuyDiv.textContent = `목표 매수가: ${Number(investment.shortSellTargetBuy).toFixed(2)}원`;
                targetBuyDiv.style.color = 'blue';
                actionCell.appendChild(targetBuyDiv);
            }

            const buyButton = document.createElement('button');
            buyButton.textContent = '매수';
            buyButton.className = 'table-btn buy';
            buyButton.style.fontSize = '10px';
            buyButton.style.padding = '2px 4px';
            buyButton.onclick = function() {
                const buyRateStr = prompt('매수 환율을 입력하세요 (100엔 기준):', '');
                if (!buyRateStr) return;
                const newBuyRate = Number(buyRateStr);
                if (isNaN(newBuyRate) || newBuyRate <= 0) {
                    alert('올바른 매수 환율을 입력해주세요.');
                    return;
                }
                const newExchangeRate = investment.exchangeRate - investment.shortSellSellRate + newBuyRate;
                const newAmountKrw = investment.amountYen * (newExchangeRate / 100);
                db.collection('currentInvestments').doc(investment.id).update({
                    shortSell: false,
                    shortSellSellRate: firebase.firestore.FieldValue.delete(),
                    shortSellTargetBuy: firebase.firestore.FieldValue.delete(),
                    exchangeRate: newExchangeRate,
                    amountKrw: newAmountKrw
                }).then(() => {
                    const index = currentInvestments.findIndex(inv => inv.id === investment.id);
                    if (index !== -1) {
                        currentInvestments[index].shortSell = false;
                        currentInvestments[index].exchangeRate = newExchangeRate;
                        currentInvestments[index].amountKrw = newAmountKrw;
                    }
                    updateTables();
                }).catch(error => {
                    console.error('매수 환율 저장 실패:', error);
                    alert('매수 환율 저장에 실패했습니다.');
                });
            };
            actionCell.appendChild(buyButton);
        }

        tableBody.appendChild(row);
    });
    
    const historyTable = document.querySelector('#historyTable tbody');
    historyTable.innerHTML = completedInvestments.map(inv => {
        return `
        <tr>
            <td>${new Date(inv.date).toLocaleDateString()}</td>
            <td>${new Date(inv.sellDate).toLocaleDateString()}</td>
            <td>${inv.amountYen.toLocaleString()}엔</td>
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
async function updateSummary() {
    try {
        if (!completedInvestments || completedInvestments.length === 0) {
            document.getElementById('totalProfit').textContent = '0원';
            document.getElementById('totalReturn').textContent = '0%';
            document.getElementById('adjustedReturn').textContent = '연 조정 수익률: 0%';
            return;
        }

        const totalProfit = completedInvestments.reduce((sum, inv) => sum + inv.profitLoss, 0);
        const totalInvested = completedInvestments.reduce((sum, inv) => sum + inv.amountKrw, 0);
        const overallReturn = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

        const firstPurchaseTime = Math.min(...completedInvestments.map(inv => new Date(inv.date).getTime()));
        const lastSellTime = Math.max(...completedInvestments.map(inv => new Date(inv.sellDate).getTime()));
        const totalDays = (lastSellTime - firstPurchaseTime) / (1000 * 60 * 60 * 24);

        const totalReturn = totalDays > 0 ? overallReturn / totalDays : overallReturn;

        document.getElementById('totalProfit').textContent = `${totalProfit.toLocaleString()}원`;
        document.getElementById('totalReturn').textContent = `${totalReturn.toFixed(2)}%`;

        const initialCapitalInput = document.getElementById('initialCapital');
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');

        // Firestore에서 저장된 값 반영 (입력값이 없으면 Firestore 값 사용)
        const initialCapital = Number(initialCapitalInput.value) || settings.initialCapital || totalInvested;
        const startDate = startDateInput.value ? new Date(startDateInput.value) : (settings.startDate ? new Date(settings.startDate) : new Date(firstPurchaseTime));
        const endDate = endDateInput.value ? new Date(endDateInput.value) : (settings.endDate ? new Date(settings.endDate) : new Date(lastSellTime));
        
        const investmentPeriodDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
        const adjustedPeriodDays = investmentPeriodDays > 0 ? investmentPeriodDays : totalDays || 1;
        const adjustedPeriodYears = adjustedPeriodDays / 365; // 일수를 연으로 환산

        const adjustedReturn = initialCapital > 0 && adjustedPeriodYears > 0 
            ? (totalProfit / initialCapital) * 100 / adjustedPeriodYears 
            : 0;

        document.getElementById('adjustedReturn').textContent = `연 조정 수익률: ${adjustedReturn.toFixed(2)}%`;

        // 입력값이 변경되면 Firestore에 저장
        initialCapitalInput.oninput = async () => {
            settings.initialCapital = Number(initialCapitalInput.value) || null;
            await saveSettings();
            updateSummary();
        };
        startDateInput.onchange = async () => {
            settings.startDate = startDateInput.value || null;
            await saveSettings();
            updateSummary();
        };
        endDateInput.onchange = async () => {
            settings.endDate = endDateInput.value || null;
            await saveSettings();
            updateSummary();
        };

    } catch (error) {
        console.error('투자 실적 요약 업데이트 실패:', error);
        document.getElementById('totalProfit').textContent = '0원';
        document.getElementById('totalReturn').textContent = '데이터 로드에 실패했습니다.';
        document.getElementById('adjustedReturn').textContent = '연 조정 수익률: 0%';
    }
}

// 설정 로드 함수
async function loadSettings() {
    try {
        const doc = await db.collection('settings').doc('thresholds').get();
        if (doc.exists) {
            settings = doc.data();
            // UI에 반영
            if (settings.initialCapital) document.getElementById('initialCapital').value = settings.initialCapital;
            if (settings.startDate) document.getElementById('startDate').value = settings.startDate;
            if (settings.endDate) document.getElementById('endDate').value = settings.endDate;
        } else {
            settings = { 
                buyThreshold: 2, 
                sellThreshold: 2, 
                initialCapital: null, 
                startDate: null, 
                endDate: null 
            };
            await saveSettings();
        }
        updateTables();
    } catch (error) {
        console.error('설정 로드 실패:', error);
        settings = { 
            buyThreshold: 2, 
            sellThreshold: 2, 
            initialCapital: null, 
            startDate: null, 
            endDate: null 
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
    try {
        const doc = await db.collection('settings').doc('thresholds').get();
        const currentSettings = doc.exists ? doc.data() : { buyThreshold: 2, sellThreshold: 2 };
        
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
            settings.buyThreshold = formValues.buyThreshold;
            settings.sellThreshold = formValues.sellThreshold;
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

// 초기 로드
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadData();
        updateSummary();
        initializeDarkMode();
        requestNotificationPermission();
        startExchangeRateUpdates();
    } catch (error) {
        console.error('초기 로드 중 오류 발생:', error);
    }
});

// 완료된 투자 수정
async function editCompletedInvestment(id) {
    const investment = completedInvestments.find(inv => inv.id === id);
    if (!investment) return;
    
    const purchaseDate = new Date(investment.date).toISOString().split('T')[0];
    const sellDate = new Date(investment.sellDate).toISOString().split('T')[0];
    
    const form = document.createElement('form');
    form.innerHTML = `
        <div style="margin: 10px 0;">
            <label>구매일:<br><input type="date" id="editPurchaseDate" value="${purchaseDate}" required></label>
        </div>
        <div style="margin: 10px 0;">
            <label>매도일:<br><input type="date" id="editSellDate" value="${sellDate}" required></label>
        </div>
        <div style="margin: 10px 0;">
            <label>엔화 금액:<br><input type="number" id="editAmountYen" value="${investment.amountYen}" required></label>
        </div>
        <div style="margin: 10px 0;">
            <label>구매 환율 (100엔):<br><input type="number" step="0.01" id="editExchangeRate" value="${investment.exchangeRate}" required></label>
        </div>
        <div style="margin: 10px 0;">
            <label>매도 환율 (100엔):<br><input type="number" step="0.01" id="editSellExchangeRate" value="${investment.sellExchangeRate}" required></label>
        </div>
    `;
    
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
    
    if (!newData.purchaseDate || !newData.sellDate || 
        !newData.amountYen || !newData.exchangeRate || !newData.sellExchangeRate) {
        alert('모든 필드를 입력해주세요.');
        return;
    }
    
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
        await db.collection('completedInvestments').doc(id).update(updatedInvestment);
        const index = completedInvestments.findIndex(inv => inv.id === id);
        if (index !== -1) {
            completedInvestments[index] = updatedInvestment;
        }
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

// 완료된 투자 삭제
async function deleteCompletedInvestment(id) {
    if (!confirm('정말 이 투자 실적을 삭제하시겠습니까?')) return;
    
    try {
        await db.collection('completedInvestments').doc(id).delete();
        completedInvestments = completedInvestments.filter(inv => inv.id !== id);
        updateTables();
        updateSummary();
    } catch (error) {
        console.error('투자 실적 삭제 실패:', error);
        alert('투자 실적 삭제에 실패했습니다. 에러: ' + error.message);
    }
}

// 환율 정보 가져오기
async function fetchExchangeRate() {
    try {
        const response = await fetch('https://m.search.naver.com/p/csearch/content/qapirender.nhn?key=calculator&pkid=141&q=%ED%99%98%EC%9C%A8&where=m&u1=keb&u6=standardUnit&u7=0&u3=JPY&u4=KRW&u8=down&u2=100', {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data && data.country && data.country[1]) {
            return parseFloat(data.country[1].value.replace(/,/g, '')).toFixed(2);
        } else {
            throw new Error('환율 데이터를 찾을 수 없습니다');
        }
    } catch (error) {
        console.error('환율 정보 가져오기 실패:', error);
        return null;
    }
}

// 환율 업데이트
async function updateCurrentRate() {
    try {
        const rate = await fetchExchangeRate();
        if (rate) {
            const now = new Date();
            document.getElementById('currentRate').textContent = `${rate}원 (${now.toLocaleTimeString()})`;
            await checkAndSendNotifications(parseFloat(rate));
        }
    } catch (error) {
        console.error('환율 업데이트 실패:', error);
        document.getElementById('currentRate').textContent = '환율 정보 없음';
    }
}

// 환율 업데이트 주기 설정
function startExchangeRateUpdates() {
    updateCurrentRate();
    setInterval(updateCurrentRate, 3 * 60 * 1000);
}

// 환율 체크 및 알림
async function checkAndSendNotifications(currentRate) {
    if (typeof currentRate === 'undefined') {
        currentRate = await fetchExchangeRate();
        if (currentRate === null) return;
    }

    const validInvestments = currentInvestments.filter(inv => inv && inv.exchangeRate !== undefined && !isNaN(Number(inv.exchangeRate)));
    if (validInvestments.length === 0) return;

    const buyTargets = validInvestments.map(inv => Number(inv.exchangeRate) - settings.buyThreshold).filter(target => !isNaN(target));
    if (buyTargets.length === 0) return;

    const minBuyTarget = Math.min(...buyTargets);
    if (currentRate <= (minBuyTarget - 2)) {
        try {
            await sendPushNotification(
                '매수 기회!',
                `현재 환율(${currentRate}원)이 최소 매수 목표 금액(${minBuyTarget.toFixed(2)}원)보다 2원 이상 낮습니다.`,
                { type: 'buy_opportunity' }
            );
        } catch (error) {
            console.error('매수 알림 전송 실패:', error);
        }
    }
}

// 다크 모드 초기화
function initializeDarkMode() {
    const darkModeBtn = document.getElementById('dark-mode-btn');
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
        darkModeBtn.textContent = '라이트 모드';
    } else {
        darkModeBtn.textContent = '다크 모드';
    }

    darkModeBtn.addEventListener('click', function () {
        document.body.classList.toggle('dark-mode');
        if (document.body.classList.contains('dark-mode')) {
            darkModeBtn.textContent = '라이트 모드';
            localStorage.setItem('darkMode', 'enabled');
        } else {
            darkModeBtn.textContent = '다크 모드';
            localStorage.setItem('darkMode', 'disabled');
        }
    });
}

// 푸시 알림 권한 요청
async function requestNotificationPermission() {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        alert('푸시 알림 권한이 필요합니다.');
    }
}

// 푸시 알림 전송 (간소화된 버전)
async function sendPushNotification(title, body, data = {}) {
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
            await registration.showNotification(title, {
                body: body,
                icon: '/icon.png',
                vibrate: [200, 100, 200],
                tag: 'notification',
                data: data
            });
        }
    } catch (error) {
        console.error('푸시 알림 전송 실패:', error);
    }
}

// FCM 토큰 새로고침
function refreshFCMToken() {
    location.reload();
}

// 공매도 처리
function handleShortSell(id, row, actionCell) {
    const sellRateStr = prompt('판매 환율을 입력하세요 (100엔 기준):', '');
    if (!sellRateStr) return;

    const sellRate = Number(sellRateStr);
    if (isNaN(sellRate) || sellRate <= 0) {
        alert('올바른 판매 환율을 입력해주세요.');
        return;
    }
    
    row.style.backgroundColor = '#cce5ff';
    const shortSellLabel = document.createElement('span');
    shortSellLabel.textContent = ' *공매도 중*';
    shortSellLabel.style.color = 'blue';
    shortSellLabel.style.fontWeight = 'bold';
    actionCell.appendChild(shortSellLabel);
    
    const targetBuy = sellRate - 5;
    const targetBuyDiv = document.createElement('div');
    targetBuyDiv.textContent = `목표 매수가: ${targetBuy.toFixed(2)}원`;
    targetBuyDiv.style.color = 'blue';
    actionCell.appendChild(targetBuyDiv);

    db.collection('currentInvestments').doc(id).update({
        shortSell: true,
        shortSellSellRate: sellRate,
        shortSellTargetBuy: targetBuy,
    }).catch(error => {
        console.error('공매도 정보 저장 실패:', error);
    });
}
