function renderAccountOptions(){
  const accs = getAccountsList();
  if(!accs.length) return;
  const active = getActiveAccountsList();
  const nonSav = active.filter(a=> a.id !== 'savings');
  const all = active;
  const optHtml = (a, cur) => {
    const label = accNameText(a);
    const icon = accOptionIconText(a.icon);
    return '<option value="'+escapeHtml(a.id)+'"'+(a.id===cur?' selected':'')+'>'+escapeHtml(icon+label)+'</option>';
  };
  const ph = '<option value="" selected disabled>'+L('selectPlaceholder')+'</option>';

  ['accountInput','transferFromSel','transferToSel','depositFrom','withdrawTo','transferSavingsTo',
   'loanAccount','selfLoanAccount','selfLoanRepayAccount'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value;
    el.innerHTML = ph + nonSav.map(a=> optHtml(a, cur)).join('');
  });
  ['planAccount','buyPlanAccount'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value;
    el.innerHTML = ph + all.map(a=> optHtml(a, cur)).join('');
  });
  ['settleLoanAccount','settleDueAccount','selfLoanCardRepayAccount'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value || 'cash';
    el.innerHTML = nonSav.map(a=> optHtml(a, cur)).join('');
  });
  const dTo = document.getElementById('depositTo');
  if(dTo){
    const cur = dTo.value;
    dTo.innerHTML = '<option value="">'+escapeHtml(L('depositToSame'))+'</option>' + nonSav.map(a=> optHtml(a, cur)).join('');
    dTo.value = cur;
  }
  const bps = document.getElementById('buyPlanSavingsDest');
  if(bps){ const cur = bps.value; bps.innerHTML = nonSav.map(a=> optHtml(a, cur)).join(''); }
  const ed = document.getElementById('editAccount');
  if(ed){
    const cur = ed.value;
    const edAccs = accs.filter(a=> !a.archived || a.id === cur);
    // T11 #১১: cur তালিকার কোনো অ্যাকাউন্টের সাথে না মিললে (নষ্ট/ইম্পোর্ট করা ডেটায় অচেনা অ্যাকাউন্ট) নিঃশব্দে প্রথমটা না বেছে placeholder দেখাই
    const edHasCur = edAccs.some(a=> a.id === cur);
    ed.innerHTML = (edHasCur ? '' : ph) + edAccs.map(a=> optHtml(a, cur)).join('');
  }

  ['entryFilterAccount','allEntriesFilterAccount'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value || 'all';
    el.innerHTML = '<option value="all">'+L('filterAllOpt')+'</option>' + accs.map(a=> optHtml(a, cur)).join('');
  });
}

const ACC_SVG = {
  '💵':'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
  '🏦':'<path d="M3 21h18"/><path d="M5 21V10M9.5 21V10M14.5 21V10M19 21V10"/><path d="M12 3l9 5.5H3L12 3z"/>',
  '📱':'<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18h2"/>',
  '🏆':'<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>',
  '🐷':'<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/>',
  '💰':'<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  '💳':'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  '🏧':'<rect x="3" y="3" width="18" height="18" rx="2.5"/><rect x="7" y="7" width="10" height="5" rx="1"/><path d="M8 16.5h8"/>',
  '💸':'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  '🪙':'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.2"/>',
  '💎':'<path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3L8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
  '🏪':'<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v9h14v-9"/><path d="M10 21v-5h4v5"/>',
  '📮':'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 7l10 7 10-7"/>',
  '🎯':'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  '__loan':'<path d="M7 7h13l-4-4"/><path d="M17 17H4l4 4"/>',
  '__bkash':'<path style="fill:#d12053;stroke:none" d="M9.04 10.94L10.3 16.63L18.58 12.44Z"/><path style="fill:#e2136e;stroke:none" d="M11.39 2.44L9.04 10.95L18.58 12.44Z"/><path style="fill:#d12053;stroke:none" d="M1.28 1.2L11.15 2.38L8.82 10.83Z"/><path style="fill:#9e1638;stroke:none" d="M1.2 2.86L2.3 2.86L5.38 6.81Z"/><path style="fill:#d12053;stroke:none" d="M18.84 12.39L15.98 8.41L20.62 7.58Z"/><path style="fill:#e2136e;stroke:none" d="M18.37 13.55L18.66 12.67L11.42 16.34Z"/><path style="fill:#9e1638;stroke:none" d="M8.83 11.17L10.35 17.96L5.86 21.61Z"/><path style="fill:#e2136e;stroke:none" d="M20.17 9.6L22.8 9.56L20.9 7.62Z"/>'
};
function accIconHtml(ic){
  const path = ACC_SVG[ic];
  if(!path) return escapeHtml(ic || '');
  return '<svg class="acc-svg" viewBox="0 0 24 24" aria-hidden="true">'+path+'</svg>';
}
/* T11 — <option>-এ SVG রেন্ডার হয় না, তাই SVG-only আইকন-কী-র ইমোজি ফলব্যাক */
const OPTION_ICON_FALLBACK = { '__bkash': '📱', '__loan': '💸' };
function accOptionIconText(ic){
  if(!ic) return '';
  if(OPTION_ICON_FALLBACK[ic]) return OPTION_ICON_FALLBACK[ic] + ' ';
  if(ic.indexOf('__') === 0) return '';
  return ic + ' ';
}

const ACCOUNT_ICON_CHOICES = ['💵','🏦','📱','💰','💳','🏧','💸','🪙','💎','🏪','📮','🎯'];
const ACCOUNT_COLOR_CHOICES = [
  'var(--ledger-green)','var(--blue)','var(--purple)','var(--gold)',
  'var(--ledger-red)','#0E7C7B','#E67E22','#3E7CB1','#A15C9E','#4C8C6B'
];
let newAccIcon = '💰';
let newAccColor = 'var(--ledger-green)';

function accountRowState(acc){
  if(acc.isSystem) return 'system';
  const u = accountUsage(acc.id);
  if(u.entryCount + u.loans + u.dues + u.plans === 0) return 'delete';
  return eqMoney(accountBalance(acc.id), 0) ? 'archive' : 'transfer';
}
function accountRowHtml(a, actionsHtml){
  const label = escapeHtml(a.i18n ? L(a.name) : a.name);
  const bal = accountBalance(a.id);
  const badge = a.isSystem ? '<span class="ar-badge">'+escapeHtml(L('accSystemBadge'))+'</span>' : '';
  const iconBg = (a.icon === '__bkash') ? '#FFFFFF' : safeCssColor(a.color, 'var(--line)');
  return '<div class="account-row">'+
    '<div class="ar-icon" style="background:'+iconBg+';">'+accIconHtml(a.icon||'💰')+'</div>'+
    '<div class="ar-info">'+
      '<div class="ar-name">'+label+' '+badge+'</div>'+
      '<div class="ar-bal">'+moneyFmt(bal)+'</div>'+
    '</div>'+
    '<div class="ar-actions">'+actionsHtml+'</div>'+
  '</div>';
}
function accBtnHtml(act, id, cls, title, inner){
  return '<button class="ar-btn '+cls+'" data-id="'+escapeHtml(id)+'" data-act="'+act+'" title="'+escapeHtml(title)+'" aria-label="'+escapeHtml(title)+'">'+inner+'</button>';
}
function renderAccountsList(){
  const wrap = document.getElementById('accountsList');
  if(!wrap) return;
  const accs = getActiveAccountsList();
  wrap.innerHTML = accs.map(a=>{
    const st = accountRowState(a);
    let actions = '';
    if(st === 'delete') actions = accBtnHtml('del', a.id, 'del', L('accDeleteTitle'), '<svg class="acc-svg ui-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>');
    else if(st === 'archive') actions = accBtnHtml('archive', a.id, 'arch', L('accArchiveTitle'), '<svg class="acc-svg ui-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/></svg>');
    else if(st === 'transfer') actions = accBtnHtml('transfer', a.id, 'txt', L('accTransferFirstBtn'), escapeHtml(L('accTransferFirstBtn')));
    return accountRowHtml(a, actions);
  }).join('');

  const archived = getAccountsList().filter(a=> a.archived);
  const box = document.getElementById('archivedAccountsBox');
  const listEl = document.getElementById('archivedAccountsList');
  if(box && listEl){
    box.style.display = archived.length ? 'block' : 'none';
    listEl.innerHTML = archived.map(a=> accountRowHtml(a, accBtnHtml('restore', a.id, 'restore txt', L('accRestoreBtn'), escapeHtml(L('accRestoreBtn'))))).join('');
  }
  document.querySelectorAll('#accountsList .ar-btn, #archivedAccountsList .ar-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> accountAction(btn.dataset.act, btn.dataset.id));
  });
}

/* অ্যাকাউন্ট তালিকা বদলে সেভ ফেল করলে আগের অবস্থায় ফেরায় (true = সেভ হয়েছে) */
function saveAccountsOrRevert(snapJson){
  if(saveSettings()) return true;
  try{ settings.accounts = JSON.parse(snapJson); }catch(e){}
  toast(L('storageSaveFailMsg')); renderAll();
  return false;
}
function accountAction(act, id){
  const acc = getAccountMeta(id);
  if(!acc || acc.isSystem){ renderAccountsList(); return; }
  const name = accPlainName(acc);
  const changed = ()=>{ toast(L('accStateChangedToast')); renderAccountsList(); };
  if(act === 'restore'){
    if(!acc.archived){ changed(); return; }
    const snap = JSON.stringify(settings.accounts);
    delete acc.archived;
    if(!saveAccountsOrRevert(snap)) return;
    renderAll();
    toast(L('accRestoredToast'));
    return;
  }
  if(acc.archived){ changed(); return; }
  const st = accountRowState(acc);
  if(act === 'del'){
    if(st !== 'delete'){ changed(); return; }
    openSimpleConfirm(tfmt('accDeleteConfirmFmt', { name }), ()=>{
      const cur = getAccountMeta(id);
      if(!cur || accountRowState(cur) !== 'delete'){ changed(); return; }
      const snap = JSON.stringify(settings.accounts);
      settings.accounts = settings.accounts.filter(a=> a.id !== id);
      if(!saveAccountsOrRevert(snap)) return;
      renderAll();
      toast(L('accDeletedToast'));
    });
  } else if(act === 'archive'){
    if(st !== 'archive'){ changed(); return; }
    openSimpleConfirm(tfmt('accArchiveConfirmFmt', { name }), ()=>{
      const cur = getAccountMeta(id);
      if(!cur || accountRowState(cur) !== 'archive'){ changed(); return; }
      const snap = JSON.stringify(settings.accounts);
      cur.archived = true;
      if(!saveAccountsOrRevert(snap)) return;
      renderAll();
      toast(L('accArchivedToast'));
    });
  } else if(act === 'transfer'){
    if(st !== 'transfer'){ changed(); return; }
    openAlert(tfmt('accTransferFirstMsgFmt', { name, amt: moneyFmt(accountBalance(id)) }));
  }
}

function renderIconPicker(){
  const wrap = document.getElementById('accountIconPicker');
  if(!wrap) return;
  wrap.innerHTML = ACCOUNT_ICON_CHOICES.map(ic=>
    '<div class="icon-opt'+(ic===newAccIcon?' selected':'')+'" data-ic="'+ic+'">'+accIconHtml(ic)+'</div>'
  ).join('');
  wrap.querySelectorAll('.icon-opt').forEach(el=>{ el.addEventListener('click', ()=>{ newAccIcon = el.dataset.ic; renderIconPicker(); }); });
}
function renderColorPicker(){
  const wrap = document.getElementById('accountColorPicker');
  if(!wrap) return;
  wrap.innerHTML = ACCOUNT_COLOR_CHOICES.map(c=>
    '<div class="color-opt'+(c===newAccColor?' selected':'')+'" data-c="'+c+'" style="background:'+c+';"></div>'
  ).join('');
  wrap.querySelectorAll('.color-opt').forEach(el=>{ el.addEventListener('click', ()=>{ newAccColor = el.dataset.c; renderColorPicker(); }); });
}
function resetAccountForm(){
  document.getElementById('accountNameInput').value = '';
  newAccIcon = '💰';
  newAccColor = ACCOUNT_COLOR_CHOICES[getAccountsList().length % ACCOUNT_COLOR_CHOICES.length];
  renderIconPicker(); renderColorPicker();
}
document.getElementById('accountAddToggleBtn')?.addEventListener('click', ()=>{
  const box = document.getElementById('accountFormBox');
  const showing = box.style.display !== 'none';
  if(showing){ box.style.display = 'none'; } else { resetAccountForm(); box.style.display = 'block'; }
});
document.getElementById('accountFormCancelBtn')?.addEventListener('click', ()=>{ document.getElementById('accountFormBox').style.display = 'none'; });
document.getElementById('accountFormSaveBtn')?.addEventListener('click', ()=>{
  const name = document.getElementById('accountNameInput').value.trim();
  if(!name){ toast(L('accNameRequiredToast')); return; }
  const dup = getAccountsList().find(a=> accPlainName(a).toLowerCase() === name.toLowerCase());
  if(dup){ toast(dup.archived ? L('accNameDupArchivedToast') : L('accNameDupToast')); return; }
  const id = 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const snap = JSON.stringify(settings.accounts);
  settings.accounts.push({ id, name, icon: newAccIcon, color: newAccColor, isSystem: false, i18n: false });
  if(!saveAccountsOrRevert(snap)) return;
  document.getElementById('accountFormBox').style.display = 'none';
  renderAll();
  toast(L('accAddedToast'));
});

function renderAll(){
  updateBudgetLabels();
  renderAccountOptions();
  renderAccountsList();
  updateAcctAvailableHint();
  updateTransferBtnState();
  renderBalances();
  renderEntryList();
  if(allEntriesModalEl.classList.contains('open')) renderAllEntriesModalList();
  renderSavingsTab();
  renderLoansTab();
  renderDuesTab();
  renderNotes();
  renderPlans();
  renderPlanHistory();
  renderSummary();
  if(typeof renderDueReminders === 'function') renderDueReminders();
  refreshNoteSuggestions();
  refreshPlanItemSuggestions();
}
function renderDashAccCards(){
  const grid = document.getElementById('dashAccGrid');
  if(!grid) return;
  const accs = getVisibleAccountsList().filter(a=> a.id !== 'savings');
  const isDark = document.documentElement.getAttribute('data-theme')==='dark' || document.documentElement.getAttribute('data-theme')==='black';
  const bgMap = {
    cash:  isDark ? '#1E5A45' : '#D4E8DF',
    bank:  isDark ? '#1F3E63' : '#D6E2F2',
    bkash: '#FFFFFF',
    savings: isDark ? '#5A4418' : '#F5E6C0'
  };
  const iconBox = (bg, color, svgHtml) =>
    '<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:10px;background:'+bg+';color:'+color+';margin-right:8px;flex-shrink:0;">'+svgHtml+'</span>';
  let cardsHtml = accs.map(a=>{
    const label = escapeHtml(a.i18n ? L(a.name) : a.name);
    const color = safeCssColor(a.color);
    const bg = bgMap[a.id] || (isDark ? '#333' : '#EEE');
    const iconPart = a.icon ? iconBox(bg, color, accIconHtml(a.icon)) : '';
    return '<div class="acc-card" style="border-left-color:'+color+';">'+
      '<div><div class="lbl" style="display:flex;align-items:center;white-space:normal;overflow:visible;text-overflow:clip;font-size:12px;">'+iconPart+'<span>'+label+'</span></div>'+
      '<div class="val" id="balAcc_'+escapeHtml(a.id)+'">৳০</div></div>'+
      '<div class="acc-sub" id="balAccSav_'+escapeHtml(a.id)+'"></div>'+
    '</div>';
  }).join('');
  const loanBg = isDark ? '#5A2222' : '#F5D6D6';
  const loanCard = '<div class="acc-card loan"><div><div class="lbl" style="display:flex;align-items:center;white-space:normal;overflow:visible;font-size:12px;">'+iconBox(loanBg,'var(--ledger-red)',accIconHtml('__loan'))+'<span>'+L('accLoan')+'</span></div><div class="val loan-val" id="balLoanNet">৳০</div></div></div>';
  grid.innerHTML = cardsHtml + loanCard;
}

function renderBalances(){
  renderDashAccCards();
  const accs = getVisibleAccountsList().filter(a=> a.id !== 'savings');
  const sav = accountBalance('savings');
  const src = savingsContributionByAccount();
  const savLine = (v)=> v>0 ? tfmt('accSavingsLockedFmt', { amt: moneyFmt(v) }) : '';
  let totalNoSavings = 0;
  accs.forEach(a=>{
    const bal = accountBalance(a.id);
    const contrib = src[a.id] || 0;
    totalNoSavings = round2(totalNoSavings + bal);
    const valEl = document.getElementById('balAcc_'+a.id);
    if(valEl) valEl.textContent = moneyFmt(round2(bal + contrib));
    const subEl = document.getElementById('balAccSav_'+a.id);
    if(subEl) subEl.textContent = savLine(contrib);
  });
  document.getElementById('grandTotal').textContent = moneyFmt(round2(totalNoSavings + sav));
  document.getElementById('grandTotalNoSavings').textContent = moneyFmt(totalNoSavings);
  const bl = document.getElementById('balLoanNet');
  if(bl) bl.textContent = moneyFmt(loanTakenOwed());
  renderDailyMoneySummary();
}

function renderDailyMoneySummary(){
  const dueReceivable = round2(
    dues.filter(d=> d.type==='receivable' && !d.settled).reduce((s,d)=> s+d.amount, 0) +
    loans.filter(l=> l.type==='given' && !l.settled).reduce((s,l)=> s+l.amount, 0)
  );
  const duePayable = round2(dues.filter(d=> d.type==='payable' && !d.settled).reduce((s,d)=> s+d.amount, 0));
  const elR = document.getElementById('dailySumDueReceivable');
  const elP = document.getElementById('dailySumDuePayable');
  if(elR) elR.textContent = moneyFmt(dueReceivable);
  if(elP) elP.textContent = moneyFmt(duePayable);
}

function renderEntryList(){
  const list = document.getElementById('entryList');
  if(!list) return;
  const normal = entries.filter(en=> en.account !== 'savings');
  if(normal.length === 0){ list.innerHTML = '<div class="empty">'+L('noEntriesYet')+'</div>'; return; }
  const searchEl = document.getElementById('entrySearchInput');
  const accEl = document.getElementById('entryFilterAccount');
  const typeEl = document.getElementById('entryFilterType');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const accFilter = accEl ? accEl.value : 'all';
  const typeFilter = typeEl ? typeEl.value : 'all';
  const hasFilter = q !== '' || accFilter !== 'all' || typeFilter !== 'all';
  let filtered = normal;
  if(accFilter !== 'all') filtered = filtered.filter(en=> en.account === accFilter);
  if(typeFilter !== 'all') filtered = filtered.filter(en=> en.type === typeFilter);
  if(q !== '') filtered = filtered.filter(en=> ((en.note||'')+' '+(en.detail||'')).toLowerCase().includes(q));
  if(filtered.length === 0){ list.innerHTML = '<div class="empty">'+L('noFilteredEntries')+'</div>'; return; }
  const sorted = [...filtered].sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id - a.id);
  const shown = hasFilter ? sorted : sorted.slice(0,60);
  list.innerHTML = shown.map(en => `
    <div class="entry ${en.transfer ? '' : (en.type==='income' ? 'income-bg' : 'expense-bg')}" onclick="openEntryDetail(${Number(en.id)})" role="button" tabindex="0">
      <div class="left">
        <span class="tag"><span class="accbadge">${accLabel(en.account)}</span>${(en.budgetType==='need'||en.budgetType==='want')?('<span class="bwbadge '+en.budgetType+'">'+L(en.budgetType+'Label')+'</span>'):''}<span class="en-date">${escapeHtml(en.date)}</span>${en.note ? '<span class="en-note">' + escapeHtml(en.note) + '</span>' : ''}${entryDetailSpan(en)}</span>
      </div>
      <div class="actions">
        <span class="amt ${en.type}">${en.type==='income'?'+':'-'}${moneyFmt(en.amount)}</span>
        ${entryActionsHtml(en)}
      </div>
    </div>
  `).join('');
}

