/* ============================================================
   Recurring (no account, no transfer)
   ============================================================ */
function currentPeriodParts(){ const now = new Date(); return { y: now.getFullYear(), m: now.getMonth()+1 }; }
function periodKey(interval, y, m){ return interval === 'yearly' ? String(y) : (String(y) + '-' + String(m).padStart(2,'0')); }
function getRecurringPeriods(tpl){
  const [cy, cm] = tpl.createdPeriod.split('-').map(Number);
  const { y: ny, m: nm } = currentPeriodParts();
  const periods = [];
  if(tpl.interval === 'yearly'){
    let y = cy;
    while(y < ny || (y === ny && nm >= cm)){ periods.push(String(y)); y++; }
  } else {
    let y = cy, m = cm;
    while(y < ny || (y === ny && m <= nm)){ periods.push(periodKey('monthly', y, m)); m++; if(m>12){ m=1; y++; } }
  }
  return periods;
}
function getPendingPeriods(tpl){ return getRecurringPeriods(tpl).filter(p => !tpl.history[p]); }
function getAllPendingRecurring(){
  const out = [];
  recurringTemplates.forEach(tpl=>{ getPendingPeriods(tpl).forEach(period=>{ out.push({ tpl, period }); }); });
  return out;
}
function formatPeriodLabel(tpl, period){
  if(tpl.interval === 'yearly') return numFmt(period);
  const [y,m] = period.split('-').map(Number);
  return tfmt('recurringPeriodFmt', { month: monthName(m-1), year: numFmt(y) });
}
function recurringTypeLabel(type){ return type==='income' ? L('typeIncome') : L('typeExpense'); }

/* T6: history কাটছাঁট (আগের trimRecurringHistory, ৬০ সীমা) সরানো হয়েছে — getRecurringPeriods createdPeriod থেকে গোনে, তাই পুরনো মাসের history কাটলে সেগুলো আবার "pending" হয়ে যেত। history মাসে ১টা ছোট কী, জমলে ক্ষতি নেই। */

/* T6: পেমেন্টের এন্ট্রির তারিখ — বর্তমান পিরিয়ড হলে আজ; অতীতের হলে ওই মাসের শেষ দিন (yearly হলে ৩১ ডিসেম্বর)। */
function recurringPayDate(tpl, period){
  const { y: ny, m: nm } = currentPeriodParts();
  if(tpl.interval === 'yearly'){
    const y = Number(period);
    if(!isFinite(y) || y >= ny) return todayStr();
    return y + '-12-31';
  }
  const parts = String(period).split('-').map(Number);
  const y = parts[0], m = parts[1];
  if(!isFinite(y) || !isFinite(m) || y > ny || (y === ny && m >= nm)) return todayStr();
  return toISO(new Date(y, m, 0));   // m এখানে ১-ভিত্তিক, তাই new Date(y, m, 0) = ওই মাসের শেষ দিন
}

/* T6: মুছে যাওয়া এন্ট্রি কোনো paid history ধরে থাকলে ওই history সরাও (মাসটি আবার pending)।
   ফেরত দেয় সরানো রেকর্ডের তালিকা (আন্ডুতে restoreRecurringHistory-তে দেওয়ার জন্য)। */
/* T11: save=false দিলে এই ফাংশন নিজে saveRecurring() করে না — কলার (যেমন entries.js)
   entries+recurring একসাথে অ্যাটমিকভাবে সেভ করতে চাইলে এভাবে কল করে। */
function detachRecurringHistoryForEntries(ids, save){
  if(save === undefined) save = true;
  const removed = [];
  recurringTemplates.forEach(tpl=>{
    if(!tpl.history || typeof tpl.history !== 'object') return;
    Object.keys(tpl.history).forEach(period=>{
      const rec = tpl.history[period];
      if(rec && Array.isArray(rec.entryIds) && rec.entryIds.some(id=> ids.indexOf(id) !== -1)){
        removed.push({ tpl, period, rec });
        delete tpl.history[period];
      }
    });
  });
  if(removed.length && save){ saveRecurring(); checkRecurringReminder(); renderRecurringTplList(); }
  return removed;
}
function restoreRecurringHistory(removed, save){
  if(save === undefined) save = true;
  let changed = false;
  removed.forEach(r=>{
    if(recurringTemplates.indexOf(r.tpl) === -1) return;   // এর মধ্যে টেমপ্লেট মুছে ফেললে আর ফেরানোর কিছু নেই
    if(r.tpl.history[r.period]) return;                    // এর মধ্যে ওই মাস আবার পে/স্কিপ হলে ওভাররাইট করো না
    r.tpl.history[r.period] = r.rec; changed = true;
  });
  if(changed && save){ saveRecurring(); checkRecurringReminder(); renderRecurringTplList(); }
}

function checkRecurringReminder(){
  const badge = document.getElementById('bellBadge');
  const bell = document.getElementById('bellBtn');
  const n = getAllPendingRecurring().length + ((typeof getNotifDueItems === 'function') ? getNotifDueItems().length : 0) + (getBackupReminderMsg() ? 1 : 0);
  if(badge){
    badge.textContent = n > 9 ? numFmt(9)+'+' : numFmt(n);
    badge.classList.toggle('show', n > 0);
  }
  if(bell) bell.setAttribute('aria-label', n > 0 ? (L('notifTitle')+' ('+n+')') : L('notifTitle'));
  const modal = document.getElementById('recurringPendingModal');
  if(modal && modal.classList.contains('open')) renderRecurringPendingModal();
}
document.getElementById('bellBtn').addEventListener('click', openRecurringPendingModal);

function notifBackupAction(){
  closeRecurringPendingModal();
  setTimeout(openBackupSection, 120);
}
function openRecurringPendingModal(){
  notifOpenKey = null;   // প্রতিবার খুললে সব বন্ধ — শুধু টাইটেল
  renderRecurringPendingModal();
  document.getElementById('recurringPendingModal').classList.add('open');
  lockBodyScroll();
}
function closeRecurringPendingModal(){
  document.getElementById('recurringPendingModal').classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('recurringPendingCloseBtn').addEventListener('click', closeRecurringPendingModal);
document.getElementById('recurringPendingModal').addEventListener('click', (e)=>{
  const head = e.target.closest && e.target.closest('.nt-head');
  if(!head) return;
  const item = head.parentElement, willOpen = !item.classList.contains('open');
  document.querySelectorAll('#recurringPendingModal .notif-item.open').forEach(x=>{ x.classList.remove('open'); const h=x.querySelector('.nt-head'); if(h) h.setAttribute('aria-expanded','false'); });
  if(willOpen){ item.classList.add('open'); head.setAttribute('aria-expanded','true'); }
  notifOpenKey = willOpen ? item.dataset.key : null;
});
document.getElementById('recurringPendingModal').addEventListener('click', (e)=>{ if(e.target.id==='recurringPendingModal') closeRecurringPendingModal(); });

function renderRecurringPendingModal(){
  const wrap = document.getElementById('recurringPendingList');
  const pending = getAllPendingRecurring();
  const dueItems = (typeof getNotifDueItems === 'function') ? getNotifDueItems() : [];
  const backupMsg = getBackupReminderMsg();
  const total = pending.length + dueItems.length + (backupMsg ? 1 : 0);
  const cnt = document.getElementById('notifCount');
  if(cnt){ cnt.textContent = total ? numFmt(total) : ''; cnt.style.display = total ? '' : 'none'; }
  const emptyEl = document.getElementById('notifEmpty');
  if(emptyEl) emptyEl.style.display = total ? 'none' : 'block';
  const secLbl = document.getElementById('notifSectionLabel');
  if(secLbl) secLbl.style.display = pending.length ? '' : 'none';
  const bkLbl = document.getElementById('notifBackupLabel');
  const bkWrap = document.getElementById('notifBackupList');
  if(bkLbl) bkLbl.style.display = backupMsg ? '' : 'none';
  if(bkWrap){
    const open = (notifOpenKey === 'b:backup');
    bkWrap.innerHTML = backupMsg ? '<div class="notif-item notif-due recv'+(open ? ' open' : '')+'" data-key="b:backup" style="--bk:1">'+
      '<button type="button" class="nt-head" aria-expanded="'+(open ? 'true' : 'false')+'"><span class="nt-title">'+escapeHtml(backupMsg)+'</span>'+NT_CHEVRON+'</button>'+
      '<div class="nt-body"><div class="nd-actions"><button class="ri-pay-btn nd-btn" onclick="notifBackupAction()">'+L('backupReminderBtn')+'</button></div></div></div>' : '';
  }
  const dueLbl = document.getElementById('notifDueLabel');
  const dueWrap = document.getElementById('notifDueList');
  if(dueLbl) dueLbl.style.display = dueItems.length ? '' : 'none';
  if(dueWrap) dueWrap.innerHTML = dueItems.length ? renderNotifDueCards(dueItems) : '';
  if(pending.length === 0){ wrap.innerHTML = ''; return; }
  const accs = getActiveAccountsList().filter(a=> a.id !== 'savings');
  const accOpts = accs.map(a => '<option value="'+escapeHtml(a.id)+'">'+escapeHtml(accOptionIconText(a.icon)+(a.i18n ? L(a.name) : a.name))+'</option>').join('');
  const skipLinkKey = { expense:'recurringSkipLinkExpense', income:'recurringSkipLinkIncome' };
  wrap.innerHTML = pending.map(({tpl, period})=>{
    const key = 'r:'+Number(tpl.id)+':'+period;
    const isOpen = (notifOpenKey === key);
    return '<div class="recurring-item notif-item'+(isOpen ? ' open' : '')+'" data-key="'+escapeHtml(key)+'" data-tpl="'+Number(tpl.id)+'" data-period="'+escapeHtml(period)+'">'+
      '<button type="button" class="nt-head" aria-expanded="'+(isOpen ? 'true' : 'false')+'"><span class="nt-title">'+escapeHtml(tpl.note)+'</span>'+NT_CHEVRON+'</button>'+
      '<div class="nt-body">'+
      '<div class="ri-top"><span class="ri-note">'+escapeHtml(tpl.note)+'</span><span class="ri-amt">'+moneyFmt(tpl.amount)+'</span></div>'+
      (tpl.detail ? '<div class="ri-meta">'+escapeHtml(tpl.detail)+'</div>' : '')+'<div class="ri-meta">'+recurringTypeLabel(tpl.type)+' · '+formatPeriodLabel(tpl, period)+'</div>'+
      '<label style="display:block; margin-top:8px;">'+L('recurringPayFromLabel')+'</label>'+
      '<select class="ri-account-sel" style="margin-top:4px;">'+accOpts+'</select>'+
      '<div class="settings-desc ri-acct-hint" style="margin-top:4px; font-weight:600;"></div>'+
      '<div class="ri-actions">'+
        '<button class="ri-pay-btn" data-act="pay">'+L('recurringPayBtn')+'</button>'+
        '<button class="ri-skip-link" data-act="skip">'+L(skipLinkKey[tpl.type]||'recurringSkipLinkExpense')+'</button>'+
      '</div></div></div>';
  }).join('');
  wrap.querySelectorAll('.recurring-item').forEach(item=>{
    const tplId = item.dataset.tpl;
    const period = item.dataset.period;
    const sel = item.querySelector('.ri-account-sel');
    const hint = item.querySelector('.ri-acct-hint');
    const tpl = recurringTemplates.find(t=>String(t.id)===tplId);
    if(!tpl || !sel) return;
    const updateHint = ()=>{
      const acc = sel.value;
      const bal = accountBalance(acc);
      if(tpl.type === 'expense'){
        hint.textContent = tfmt('acctAvailableFmt', { acc: accLabelText(acc), amt: moneyFmt(bal) });
        hint.style.color = gtMoney(tpl.amount, bal) ? 'var(--ledger-red)' : 'var(--ledger-green)';
      } else {
        hint.textContent = tfmt('transferAvailableFmt', { acc: accLabelText(acc), amt: moneyFmt(bal) });
        hint.style.color = 'var(--ledger-green)';
      }
    };
    sel.addEventListener('change', updateHint);
    updateHint();
    if(!sel.options.length){ const pb = item.querySelector('[data-act="pay"]'); if(pb){ pb.disabled = true; pb.style.opacity = '.5'; } }
    item.querySelector('[data-act="pay"]').addEventListener('click', ()=>{ payRecurring(tpl, period, sel.value); });
    item.querySelector('[data-act="skip"]').addEventListener('click', ()=>{ skipRecurring(tpl, period); });
  });
}
function payRecurring(tpl, period, account){
  const date = recurringPayDate(tpl, period);
  const note = tpl.note;
  const entryIds = [];
  if(!account){ openAlert(L('entrySelectAccountMsg')); return; }
  const tx = txBegin(['hisab_entries','hisab_recurring']);
  if(tpl.type === 'expense'){
    if(gtMoney(tpl.amount, accountBalance(account))){ openAlert(L('recurringInsufficientBalance')); return; }
    const id1 = nextId();
    const ne = { id:id1, type:'expense', account, amount:tpl.amount, date, note, transfer:false, budgetType: tpl.budgetType || 'need' };
    if(tpl.detail) ne.detail = tpl.detail;
    entries.push(ne);
    entryIds.push(id1);
  } else {
    const id1 = nextId();
    const ni = { id:id1, type:'income', account, amount:tpl.amount, date, note, transfer:false, budgetType:null };
    if(tpl.detail) ni.detail = tpl.detail;
    entries.push(ni);
    entryIds.push(id1);
  }
  tpl.history[period] = { status:'paid', entryIds, amount: tpl.amount, account };
  if(!txCommit(tx)) return;
  toast(L('recurringPaidToast'));
  renderAll(); checkRecurringReminder();
  renderRecurringPendingModal();
  renderRecurringTplList();
}
function skipRecurring(tpl, period){
  const confirmKey = { expense:'recurringSkipConfirmExpense', income:'recurringSkipConfirmIncome' };
  openSimpleConfirm(L(confirmKey[tpl.type] || 'recurringSkipConfirmExpense'), ()=>{
    const tx = txBegin(['hisab_recurring']);
    tpl.history[period] = { status:'skipped' };
    if(!txCommit(tx)) return;
    toast(L('recurringSkippedToast'));
    checkRecurringReminder();
    renderRecurringPendingModal();
    renderRecurringTplList();
  });
}
function renderRecurringTplList(){
  const wrap = document.getElementById('recurringTplList');
  const emptyMsg = document.getElementById('recurringTplEmptyMsg');
  if(!wrap) return;
  if(recurringTemplates.length === 0){ wrap.innerHTML = ''; if(emptyMsg) emptyMsg.style.display = 'block'; return; }
  if(emptyMsg) emptyMsg.style.display = 'none';
  wrap.innerHTML = recurringTemplates.map(tpl=>{
    const intervalTag = tpl.interval === 'yearly' ? L('recurringYearlyTag') : L('recurringMonthlyTag');
    return '<div class="recurring-tpl-row">'+
      '<div class="rt-info"><b>'+escapeHtml(tpl.note)+'</b>'+(tpl.detail ? '<small class="rt-detail">'+escapeHtml(tpl.detail)+'</small>' : '')+moneyFmt(tpl.amount)+' · '+intervalTag+' · '+recurringTypeLabel(tpl.type)+'</div>'+
      '<button class="ri-del-btn" data-id="'+Number(tpl.id)+'">'+L('deleteBtn')+'</button>'+
    '</div>';
  }).join('');
  wrap.querySelectorAll('.ri-del-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const tpl = recurringTemplates.find(t=>String(t.id)===btn.dataset.id);
      if(!tpl) return;
      openSimpleConfirm(L('recurringTplDeleteConfirm'), ()=>{
        const tx = txBegin(['hisab_recurring']);
        recurringTemplates = recurringTemplates.filter(t=>t.id!==tpl.id);
        if(!txCommit(tx)) return;
        toast(L('recurringTplDeletedToast'));
        renderRecurringTplList(); checkRecurringReminder();
      });
    });
  });
}
function recurringFormSetType(type){
  document.querySelectorAll('.recTypeBtn').forEach(b=>b.classList.toggle('on', b.dataset.type===type));
  const box = document.getElementById('recurringBudgetBox');
  if(box) box.style.visibility = type==='expense' ? 'visible' : 'hidden';
}
document.querySelectorAll('.recTypeBtn').forEach(btn=>{ btn.addEventListener('click', ()=>recurringFormSetType(btn.dataset.type)); });
function resetRecurringForm(){
  document.getElementById('recurringEditId').value = '';
  document.getElementById('recurringNoteInput').value = '';
  document.getElementById('recurringDetailInput').value = '';
  document.getElementById('recurringAmountInput').value = '';
  document.getElementById('recurringIntervalInput').value = 'monthly';
  document.getElementById('recurringBudgetType').value = 'need';
  recurringFormSetType('expense');
}
document.getElementById('recurringAddToggleBtn').addEventListener('click', ()=>{
  const box = document.getElementById('recurringFormBox');
  const showing = box.style.display !== 'none';
  if(showing){ box.style.display = 'none'; } else { resetRecurringForm(); box.style.display = 'block'; }
});
document.getElementById('recurringFormCancelBtn').addEventListener('click', ()=>{ document.getElementById('recurringFormBox').style.display = 'none'; });
document.getElementById('recurringFormSaveBtn').addEventListener('click', ()=>{
  const note = document.getElementById('recurringNoteInput').value.trim();
  if(!note){ toast(L('recurringNoteRequiredMsg')); return; }
  const detail = clipDetail(document.getElementById('recurringDetailInput').value);
  const amount = parseAmt(document.getElementById('recurringAmountInput').value);
  if(!amount || amount <= 0){ toast(L('recurringAmountRequiredMsg')); return; }
  const type = document.querySelector('.recTypeBtn.on').dataset.type;
  const interval = document.getElementById('recurringIntervalInput').value;
  const budgetType = type === 'expense' ? document.getElementById('recurringBudgetType').value : null;
  const editId = document.getElementById('recurringEditId').value;
  const tx = txBegin(['hisab_recurring']);
  if(editId){
    const tpl = recurringTemplates.find(t=>String(t.id)===editId);
    if(tpl){ Object.assign(tpl, { note, type, amount, interval, budgetType }); delete tpl.account; delete tpl.toAccount; if(detail) tpl.detail = detail; else delete tpl.detail; }
  } else {
    const { y, m } = currentPeriodParts();
    const nt = { id: nextId(), note, type, amount, budgetType, interval, createdPeriod: periodKey('monthly', y, m), history: {} };
    if(detail) nt.detail = detail;
    recurringTemplates.push(nt);
  }
  if(!txCommit(tx)) return;
  toast(L('recurringSavedToast'));
  document.getElementById('recurringFormBox').style.display = 'none';
  renderRecurringTplList(); checkRecurringReminder();
});

