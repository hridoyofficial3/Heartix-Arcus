const allEntriesModalEl = document.getElementById('allEntriesModal');
let allEntriesShownCount = 50;
const ALL_ENTRIES_PAGE_SIZE = 50;

function getAllEntriesFiltered(){
  const normal = entries.filter(en=> en.account !== 'savings');
  const searchEl = document.getElementById('allEntriesSearchInput');
  const accEl = document.getElementById('allEntriesFilterAccount');
  const typeEl = document.getElementById('allEntriesFilterType');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const accFilter = accEl ? accEl.value : 'all';
  const typeFilter = typeEl ? typeEl.value : 'all';
  let filtered = normal;
  if(accFilter !== 'all') filtered = filtered.filter(en=> en.account === accFilter);
  if(typeFilter !== 'all') filtered = filtered.filter(en=> en.type === typeFilter);
  if(q !== '') filtered = filtered.filter(en=> ((en.note||'')+' '+(en.detail||'')).toLowerCase().includes(q));
  return [...filtered].sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id - a.id);
}
function renderAllEntriesModalList(){
  const list = document.getElementById('allEntriesList');
  const loadMoreBtn = document.getElementById('allEntriesLoadMoreBtn');
  const normal = entries.filter(en=> en.account !== 'savings');
  if(normal.length === 0){ list.innerHTML = '<div class="empty">'+L('noEntriesYet')+'</div>'; loadMoreBtn.style.display = 'none'; return; }
  const sorted = getAllEntriesFiltered();
  if(sorted.length === 0){ list.innerHTML = '<div class="empty">'+L('noFilteredEntries')+'</div>'; loadMoreBtn.style.display = 'none'; return; }
  const shown = sorted.slice(0, allEntriesShownCount);
  list.innerHTML = shown.map(en => `
    <div class="entry ${en.transfer ? '' : (en.type==='income' ? 'income-bg' : 'expense-bg')}" onclick="openEntryDetail(${Number(en.id)})" role="button" tabindex="0">
      <div class="left"><span class="tag"><span class="accbadge">${accLabel(en.account)}</span>${(en.budgetType==='need'||en.budgetType==='want')?('<span class="bwbadge '+en.budgetType+'">'+L(en.budgetType+'Label')+'</span>'):''}<span class="en-date">${escapeHtml(en.date)}</span>${en.note ? '<span class="en-note">' + escapeHtml(en.note) + '</span>' : ''}${entryDetailSpan(en)}</span></div>
      <div class="actions"><span class="amt ${en.type}">${en.type==='income'?'+':'-'}${moneyFmt(en.amount)}</span>${entryActionsHtml(en)}</div>
    </div>
  `).join('');
  loadMoreBtn.style.display = sorted.length > allEntriesShownCount ? 'block' : 'none';
}
function openAllEntriesModal(){
  allEntriesShownCount = ALL_ENTRIES_PAGE_SIZE;
  document.getElementById('allEntriesSearchInput').value = '';
  document.getElementById('allEntriesFilterAccount').value = 'all';
  document.getElementById('allEntriesFilterType').value = 'all';
  renderAllEntriesModalList();
  allEntriesModalEl.classList.add('open');
  lockBodyScroll();
}
function closeAllEntriesModal(){ allEntriesModalEl.classList.remove('open'); unlockBodyScroll(); }
document.getElementById('viewAllEntriesBtn').addEventListener('click', openAllEntriesModal);
document.getElementById('allEntriesCloseBtn').addEventListener('click', closeAllEntriesModal);
allEntriesModalEl.addEventListener('click', (e)=>{ if(e.target === allEntriesModalEl) closeAllEntriesModal(); });
document.getElementById('allEntriesSearchInput').addEventListener('input', ()=>{ allEntriesShownCount = ALL_ENTRIES_PAGE_SIZE; renderAllEntriesModalList(); });
document.getElementById('allEntriesFilterAccount').addEventListener('change', ()=>{ allEntriesShownCount = ALL_ENTRIES_PAGE_SIZE; renderAllEntriesModalList(); });
document.getElementById('allEntriesFilterType').addEventListener('change', ()=>{ allEntriesShownCount = ALL_ENTRIES_PAGE_SIZE; renderAllEntriesModalList(); });
document.getElementById('allEntriesLoadMoreBtn').addEventListener('click', ()=>{ allEntriesShownCount += ALL_ENTRIES_PAGE_SIZE; renderAllEntriesModalList(); });

function savingsContributionByAccount(){
  const result = {};
  getAccountsList().forEach(a=>{ if(a.id !== 'savings') result[a.id] = 0; });
  const savTransfers = entries.filter(en=> en.transfer && en.account==='savings').sort((a,b)=> String(a.date||'').localeCompare(String(b.date||'')) || a.id - b.id);
  
  savTransfers.forEach(en=>{
    if(en.savingsReattribFrom){
      const from = en.savingsReattribFrom, to = en.savingsReattribTo;
      const amt = Math.min(Number(en.savingsReattribAmount) || 0, result[from] || 0);
      if(result.hasOwnProperty(from)) result[from] = round2(result[from] - amt);
      if(result.hasOwnProperty(to)) result[to] = round2((result[to] || 0) + amt);
      
    } else if(en.savingsWithdrawFrom){
      let remaining = Number(en.amount) || 0;
      const from = en.savingsWithdrawFrom;
      
      if(result.hasOwnProperty(from) && result[from] > 0){
        const take = Math.min(remaining, result[from]);
        result[from] = round2(result[from] - take);
        remaining = round2(remaining - take);
      }
      
      if(remaining > 0){
        const keys = Object.keys(result).filter(k=> result[k] > 0);
        const totalPos = round2(keys.reduce((s,k)=> s + result[k], 0));
        if(totalPos > 0){
          const take = Math.min(remaining, totalPos);
          keys.forEach(k=>{ result[k] = round2(result[k] - (result[k] / totalPos) * take); });
        }
      }
      
    } else if(en.type==='income'){
      const pair = findPair(en);
      if(pair && result.hasOwnProperty(pair.account)){ 
        result[pair.account] = round2(result[pair.account] + (Number(en.amount) || 0)); 
      }
    } else {
      let remaining = Number(en.amount) || 0;
      const keys = Object.keys(result).filter(k=> result[k] > 0);
      const totalPos = round2(keys.reduce((s,k)=> s + result[k], 0));
      if(totalPos > 0){
        const take = Math.min(remaining, totalPos);
        keys.forEach(k=>{ result[k] = round2(result[k] - (result[k] / totalPos) * take); });
      }
    }
  });
  
  Object.keys(result).forEach(k=>{ if(isNaN(result[k]) || result[k] < 0.01) result[k] = 0; });
  return result;
}

// নেওয়া লোনের মোট (দেনা) — দেওয়া লোন এখানে নয়, ওটা বকেয়া প্রাপ্যে যায়
function loanTakenOwed(){
  return round2(loans.filter(l=> (l.type==='taken' || l.type==='self') && !l.settled).reduce((s,l)=> s+l.amount, 0));
}

function renderLoansTab(){
  const payable = round2(loans.filter(l=> (l.type==='taken' || l.type==='self') && !l.settled).reduce((s,l)=> s+l.amount, 0));
  const receivable = round2(loans.filter(l=> l.type==='given' && !l.settled).reduce((s,l)=> s+l.amount, 0));
  const payEl = document.getElementById('loanTotalPayable'); if(payEl) payEl.textContent = moneyFmt(payable);
  const recEl = document.getElementById('loanTotalReceivable'); if(recEl) recEl.textContent = moneyFmt(receivable);
  renderSelfLoanRepayOptions();
  const list = document.getElementById('loansList');
  if(!list) return;
  const unsettledLoans = loans.filter(l=>!l.settled);
  if(unsettledLoans.length === 0){ list.innerHTML = '<div class="empty">'+L('loanEmptyMsg')+'</div>'; return; }
  const remTags = (typeof getDueReminderTagMap === 'function') ? getDueReminderTagMap() : null;
  const sorted = [...unsettledLoans].sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id-a.id);
  list.innerHTML = sorted.map(l=>{
    const typeLabel = l.type==='taken' ? L('loanTakenLabel') : l.type==='self' ? L('loanSelfLabel') : L('loanGivenLabel');
    const badgeClass = l.type==='taken' ? 'need' : l.type==='self' ? 'self' : 'want';
    const dueRow = l.dueDate ? '<div>'+L('loanDueDatePrefix')+'<b>'+escapeHtml(l.dueDate)+'</b>'+(remTags ? dueReminderTagHtml(remTags, 'loan', l.id) : '')+'</div>' : '';
    const noteRow = l.note ? '<div>'+L('planNoteFmt')+escapeHtml(l.note)+'</div>' : '';
    const isPayable = (l.type==='taken' || l.type==='self');
    const settleBtnLabel = isPayable ? L('payBtnLabel') : L('collectBtnLabel');
    const settleBtnAction = l.type==='self' ? 'openSelfLoanCardRepayModal('+Number(l.id)+')' : 'settleLoan('+Number(l.id)+')';
    const settleBtn = !l.settled ? '<button class="btn outline" style="padding:6px 10px; font-size:12px; width:auto;" onclick="'+settleBtnAction+'">'+settleBtnLabel+'</button>' : '';
    const itemStateClass = l.settled ? 'item-settled' : (isPayable ? 'item-due' : '');
    const partialPaidRow = (!l.settled && l.paidAmount > 0) ? '<div style="color:var(--gold); font-weight:600; margin-top:4px;">'+L('paidSoFarLabel')+': '+moneyFmt(l.paidAmount)+' · '+L('remainingDueLabel')+': '+moneyFmt(l.amount)+'</div>' : '';
    const selfPendingRow = (l.type==='self' && !l.settled) ? '<div style="color:var(--gold); font-weight:600; margin-top:4px;">⚠ '+L('loanSelfPendingNote')+'</div>' : '';
    const loanDelBtn = canManageLoansDues(l) ? '<button class="pdel" onclick="deleteLoan('+Number(l.id)+')">×</button>' : '';
    return '<div class="plan-item '+itemStateClass+'">'+
      '<div class="pname"><span>'+(l.type==='self' ? '' : escapeHtml(l.person))+' <span class="bwbadge '+badgeClass+'">'+typeLabel+'</span></span><span>'+moneyFmt(l.amount)+'</span></div>'+
      '<div class="pmeta"><div>'+L('planFromAccPrefix')+'<b>'+accLabel(l.account)+'</b></div><div>'+L('loanDatePrefix')+'<b>'+escapeHtml(l.date)+'</b></div>'+dueRow+noteRow+partialPaidRow+selfPendingRow+'</div>'+
      '<div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">'+settleBtn+loanDelBtn+'</div>'+
    '</div>';
  }).join('');
}
function renderDuesTab(){
  const totalReceivable = round2(dues.filter(d=> d.type==='receivable' && !d.settled).reduce((s,d)=> s+d.amount, 0));
  const totalPayable = round2(dues.filter(d=> d.type==='payable' && !d.settled).reduce((s,d)=> s+d.amount, 0));
  const recEl = document.getElementById('dueTotalReceivable'); if(recEl) recEl.textContent = moneyFmt(totalReceivable);
  const payEl = document.getElementById('dueTotalPayable'); if(payEl) payEl.textContent = moneyFmt(totalPayable);
  const list = document.getElementById('duesList');
  if(!list) return;
  const unsettledDues = dues.filter(d=>!d.settled);
  if(unsettledDues.length === 0){ list.innerHTML = '<div class="empty">'+L('dueEmptyMsg')+'</div>'; return; }
  const remTags = (typeof getDueReminderTagMap === 'function') ? getDueReminderTagMap() : null;
  const sorted = [...unsettledDues].sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id-a.id);
  list.innerHTML = sorted.map(d=>{
    const typeLabel = d.type==='receivable' ? L('dueReceivableLabel') : L('duePayableLabel');
    const badgeClass = d.type==='receivable' ? 'want' : 'need';
    const isPayable = d.type==='payable';
    const itemStateClass = d.settled ? 'item-settled' : (isPayable ? 'item-due' : '');
    const reasonRow = d.reason ? '<div>'+L('dueReasonLabel')+': '+escapeHtml(d.reason)+'</div>' : '';
    const dueDateRow = d.dueDate ? '<div>'+L('loanDueDatePrefix')+'<b>'+escapeHtml(d.dueDate)+'</b>'+(remTags ? dueReminderTagHtml(remTags, 'due', d.id) : '')+'</div>' : '';
    const partialRow = (!d.settled && d.paidAmount > 0) ? '<div style="color:var(--gold); font-weight:600; margin-top:4px;">'+L('paidSoFarLabel')+': '+moneyFmt(d.paidAmount)+' · '+L('remainingDueLabel')+': '+moneyFmt(d.amount)+'</div>' : '';
    const settleBtnLabel = isPayable ? L('payBtnLabel') : L('collectBtnLabel');
    const settleBtn = !d.settled ? '<button class="btn outline" style="padding:6px 10px; font-size:12px; width:auto;" onclick="openSettleDueModal('+Number(d.id)+')">'+settleBtnLabel+'</button>' : '';
    const dueDelBtn = canManageLoansDues(d) ? '<button class="pdel" onclick="deleteDue('+Number(d.id)+')">×</button>' : '';
    return '<div class="plan-item '+itemStateClass+'">'+
      '<div class="pname"><span>'+escapeHtml(d.person)+' <span class="bwbadge '+badgeClass+'">'+typeLabel+'</span></span><span>'+moneyFmt(d.amount)+'</span></div>'+
      '<div class="pmeta">'+reasonRow+'<div>'+L('loanDatePrefix')+'<b>'+escapeHtml(d.date)+'</b></div>'+dueDateRow+partialRow+'</div>'+
      '<div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">'+settleBtn+dueDelBtn+'</div>'+
    '</div>';
  }).join('');
}
function renderSavingsTab(){
  const sav = accountBalance('savings');
  document.getElementById('totalSavingsVal').textContent = moneyFmt(sav);
  updateWithdrawAvailableHint();
  renderTransferSavingsFromOptions();
  renderWithdrawFromOptions();
  updateDepositHint();
  const target = settings.savingsTarget || 0;
  document.getElementById('targetInput').value = target ? formatAmtInput(String(target)) : '';
  document.getElementById('progressText').textContent = moneyFmt(sav) + ' ' + L('depositedSuffix');
  document.getElementById('progressTarget').textContent = L('targetPrefix') + moneyFmt(target);
  const pct = target > 0 ? Math.min(100, Math.round((sav/target)*100)) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  const list = document.getElementById('savingsList');
  const savTx = entries.filter(en=> en.transfer && (en.account==='savings'));
  if(savTx.length === 0){ list.innerHTML = '<div class="empty">'+L('noTransactions')+'</div>'; return; }
  const sorted = [...savTx].sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id - a.id);
  list.innerHTML = sorted.map(en=>{
    const isReattrib = !!en.savingsReattribFrom;
    const amt = isReattrib ? (en.savingsReattribAmount || 0) : en.amount;
    const sign = isReattrib ? '' : (en.type==='income' ? '+' : '-');
    const bgClass = isReattrib ? '' : (en.type==='income' ? 'income-bg' : 'expense-bg');
    return `
    <div class="entry ${bgClass}" onclick="openEntryDetail(${Number(en.id)})" role="button" tabindex="0">
      <div class="left"><span class="tag"><span class="en-date">${escapeHtml(en.date)}</span>${en.note?'<span class="en-note">'+escapeHtml(en.note)+'</span>':''}</span></div>
      <div class="actions"><span class="amt ${isReattrib?'':en.type}">${sign}${moneyFmt(amt)}</span>${entryActionsHtml(en)}</div>
    </div>
  `;
  }).join('');
}
function renderNotes(){
  const list = document.getElementById('notesList');
  const totalEl = document.getElementById('notesTotalVal');
  if(totalEl){
    const notesLeft = round2(notes.reduce((s,n)=> s + (n.done ? 0 : (Number(n.price)||0)), 0));
    const plansLeft = round2(plans.reduce((s,p)=> s + (p.bought ? 0 : (Number(p.amount)||0)), 0));
    totalEl.textContent = moneyFmt(round2(notesLeft + plansLeft));
  }
  if(notes.length === 0){ list.innerHTML = '<div class="empty">'+L('noItems')+'</div>'; return; }
  const sorted = [...notes].sort((a,b)=> (a.done - b.done) || b.id - a.id);
  list.innerHTML = sorted.map(n => {
    const locked = n.done && !settings.advancedMode;
    return '<div class="note-item">' +
      '<input type="checkbox" '+(n.done?'checked':'')+' '+(locked?'disabled title="'+L('advancedModeLabel')+'"':'')+' onchange="toggleNote('+Number(n.id)+')">' +
      '<div class="txt '+(n.done?'done':'')+'">'+escapeHtml(n.text)+'</div>' +
      (n.price ? '<span class="price">'+moneyFmt(n.price)+'</span>' : '') +
      '<button class="del" onclick="deleteNote('+Number(n.id)+')">×</button></div>';
  }).join('');
}
function budgetBarColor(ratioPct){
  const r = Math.max(0, ratioPct) / 100;
  let h, s, l;
  if(r <= 1){ const t = r; h = 140 - 140 * t; s = 55; l = 38 + 22 * t; }
  else { const t = Math.min(1, (r - 1) / 0.5); h = 0; s = 55 + 30 * t; l = 60 - 30 * t; }
  return 'hsl('+h.toFixed(0)+', '+s.toFixed(0)+'%, '+l.toFixed(0)+'%)';
}
function getChartPeriods(anchorDate){
  const periods = [];
  if(periodMode === 'day'){
    for(let i=5; i>=0; i--){
      const d = new Date(anchorDate); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
      const start = toISO(d);
      periods.push({ start, end: start, label: numFmt(d.getDate()), sub: monthName(d.getMonth()).slice(0,3) });
    }
  } else if(periodMode === 'week'){
    for(let i=5; i>=0; i--){
      const d = new Date(anchorDate); d.setHours(0,0,0,0); d.setDate(d.getDate() - i*7);
      const s = getWeekStart(d); const e = new Date(s); e.setDate(e.getDate()+6);
      periods.push({ start: toISO(s), end: toISO(e), label: numFmt(s.getDate()), sub: monthName(s.getMonth()).slice(0,3) });
    }
  } else if(periodMode === 'month'){
    for(let i=5; i>=0; i--){
      const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth()-i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      periods.push({ start: toISO(new Date(y,m,1)), end: toISO(new Date(y,m+1,0)), label: monthName(m), sub: (m===0 ? "'"+String(y).slice(2) : '') });
    }
  } else if(periodMode === 'year'){
    for(let i=5; i>=0; i--){
      const y = anchorDate.getFullYear() - i;
      periods.push({ start: y+'-01-01', end: y+'-12-31', label: numFmt(y), sub: '' });
    }
  } else {
    periods.push({ start: '0001-01-01', end: '9999-12-31', label: L('periodAllChartLabel'), sub: '' });
  }
  return periods;
}
function computeChartData(anchorDate){
  const periods = getChartPeriods(anchorDate);
  return periods.map(p=>{
    let inc = 0, exp = 0;
    for(let i=0; i<entries.length; i++){
      const en = entries[i];
      if(!isOperating(en)) continue;
      if(en.date >= p.start && en.date <= p.end){
        if(en.type === 'income') inc += en.amount;
        else exp += en.amount;
      }
    }
    return { inc: round2(inc), exp: round2(exp), label: p.label, sub: p.sub };
  });
}
let chartSelKey = null; // T3: বেছে নেওয়া পিরিয়ডের চাবি (label+sub)
function chartSelect(key){ chartSelKey = (chartSelKey === key) ? null : key; renderSummary(); }
function renderPeriodChart(anchorDate){
  const wrap = document.getElementById('monthlyChartWrap');
  if(!wrap) return;
  const data = computeChartData(anchorDate);
  const maxVal = Math.max(1, ...data.map(d=>d.inc), ...data.map(d=>d.exp));
  const VW = 700, VH = 230;
  const chartTop = 34, chartBottom = 40;
  const chartAreaH = VH - chartTop - chartBottom;
  const groupW = VW / data.length;
  const barW = Math.min(34, groupW * 0.32);
  const gap = 6;
  let bars = '', labels = '';
  data.forEach((d, i)=>{
    const cx = groupW*i + groupW/2;
    const incX = cx - barW - gap/2, expX = cx + gap/2;
    const dKey = d.sub ? (d.label + ' ' + d.sub) : d.label;
    if(dKey === chartSelKey){
      bars += '<rect x="'+(groupW*i+2).toFixed(1)+'" y="'+(chartTop-24)+'" width="'+(groupW-4).toFixed(1)+'" height="'+(VH-chartTop-chartBottom+24+8)+'" rx="8" fill="var(--line)" opacity="0.35"></rect>';
    }
    const incH = d.inc>0 ? Math.max(2, (d.inc/maxVal)*chartAreaH) : 0;
    const expH = d.exp>0 ? Math.max(2, (d.exp/maxVal)*chartAreaH) : 0;
    const incY = chartTop + (chartAreaH - incH);
    const expY = chartTop + (chartAreaH - expH);
    if(incH>0){
      bars += '<rect x="'+incX.toFixed(1)+'" y="'+incY.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+incH.toFixed(1)+'" rx="4" fill="var(--ledger-green)"></rect>';
      bars += '<text x="'+(incX+barW/2).toFixed(1)+'" y="'+(incY-6).toFixed(1)+'" text-anchor="middle" font-size="14" font-weight="600" fill="var(--ledger-green)">'+escapeHtml(moneyFmt(d.inc))+'</text>';
    }
    if(expH>0){
      bars += '<rect x="'+expX.toFixed(1)+'" y="'+expY.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+expH.toFixed(1)+'" rx="4" fill="var(--ledger-red)"></rect>';
      bars += '<text x="'+(expX+barW/2).toFixed(1)+'" y="'+(expY-6).toFixed(1)+'" text-anchor="middle" font-size="14" font-weight="600" fill="var(--ledger-red)">'+escapeHtml(moneyFmt(d.exp))+'</text>';
    }
    const labelText = d.sub ? (d.label + ' ' + d.sub) : d.label;
    labels += '<text x="'+cx.toFixed(1)+'" y="'+(VH-14)+'" text-anchor="middle" font-size="14" fill="var(--ink)">'+escapeHtml(labelText)+'</text>';
  });
  const baselineY = chartTop + chartAreaH;
  const ariaItems = data.map(d=>{
    const labelText = d.sub ? (d.label + ' ' + d.sub) : d.label;
    return tfmt('chartAriaItemFmt', { label: labelText, inc: moneyFmt(d.inc), exp: moneyFmt(d.exp) });
  }).join('; ');
  const ariaLabel = tfmt('chartAriaSummaryFmt', { items: ariaItems });
  const tableRows = data.map(d=>{
    const labelText = d.sub ? (d.label + ' ' + d.sub) : d.label;
    return '<tr><th scope="row">'+escapeHtml(labelText)+'</th><td>'+escapeHtml(moneyFmt(d.inc))+'</td><td>'+escapeHtml(moneyFmt(d.exp))+'</td></tr>';
  }).join('');
  if(chartSelKey !== null && !data.some(d=>(d.sub ? (d.label+' '+d.sub) : d.label) === chartSelKey)) chartSelKey = null;
  const hitBtns = data.map((d, i)=>{
    const key = d.sub ? (d.label + ' ' + d.sub) : d.label;
    const net = round2(d.inc - d.exp);
    const aria = tfmt('chartHitAriaFmt', { label: key, inc: moneyFmt(d.inc), exp: moneyFmt(d.exp), net: moneyFmt(net) });
    return '<button type="button" class="chart-hit" data-chart-idx="'+i+'" data-chart-key="'+escapeHtml(key)+'" aria-pressed="'+(key===chartSelKey?'true':'false')+'" aria-label="'+escapeHtml(aria)+'" style="left:'+(100/data.length*i).toFixed(3)+'%;width:'+(100/data.length).toFixed(3)+'%;"></button>';
  }).join('');
  let detail = '';
  const selIdx = data.findIndex(d=>(d.sub ? (d.label+' '+d.sub) : d.label) === chartSelKey);
  if(selIdx >= 0){
    const d = data[selIdx], net = round2(d.inc - d.exp);
    detail = '<div class="chart-detail"><div class="cd-title">'+escapeHtml(chartSelKey)+'</div>' +
      '<div class="cd-row"><span>'+escapeHtml(L('typeIncome'))+'</span><b style="color:var(--ledger-green);">'+escapeHtml(moneyFmt(d.inc))+'</b></div>' +
      '<div class="cd-row"><span>'+escapeHtml(L('typeExpense'))+'</span><b style="color:var(--ledger-red);">'+escapeHtml(moneyFmt(d.exp))+'</b></div>' +
      '<div class="cd-row"><span>'+escapeHtml(L('chartDetailNet'))+'</span><b>'+escapeHtml(moneyFmt(net))+'</b></div></div>';
  }
  wrap.innerHTML = '<div class="chart-stage"><svg viewBox="0 0 '+VW+' '+VH+'" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="'+escapeHtml(ariaLabel)+'">' +
    '<line x1="0" y1="'+baselineY+'" x2="'+VW+'" y2="'+baselineY+'" stroke="var(--line)" stroke-width="2"></line>' +
    bars + labels + '</svg>' + hitBtns + '</div>' +
    '<div class="chart-detail-live" aria-live="polite">' + detail + '</div>' +
    '<table class="sr-only"><caption>'+escapeHtml(L('chartTableCaption'))+'</caption>' +
    '<thead><tr><th scope="col">'+escapeHtml(L('chartTablePeriodHeader'))+'</th><th scope="col">'+escapeHtml(L('typeIncome'))+'</th><th scope="col">'+escapeHtml(L('typeExpense'))+'</th></tr></thead>' +
    '<tbody>'+tableRows+'</tbody></table>';
}
