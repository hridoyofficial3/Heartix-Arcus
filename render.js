/* ============================================================
   Month key + percentage history
   ============================================================ */
function monthKey(y,m){ return y+'-'+String(m+1).padStart(2,'0'); }
function dateYearMonth(dateStr){
  if(!dateStr || typeof dateStr !== 'string' || dateStr.length < 7) return { y: NaN, m: NaN };
  return { y: parseInt(dateStr.slice(0,4), 10), m: parseInt(dateStr.slice(5,7), 10) - 1 };
}
function getPctForMonth(y,m){
  if(isNaN(y) || isNaN(m)) return { needPct: settings.needPct, wantPct: settings.wantPct };
  const key = monthKey(y,m);
  const keys = Object.keys(settings.pctHistory||{}).filter(k=>k<=key).sort();
  if(keys.length){ const v = settings.pctHistory[keys[keys.length-1]]; return { needPct: clampPct(v.needPct), wantPct: clampPct(v.wantPct) }; }
  return { needPct: settings.needPct, wantPct: settings.wantPct };
}
function getSavingsPctForMonth(y,m){
  const { needPct, wantPct } = getPctForMonth(y,m);
  return Math.max(0, 100 - needPct - wantPct);
}

const GRACE_PERIOD_MS = 60 * 60 * 1000;
function msSinceCreated(id){ return Date.now() - id; }
function withinGracePeriod(id){ return msSinceCreated(id) <= GRACE_PERIOD_MS; }
function canEditEntry(en){ if(!!settings.advancedMode) return true; return withinGracePeriod(en.id); }
function canManageLoansDues(item){ if(!!settings.advancedMode) return true; return !!item && withinGracePeriod(item.id); }
function isLoanDueEntry(en){ return !!(en && (en.loanId || en.dueId)); }
function findPair(en){
  if(en.pairId != null){ return entries.find(x=> x.id !== en.id && x.pairId === en.pairId) || null; }
  return entries.find(x=> x.id !== en.id && x.transfer === true && x.date === en.date && Math.abs(x.amount - en.amount) < 0.001 && x.account !== en.account) || null;
}
function entryActionsHtml(en){
  if(isLoanDueEntry(en)) return '';
  if(en.savingsReattribFrom) return '';
  if(isAutoSavingsEntry(en)) return '';
  if(canEditEntry(en)){ return '<button class="edit-icon" title="edit" onclick="event.stopPropagation(); openEditEntry('+Number(en.id)+')" onkeydown="event.stopPropagation()">✎</button>'; }
  return '';
}
function showLockInfo(id){ toast(L('editLockedToast')); openSettings(); }

/* ============================================================
   T5 — অটো-সেভিংস লিংক, "শেষ ৫টা কাজ", ব্যালেন্স সিমুলেশন (D3–D5)
   ============================================================ */
const MAX_DELETABLE_ACTIONS = 5;
function isAutoSavingsEntry(en){ return !!(en && en.autoSavingsOf != null && entries.some(x=> x.id === en.autoSavingsOf)); }
function linkedSavingsEntries(incomeId){ return entries.filter(x=> x.autoSavingsOf === incomeId); }
function actionGroupKey(en, linkedIncomeIds){
  if(en.autoSavingsOf != null) return 'inc:' + en.autoSavingsOf;
  if(en.depositReattribOf != null) return 'pair:' + en.depositReattribOf;
  if(linkedIncomeIds.has(en.id)) return 'inc:' + en.id;
  if(en.transfer){ const pair = findPair(en); if(pair) return 'pair:' + Math.min(en.id, pair.id); }
  return 'e:' + en.id;
}
function getRecentActionGroups(limit){
  const linkedIncomeIds = new Set();
  entries.forEach(x=>{ if(x.autoSavingsOf != null) linkedIncomeIds.add(x.autoSavingsOf); });
  const sorted = entries.filter(x=> !isLoanDueEntry(x)).slice().sort((a,b)=> b.id - a.id);
  const groups = [], byKey = new Map();
  for(const en of sorted){
    const key = actionGroupKey(en, linkedIncomeIds);
    let g = byKey.get(key);
    if(!g){
      if(groups.length >= limit) continue;
      g = { key, ids: [] }; byKey.set(key, g); groups.push(g);
    }
    g.ids.push(en.id);
  }
  return groups;
}
function entryDeleteIds(en){
  const ids = [en.id];
  if(en.transfer){
    const pair = findPair(en); if(pair) ids.push(pair.id);
    const gid = pair ? Math.min(en.id, pair.id) : en.id;
    entries.forEach(x=>{ if(x.depositReattribOf === gid && ids.indexOf(x.id) === -1) ids.push(x.id); });   // "অন্য হিসাবে সংরক্ষিত" মুভও সাথে যাবে
  }
  else if(en.type === 'income'){ linkedSavingsEntries(en.id).forEach(x=> ids.push(x.id)); }
  return ids;
}
function canDeleteEntry(en){
  if(!en || isLoanDueEntry(en) || isAutoSavingsEntry(en)) return false;
  if(!canEditEntry(en)) return false;
  if(!settings.advancedMode) return true;
  return getRecentActionGroups(MAX_DELETABLE_ACTIONS).some(g=> g.ids.indexOf(en.id) !== -1);
}
function simulateBalances(changeFn){
  const tally = (list)=>{
    const out = {};
    list.forEach(en=>{ out[en.account] = round2((out[en.account] || 0) + (en.type === 'income' ? en.amount : -en.amount)); });
    return out;
  };
  const before = tally(entries);
  let copy = entries.map(en=> Object.assign({}, en));
  const res = changeFn(copy);
  if(Array.isArray(res)) copy = res;
  const after = tally(copy);
  const negatives = [];
  Object.keys(after).forEach(acc=>{
    const b = before[acc] || 0;
    if(!(b < 0) && after[acc] < 0) negatives.push({ account: acc, before: b, after: after[acc] });
  });
  return negatives;
}
function simAccountList(negatives){
  return negatives.map(n=>{
    const meta = getAccountMeta(n.account);
    const name = meta ? accNameText(meta) : L(accLabelMap[n.account] || 'accUnknown');
    return name + ' (' + moneyFmt(n.after) + ')';
  }).join(', ');
}
function updateBudgetLabels(){
  const n = numFmt(settings.needPct), w = numFmt(settings.wantPct);
  const nt = document.getElementById('needTypeBtn'); if(nt) nt.textContent = L('needLabel') + ' (' + n + '%)';
  const wt = document.getElementById('wantTypeBtn'); if(wt) wt.textContent = L('wantLabel') + ' (' + w + '%)';
  const en = document.getElementById('editNeedBtn'); if(en) en.textContent = L('needLabel') + ' (' + n + '%)';
  const ew = document.getElementById('editWantBtn'); if(ew) ew.textContent = L('wantLabel') + ' (' + w + '%)';
}
function updateAdvancedModeStatus(){
  const el = document.getElementById('advancedModeStatus');
  if(!el) return;
  if(settings.advancedMode){ el.className = 'settings-desc warn'; el.textContent = tfmt('advancedModeStatusOn', { n: numFmt(entries.length) }); }
  else { el.className = 'settings-desc'; el.textContent = L('advancedModeStatusOff'); }
}

let _balanceCache = null;
function accountBalance(acc){
  if(_balanceCache === null){
    _balanceCache = {};
    for(const en of entries){
      const delta = en.type === 'income' ? en.amount : -en.amount;
      _balanceCache[en.account] = round2((_balanceCache[en.account] || 0) + delta);
    }
  }
  return _balanceCache[acc] || 0;
}


function updateAcctAvailableHint(){
  const hint = document.getElementById('acctAvailableHint');
  if(!hint) return;
  if(curType !== 'expense'){ hint.style.display = 'none'; return; }
  const account = document.getElementById('accountInput').value;
  if(!account){ hint.style.display = 'none'; return; }
  const avail = accountBalance(account);
  hint.textContent = tfmt('acctAvailableFmt', { acc: accLabelText(account), amt: moneyFmt(avail) });
  hint.style.display = 'block';
}
function updateSelfLoanRepayAcctHint(){
  const hint = document.getElementById('selfLoanRepayAcctAvailableHint');
  if(!hint) return;
  const account = document.getElementById('selfLoanRepayAccount').value;
  if(!account){ hint.style.display = 'none'; return; }
  const avail = accountBalance(account);
  hint.textContent = tfmt('transferAvailableFmt', { acc: accLabelText(account), amt: moneyFmt(avail) });
  hint.style.display = 'block';
}
function updateLoanAcctAvailableHint(){
  const hint = document.getElementById('loanAcctAvailableHint');
  if(!hint) return;
  if(curLoanType !== 'given'){ hint.style.display = 'none'; return; }
  const account = document.getElementById('loanAccount').value;
  if(!account){ hint.style.display = 'none'; return; }
  const avail = accountBalance(account);
  hint.textContent = tfmt('acctAvailableFmt', { acc: accLabelText(account), amt: moneyFmt(avail) });
  hint.style.display = 'block';
}
function updateLoanBtnState(){
  const btn = document.getElementById('loanSubmitBtn');
  if(!btn) return;
  if(curLoanType === 'given'){
    btn.setAttribute('data-i18n','loanGivenBtnLabel');
    btn.textContent = L('loanGivenBtnLabel');
    const amount = parseAmt(document.getElementById('loanAmount').value);
    const account = document.getElementById('loanAccount').value;
    if(account && amount && gtMoney(amount, accountBalance(account))){ btn.classList.add('state-insufficient'); }
    else { btn.classList.remove('state-insufficient'); }
  } else {
    btn.setAttribute('data-i18n','addLoanBtn');
    btn.textContent = L('addLoanBtn');
    btn.classList.remove('state-insufficient');
  }
}
function updateEntryBtnState(){
  const btn = document.getElementById('entrySubmitBtn');
  if(!btn) return;
  if(curType !== 'expense'){ btn.classList.remove('state-insufficient'); return; }
  const amount = parseAmt(document.getElementById('amountInput').value);
  const account = document.getElementById('accountInput').value;
  if(!account){ btn.classList.remove('state-insufficient'); return; }
  const avail = accountBalance(account);
  if(amount && gtMoney(amount, avail)){ btn.classList.add('state-insufficient'); }
  else { btn.classList.remove('state-insufficient'); }
}
function updateDepositHint(){
  const hint = document.getElementById('depositHint');
  if(!hint) return;
  const from = document.getElementById('depositFrom').value;
  if(!from){ hint.style.display = 'none'; return; }
  const to = document.getElementById('depositTo').value || from;
  const usable = accountBalance(from);
  const amt = parseAmt(document.getElementById('depositAmount').value) || 0;
  let txt;
  if(!amt){ txt = tfmt('depositUsableFmt', { amt: moneyFmt(usable) }); }
  else if(to === from){ txt = tfmt('depositSameHintFmt', { amt: moneyFmt(usable), left: moneyFmt(Math.max(0, round2(usable - amt))), amt2: moneyFmt(amt) }); }
  else { txt = tfmt('depositMoveHintFmt', { from: accLabelText(from), to: accLabelText(to), amt: moneyFmt(amt) }); }
  hint.textContent = txt;
  hint.style.display = 'block';
}
function renderWithdrawFromOptions(){
  const sel = document.getElementById('withdrawFrom');
  if(!sel) return;
  const cur = sel.value;
  const src = savingsContributionByAccount();
  const accs = getVisibleAccountsList().filter(a=> a.id !== 'savings' && (src[a.id] || 0) > 0);
  const ph = '<option value="" selected disabled>'+L('selectPlaceholder')+'</option>';
  sel.innerHTML = ph + accs.map(a=>{
    const label = escapeHtml(accNameText(a)) + ' — ' + moneyFmt(src[a.id]);
    return '<option value="'+escapeHtml(a.id)+'"'+(a.id===cur?' selected':'')+'>'+label+'</option>';
  }).join('');
  updateWithdrawAvailableHint();
}
function updateWithdrawAvailableHint(){
  const hint = document.getElementById('withdrawAvailableHint');
  if(!hint) return;
  const fromSel = document.getElementById('withdrawFrom');
  const from = fromSel ? fromSel.value : '';
  if(!from){ hint.style.display = 'none'; return; }
  const src = savingsContributionByAccount();
  hint.textContent = tfmt('withdrawAvailableFmt', { amt: moneyFmt(src[from] || 0) });
  hint.style.display = 'block';
}
function renderTransferSavingsFromOptions(){
  const sel = document.getElementById('transferSavingsFrom');
  if(!sel) return;
  const cur = sel.value;
  const src = savingsContributionByAccount();
  const accs = getVisibleAccountsList().filter(a=> a.id !== 'savings' && (src[a.id] || 0) > 0);
  const ph = '<option value="" selected disabled>'+L('selectPlaceholder')+'</option>';
  sel.innerHTML = ph + accs.map(a=>{
    const label = escapeHtml(accNameText(a)) + ' — ' + moneyFmt(src[a.id]);
    return '<option value="'+escapeHtml(a.id)+'"'+(a.id===cur?' selected':'')+'>'+label+'</option>';
  }).join('');
  updateTransferSavingsHint();
}
function updateTransferSavingsHint(){
  const hint = document.getElementById('transferSavingsAvailableHint');
  if(!hint) return;
  const from = document.getElementById('transferSavingsFrom').value;
  if(!from){ hint.style.display = 'none'; return; }
  const src = savingsContributionByAccount();
  hint.textContent = tfmt('transferSavingsAvailableFmt', { amt: moneyFmt(src[from] || 0) });
  hint.style.display = 'block';
}
function updateSelfLoanAvailableHint(){
  const hint = document.getElementById('selfLoanAvailableHint');
  if(!hint) return;
  const account = document.getElementById('selfLoanAccount').value;
  const val = document.getElementById('selfLoanAmount').value;
  if(!account && !val){ hint.style.display = 'none'; return; }
  const sav = accountBalance('savings');
  const amount = parseAmt(val) || 0;
  if(amount > 0){ hint.textContent = L('remainingAfterLabel') + ': ' + moneyFmt(sav - amount); }
  else { hint.textContent = tfmt('withdrawAvailableFmt', { amt: moneyFmt(sav) }); }
  hint.style.display = 'block';
}
function updateTransferAvailableHint(){
  const hint = document.getElementById('transferAvailableHint');
  if(!hint) return;
  const account = document.getElementById('transferFromSel').value;
  if(!account){ hint.style.display = 'none'; return; }
  const avail = accountBalance(account);
  hint.textContent = tfmt('transferAvailableFmt', { acc: accLabelText(account), amt: moneyFmt(avail) });
  hint.style.display = 'block';
}
document.getElementById('transferFromSel').addEventListener('change', updateTransferAvailableHint);

function syncTransferToOptions(){
  const fromSel = document.getElementById('transferFromSel');
  const toSel = document.getElementById('transferToSel');
  if(!fromSel || !toSel) return;
  const fromVal = fromSel.value;
  let needsSwitch = false;
  Array.from(toSel.options).forEach(opt=>{
    if(opt.value === '') return;
    opt.disabled = (fromVal !== '' && opt.value === fromVal);
    if(opt.disabled && toSel.value === opt.value) needsSwitch = true;
  });
  if(needsSwitch){
    const firstEnabled = Array.from(toSel.options).find(opt=> opt.value !== '' && !opt.disabled);
    if(firstEnabled) toSel.value = firstEnabled.value;
  }
}
document.getElementById('transferFromSel').addEventListener('change', syncTransferToOptions);

function updateTransferBtnState(){
  const btn = document.getElementById('transferSubmitBtn');
  if(!btn) return;
  const amount = parseAmt(document.getElementById('transferAmount').value);
  const account = document.getElementById('transferFromSel').value;
  if(!account){ btn.classList.remove('state-insufficient'); return; }
  const avail = accountBalance(account);
  if(amount && gtMoney(amount, avail)){ btn.classList.add('state-insufficient'); }
  else { btn.classList.remove('state-insufficient'); }
}
document.getElementById('transferAmount').addEventListener('input', updateTransferBtnState);
document.getElementById('transferFromSel').addEventListener('change', updateTransferBtnState);
document.getElementById('transferToSel').addEventListener('change', updateTransferBtnState);

function availableBalance(acc, excludeId){
  return round2(entries.filter(en=>en.account===acc && en.id!==excludeId).reduce((s,en)=> s + (en.type==='income'? en.amount : -en.amount), 0));
}

