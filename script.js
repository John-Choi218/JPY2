// 투자 데이터를 저장할 배열들
let currentInvestments = [];
let completedInvestments = [];

// 전역 변수에 설정값 추가
let settings = {
    buyThreshold: 2,
    sellThreshold: 2,
    shortSellBuyDiff: 5, // 공매도 다음 매수가 차이 기본값
    initialCapital: null,
    startDate: null,
    endDate: null,
    profitStartDate: null,
    profitEndDate: null
};

// 공매도 축소/확장 상태 변수 추가
let shortSellCollapsed = false;

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

        await loadSettings();
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
    document.getElementById('note').value = investment.note || '';
    
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
    const note = document.getElementById('note').value.trim();
    const amountKrw = amountYen * (exchangeRate / 100);
    
    const investment = {
        date: new Date(purchaseDate).toISOString(),
        amountYen: amountYen,
        exchangeRate: exchangeRate,
        amountKrw: amountKrw,
        note: note || ''
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
    // "다음 매수가"를 기준으로 오름차순 정렬 (공매도 상태 고려)
    currentInvestments.sort((a, b) => {
        const buyTargetA = a.shortSell && a.shortSellTargetBuy !== undefined ? Number(a.shortSellTargetBuy) : Number(a.exchangeRate) - settings.buyThreshold;
        const buyTargetB = b.shortSell && b.shortSellTargetBuy !== undefined ? Number(b.shortSellTargetBuy) : Number(b.exchangeRate) - settings.buyThreshold;
        return buyTargetA - buyTargetB;
    });

    completedInvestments.sort((a, b) => new Date(b.sellDate) - new Date(a.sellDate));

    const tableBody = document.querySelector('#currentInvestmentsTable tbody');
    tableBody.innerHTML = '';

    // 공매도 중인 투자들 분리
    const shortSellInvestments = currentInvestments.filter(inv => inv.shortSell);
    const normalInvestments = currentInvestments.filter(inv => !inv.shortSell);

    // 공매도 축소 모드일 때 요약 행 추가
    if (shortSellCollapsed && shortSellInvestments.length > 0) {
        const summaryRow = document.createElement('tr');
        summaryRow.className = 'shortsell-summary-row';
        
        // 공매도 개수와 다음 매수가가 가장 높은 값 찾기
        const highestTargetBuy = Math.max(...shortSellInvestments.map(inv => 
            inv.shortSellTargetBuy !== undefined ? Number(inv.shortSellTargetBuy) : 0
        ));
        
        summaryRow.innerHTML = `
            <td colspan="2" class="shortsell-summary-cell">
                <span class="shortsell-count">공매도 ${shortSellInvestments.length}개</span>
            </td>
            <td colspan="2" class="shortsell-summary-cell">
                <span class="shortsell-highest-target">최고 다음 매수가: ${highestTargetBuy.toFixed(2)}</span>
            </td>
            <td class="shortsell-summary-cell">
                <button class="table-btn expand" onclick="expandShortSell()">펼치기</button>
            </td>
        `;
        
        tableBody.appendChild(summaryRow);
    }

    // 일반 투자 항목들 표시
    normalInvestments.forEach(investment => {
        const row = createInvestmentRow(investment);
        tableBody.appendChild(row);
    });

    // 공매도 축소 모드가 아닐 때만 공매도 항목들 표시
    if (!shortSellCollapsed) {
        shortSellInvestments.forEach(investment => {
            const row = createInvestmentRow(investment);
            tableBody.appendChild(row);
        });
    }
    
    const historyTable = document.querySelector('#historyTable tbody');
    historyTable.innerHTML = completedInvestments.map(inv => {
        return `
        <tr>
            <td>${new Date(inv.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</td>
            <td>${new Date(inv.sellDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</td>
            <td>${inv.amountYen.toLocaleString()}</td>
            <td>${inv.exchangeRate.toFixed(2)}</td>
            <td>${inv.sellExchangeRate.toFixed(2)}</td>
            <td>${inv.profitLoss.toLocaleString()}</td>
            <td>${inv.profitLossRate.toFixed(1)}%</td>
            <td>
                <div class="button-group">
                    <button class="edit-button" onclick="editCompletedInvestment('${inv.id}')">수정</button>
                    <button class="delete-button" onclick="deleteCompletedInvestment('${inv.id}')">삭제</button>
                </div>
            </td>
        </tr>
    `}).join('');
}

// 투자 행 생성 함수
function createInvestmentRow(investment) {
    const row = document.createElement('tr');
    
    const dateCell = document.createElement('td');
    dateCell.textContent = new Date(investment.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
    row.appendChild(dateCell);

    const amountCell = document.createElement('td');
    amountCell.textContent = investment.amountYen.toLocaleString();
    row.appendChild(amountCell);

    const exchangeRateCell = document.createElement('td');
    const exchangeRateText = document.createElement('div');
    exchangeRateText.textContent = investment.exchangeRate.toFixed(2);
    exchangeRateCell.appendChild(exchangeRateText);

    const copyButton = document.createElement('button');
    copyButton.textContent = '복사';
    copyButton.className = 'table-btn copy';
    copyButton.onclick = function() {
        navigator.clipboard.writeText(investment.exchangeRate.toFixed(2))
            .then(() => {
                Swal.fire({
                    icon: 'success',
                    title: '복사 완료',
                    text: `${investment.exchangeRate.toFixed(2)}이(가) 클립보드에 복사되었습니다.`,
                    timer: 1000,
                    showConfirmButton: false
                });
            })
            .catch(err => {
                console.error('복사 실패:', err);
                Swal.fire({
                    icon: 'error',
                    title: '복사 실패',
                    text: '환율 복사에 실패했습니다.'
                });
            });
    };
    exchangeRateCell.appendChild(copyButton);
    row.appendChild(exchangeRateCell);

    const amountKrwCell = document.createElement('td');
    amountKrwCell.textContent = investment.amountKrw.toLocaleString();
    row.appendChild(amountKrwCell);

    const actionCell = document.createElement('td');
    
    if (investment.note) {
        const noteSpan = document.createElement('span');
        noteSpan.className = 'note-text';
        noteSpan.textContent = investment.note;
        actionCell.appendChild(noteSpan);
    }

    const buyTargetVal = Number(investment.exchangeRate) - settings.buyThreshold;
    const sellTargetVal = Number(investment.exchangeRate) + settings.sellThreshold;

    const buySpan = document.createElement('span');
    buySpan.className = 'buy-target';
    buySpan.textContent = `다음 매수가: ${buyTargetVal.toFixed(2)}`;
    actionCell.appendChild(buySpan);
    actionCell.appendChild(document.createElement('br'));

    const sellSpan = document.createElement('span');
    sellSpan.className = 'sell-target';
    sellSpan.textContent = `목표 매도가: ${sellTargetVal.toFixed(2)}`;
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
        row.classList.add('short-sell');
        const shortSellLabel = document.createElement('span');
        shortSellLabel.textContent = ' *공매도 중*';
        shortSellLabel.style.color = 'blue';
        shortSellLabel.style.fontWeight = 'bold';
        actionCell.appendChild(shortSellLabel);

        if (investment.shortSellTargetBuy !== undefined) {
            const targetBuyDiv = document.createElement('div');
            targetBuyDiv.textContent = `다음 매수가: ${Number(investment.shortSellTargetBuy).toFixed(2)}`;
            targetBuyDiv.style.color = 'blue';
            actionCell.appendChild(targetBuyDiv);
        }

        const buyButton = document.createElement('button');
        buyButton.textContent = '매수';
        buyButton.className = 'table-btn buy';
        buyButton.style.fontSize = '0.6rem';
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

    return row;
}

// 공매도 펼치기 함수
function expandShortSell() {
    shortSellCollapsed = false;
    const toggleBtn = document.getElementById('toggleShortSell');
    if (toggleBtn) {
        toggleBtn.textContent = '공매도 축소';
    }
    
    // 상태를 localStorage에 저장
    localStorage.setItem('shortSellCollapsed', 'false');
    
    updateTables();
}

// 원금 입력을 위한 alert 창
async function promptInitialCapital() {
    const { value: initialCapitalStr } = await Swal.fire({
        title: '원금 입력',
        input: 'number',
        inputLabel: '원금을 입력하세요 (원)',
        inputPlaceholder: '예: 1000000',
        showCancelButton: true,
confirmButtonText: '저장',
        cancelButtonText: '취소',
        inputValidator: (value) => {
            if (!value || isNaN(value) || Number(value) <= 0) {
                return '유효한 숫자를 입력해주세요.';
            }
        }
    });

    if (initialCapitalStr) {
        settings.initialCapital = Number(initialCapitalStr);
        await saveSettings();
        updateSummary();
    }
}

// 요약 정보 업데이트
async function updateSummary() {
    try {
        if (!completedInvestments || completedInvestments.length === 0) {
            document.getElementById('totalProfit').textContent = '0원';
            document.getElementById('totalReturn').textContent = '0%';
            document.getElementById('adjustedReturn').textContent = '연 조정 수익률: 0%';
            document.getElementById('initialCapitalDisplay').textContent = '0원';
            return;
        }

        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        const profitStartDateInput = document.getElementById('profitStartDate');
        const profitEndDateInput = document.getElementById('profitEndDate');

        // 총 수익 계산을 위한 기간 설정
        const firstPurchaseTime = Math.min(...completedInvestments.map(inv => new Date(inv.date).getTime()));
        const lastSellTime = Math.max(...completedInvestments.map(inv => new Date(inv.sellDate).getTime()));
        const profitStartDate = profitStartDateInput.value ? new Date(profitStartDateInput.value) : (settings.profitStartDate ? new Date(settings.profitStartDate) : new Date(firstPurchaseTime));
        const profitEndDate = profitEndDateInput.value ? new Date(profitEndDateInput.value) : (settings.profitEndDate ? new Date(settings.profitEndDate) : new Date(lastSellTime));

        // 총 수익을 위한 기간 내 투자 필터링
        const profitPeriodInvestments = completedInvestments.filter(inv => {
            const sellDate = new Date(inv.sellDate);
            return sellDate >= profitStartDate && sellDate <= profitEndDate;
        });
        const totalProfitInPeriod = profitPeriodInvestments.length > 0
            ? profitPeriodInvestments.reduce((sum, inv) => sum + inv.profitLoss, 0)
            : 0;
        document.getElementById('totalProfit').textContent = `${totalProfitInPeriod.toLocaleString()}원`;

        // 총 수익률 및 연 조정 수익률 계산을 위한 기간 설정
        const startDate = startDateInput.value ? new Date(startDateInput.value) : (settings.startDate ? new Date(settings.startDate) : new Date(firstPurchaseTime));
        const endDate = endDateInput.value ? new Date(endDateInput.value) : (settings.endDate ? new Date(settings.endDate) : new Date(lastSellTime));

        const initialCapital = settings.initialCapital || completedInvestments.reduce((sum, inv) => sum + inv.amountKrw, 0);
        document.getElementById('initialCapitalDisplay').textContent = `${initialCapital.toLocaleString()}원`;

        const periodInvestments = completedInvestments.filter(inv => {
            const sellDate = new Date(inv.sellDate);
            return sellDate >= startDate && sellDate <= endDate;
        });

        const totalInvested = completedInvestments.reduce((sum, inv) => sum + inv.amountKrw, 0);
        const overallReturn = totalInvested > 0 ? (completedInvestments.reduce((sum, inv) => sum + inv.profitLoss, 0) / totalInvested) * 100 : 0;

        document.getElementById('totalReturn').textContent = `${overallReturn.toFixed(2)}%`;

        const investmentPeriodDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
        const adjustedPeriodDays = investmentPeriodDays > 0 ? investmentPeriodDays : 1;
        const adjustedPeriodYears = adjustedPeriodDays / 365;

        const adjustedReturn = initialCapital > 0 && adjustedPeriodYears > 0 
            ? (periodInvestments.reduce((sum, inv) => sum + inv.profitLoss, 0) / initialCapital) * 100 / adjustedPeriodYears 
            : 0;

        document.getElementById('adjustedReturn').textContent = `연 조정 수익률: ${adjustedReturn.toFixed(2)}%`;

        // 총 수익 기간 설정 이벤트
        profitStartDateInput.onchange = async () => {
            settings.profitStartDate = profitStartDateInput.value || null;
            await saveSettings();
            updateSummary();
        };
        profitEndDateInput.onchange = async () => {
            settings.profitEndDate = profitEndDateInput.value || null;
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
        document.getElementById('initialCapitalDisplay').textContent = '0원';
    }
}

// 설정 로드 함수
async function loadSettings() {
    try {
        const doc = await db.collection('settings').doc('thresholds').get();
        if (doc.exists) {
            settings = doc.data();
            if (settings.startDate) document.getElementById('startDate').value = settings.startDate;
            if (settings.endDate) document.getElementById('endDate').value = settings.endDate;
            if (settings.profitStartDate) document.getElementById('profitStartDate').value = settings.profitStartDate;
            if (settings.profitEndDate) document.getElementById('profitEndDate').value = settings.profitEndDate;
        } else {
            settings = { 
                buyThreshold: 2, 
                sellThreshold: 2, 
                shortSellBuyDiff: 5, // 공매도 기본값 추가
                initialCapital: null, 
                startDate: null, 
                endDate: null,
                profitStartDate: null,
                profitEndDate: null
            };
            await saveSettings();
        }
        updateTables();
    } catch (error) {
        console.error('설정 로드 실패:', error);
        settings = { 
            buyThreshold: 2, 
            sellThreshold: 2, 
            shortSellBuyDiff: 5, // 공매도 기본값 추가
            initialCapital: null, 
            startDate: null, 
            endDate: null,
            profitStartDate: null,
            profitEndDate: null
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
        const currentSettings = doc.exists ? doc.data() : { buyThreshold: 2, sellThreshold: 2, shortSellBuyDiff: 5 };

        // 공매도 중인 투자 내역 확인
        const shortSellInvestments = currentInvestments.filter(inv => inv.shortSell);
        let shortSellInputHtml = '';
        if (shortSellInvestments.length > 0) {
            shortSellInputHtml = `
                <div class="form-group">
                    <label for="shortSellBuyDiff">공매도 다음 매수가 차이 (원)</label>
                    <input type="number" id="shortSellBuyDiff" class="swal2-input" 
                        value="${currentSettings.shortSellBuyDiff || 5}" step="0.01">
                </div>
            `;
        }

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
                    ${shortSellInputHtml}
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: '저장',
            cancelButtonText: '취소',
            preConfirm: () => {
                const result = {
                    buyThreshold: Number(document.getElementById('buyThreshold').value),
                    sellThreshold: Number(document.getElementById('sellThreshold').value)
                };
                if (shortSellInvestments.length > 0) {
                    result.shortSellBuyDiff = Number(document.getElementById('shortSellBuyDiff').value);
                }
                return result;
            }
        });

        if (formValues) {
            settings.buyThreshold = formValues.buyThreshold;
            settings.sellThreshold = formValues.sellThreshold;

            // 공매도 다음 매수가 차이 설정 및 적용
            if (formValues.shortSellBuyDiff && shortSellInvestments.length > 0) {
                settings.shortSellBuyDiff = formValues.shortSellBuyDiff;
                for (const inv of shortSellInvestments) {
                    const targetBuy = inv.shortSellSellRate - formValues.shortSellBuyDiff;
                    await db.collection('currentInvestments').doc(inv.id).update({
                        shortSellTargetBuy: targetBuy
                    });
                    inv.shortSellTargetBuy = targetBuy; // 로컬 데이터도 업데이트
                }
            }

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
        initializeShortSellToggle();
    } catch (error) {
        console.error('초기 로드 중 오류 발생:', error);
    }
});

// 공매도 축소/확장 토글 초기화
function initializeShortSellToggle() {
    const toggleBtn = document.getElementById('toggleShortSell');
    if (toggleBtn) {
        // 저장된 상태 불러오기
        const savedState = localStorage.getItem('shortSellCollapsed');
        if (savedState !== null) {
            shortSellCollapsed = savedState === 'true';
            toggleBtn.textContent = shortSellCollapsed ? '공매도 확장' : '공매도 축소';
        }
        
        toggleBtn.addEventListener('click', () => {
            shortSellCollapsed = !shortSellCollapsed;
            toggleBtn.textContent = shortSellCollapsed ? '공매도 확장' : '공매도 축소';
            
            // 상태를 localStorage에 저장
            localStorage.setItem('shortSellCollapsed', shortSellCollapsed.toString());
            
            updateTables();
        });
    }
}

// 완료된 투자 수정
async function editCompletedInvestment(id) {
    const investment = completedInvestments.find(inv => inv.id === id);
    if (!investment) return;
    
    const purchaseDate = new Date(investment.date).toISOString().split('T')[0];
    const sellDate = new Date(investment.sellDate).toISOString().split('T')[0];
    
    const form = document.createElement('form');
    form.innerHTML = `
        <div style="margin: 8px 0;">
            <label>구매일:<br><input type="date" id="editPurchaseDate" value="${purchaseDate}" required></label>
        </div>
        <div style="margin: 8px 0;">
            <label>매도일:<br><input type="date" id="editSellDate" value="${sellDate}" required></label>
        </div>
        <div style="margin: 8px 0;">
            <label>엔화 금액:<br><input type="number" id="editAmountYen" value="${investment.amountYen}" required></label>
        </div>
        <div style="margin: 8px 0;">
            <label>구매 환율 (100엔):<br><input type="number" step="0.01" id="editExchangeRate" value="${investment.exchangeRate}" required></label>
        </div>
        <div style="margin: 8px 0;">
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
            text: '투자 실적이 수정되었습니다.'
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
        const response = await fetch('https://m.search.naver.com/p/csearch/content/qapirender.nhn?key=calculator&pkid=141&q=%ED%99%98%EC%9C%A8&where=m&u1=keb&u6= WUnit&u7=0&u3=JPY&u4=KRW&u8=down&u2=100', {
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
            document.getElementById('currentRate').textContent = `${rate}원 (${now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})`; 
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
                `현재 환율(${currentRate}원)이 최소 매수 목표(${minBuyTarget.toFixed(2)}원)보다 2원 이상 낮습니다.`,
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

// 푸시 알림 전송
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
    row.classList.add('short-sell');
    const shortSellLabel = document.createElement('span');
    shortSellLabel.textContent = ' *공매도 중*';
    shortSellLabel.style.color = 'blue';
    shortSellLabel.style.fontWeight = 'bold';
    actionCell.appendChild(shortSellLabel);

    // 설정에서 shortSellBuyDiff 값을 사용 (기본값 5)
    const shortSellBuyDiff = settings.shortSellBuyDiff || 5;
    const targetBuy = sellRate - shortSellBuyDiff;
    const targetBuyDiv = document.createElement('div');
    targetBuyDiv.textContent = `다음 매수가: ${targetBuy.toFixed(2)}`;
    targetBuyDiv.style.color = 'blue';
    actionCell.appendChild(targetBuyDiv);

    db.collection('currentInvestments').doc(id).update({
        shortSell: true,
        shortSellSellRate: sellRate,
        shortSellTargetBuy: targetBuy,
    }).then(() => {
        const investment = currentInvestments.find(inv => inv.id === id);
        if (investment) {
            investment.shortSell = true;
            investment.shortSellSellRate = sellRate;
            investment.shortSellTargetBuy = targetBuy;
        }
        updateTables();
    }).catch(error => {
        console.error('공매도 정보 저장 실패:', error);
    });
}
