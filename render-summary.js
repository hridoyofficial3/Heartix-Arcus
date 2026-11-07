document.addEventListener('click', function(ev){
  const b = ev.target.closest && ev.target.closest('#monthlyChartWrap .chart-hit');
  if(!b) return;
  const idx = b.getAttribute('data-chart-idx');
  chartSelect(b.getAttribute('data-chart-key'));
  const nb = document.querySelector('#monthlyChartWrap .chart-hit[data-chart-idx="'+idx+'"]');
  if(nb) nb.focus();
});
const PIE_PALETTE = ['var(--ledger-green)','var(--blue)','var(--purple)','var(--gold)','var(--ledger-red)','#0891B2','#DB2777','#65A30D'];
function renderCategoryPie(wrapId, legendId, catsObj, emptyMsg){
  const wrap = document.getElementById(wrapId);
  const legend = document.getElementById(legendId);
  if(!wrap || !legend) return;
  const keys = Object.keys(catsObj).sort((a,b)=>catsObj[b]-catsObj[a]).slice(0,8);
  const total = round2(keys.reduce((s,k)=>s+catsObj[k],0));
  if(keys.length===0 || total<=0){
    wrap.innerHTML = '';
    legend.innerHTML = '<div class="empty">'+escapeHtml(emptyMsg)+'</div>';
    return;
  }
  const r = 40, cx = 50, cy = 50, sw = 16;
  const circumference = 2 * Math.PI * r;
  let offsetAcc = 0, circles = '';
  const legendRows = [];
  keys.forEach((k, i)=>{
    const val = catsObj[k];
    const frac = val / total;
    const color = PIE_PALETTE[i % PIE_PALETTE.length];
    const dash = Math.max(0, frac * circumference);
    circles += '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="'+sw+'" ' +
      'stroke-dasharray="'+dash.toFixed(2)+' '+(circumference-dash).toFixed(2)+'" ' +
      'stroke-dashoffset="'+(-offsetAcc).toFixed(2)+'"></circle>';
    offsetAcc += dash;
    const pct = Math.round(frac*100);
    legendRows.push('<div class="pie-legend-item cd-click" role="button" tabindex="0" data-type="'+(legendId==='incomePieLegend'?'income':'expense')+'" data-key="'+escapeHtml(k)+'"><span class="sw" style="background:'+color+';"></span><span class="nm">'+escapeHtml(k)+'</span><span class="pc">'+pct+'%</span></div>');
  });
  wrap.innerHTML = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
    '<g transform="rotate(-90 '+cx+' '+cy+')">' + circles + '</g>' +
    '</svg>';
  legend.innerHTML = legendRows.join('');
}
function renderSummary(){
  const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
  document.getElementById('monthLabel').textContent = monthName(m) + ' ' + numFmt(y);
  document.getElementById('yearLabel').textContent = numFmt(viewYear);
  document.getElementById('dayLabel').textContent = fmtDayLabel(viewDay);
  const wkEnd = new Date(viewWeekStart); wkEnd.setDate(wkEnd.getDate() + 6);
  document.getElementById('weekLabel').textContent = fmtWeekLabel(viewWeekStart, wkEnd);

  let anchorDate;
  if(periodMode === 'day')        anchorDate = viewDay;
  else if(periodMode === 'week')  anchorDate = viewWeekStart;
  else if(periodMode === 'year')  anchorDate = new Date(viewYear, 0, 1);
  else                            anchorDate = viewMonth;

  const chartTitleKey = periodMode === 'day'   ? 'monthlyChartTitleDay'
                      : periodMode === 'week'  ? 'monthlyChartTitleWeek'
                      : periodMode === 'year'  ? 'monthlyChartTitleYear'
                      : periodMode === 'all'   ? 'monthlyChartTitleAll'
                      : 'monthlyChartTitle';
  const chartTitleEl = document.getElementById('monthlyChartTitleText');
  if(chartTitleEl) chartTitleEl.textContent = L(chartTitleKey);

  renderPeriodChart(anchorDate);

  const range = getPeriodRange();
  const inRange = (ds) => !!ds && ds >= range.start && ds <= range.end;
  const monthAll = entries.filter(en => inRange(en.date));
  const monthNormal = monthAll.filter(en=>!en.transfer);
  const monthOperating = monthNormal.filter(isOperating);
  const inc = round2(monthOperating.filter(en=>en.type==='income').reduce((s,e)=>s+e.amount,0));
  const exp = round2(monthOperating.filter(en=>en.type==='expense').reduce((s,e)=>s+e.amount,0));
  document.getElementById('sumIncome').textContent = moneyFmt(inc);
  document.getElementById('sumExpense').textContent = moneyFmt(exp);

  const periodLoans = loans.filter(l => inRange(l.date));
  const periodPayable = round2(periodLoans.filter(l=> (l.type==='taken' || l.type==='self') && !l.settled).reduce((s,l)=> s+l.amount, 0));
  const periodReceivable = round2(periodLoans.filter(l=> l.type==='given' && !l.settled).reduce((s,l)=> s+l.amount, 0));

  const periodDues = dues.filter(d => inRange(d.date));
  const periodDueReceivable = round2(periodDues.filter(d=> d.type==='receivable' && !d.settled).reduce((s,d)=> s+d.amount, 0));
  const periodDuePayable = round2(periodDues.filter(d=> d.type==='payable' && !d.settled).reduce((s,d)=> s+d.amount, 0));

  const { needPct, wantPct } = getPctForMonth(anchorDate.getFullYear(), anchorDate.getMonth());
  const needSpent = round2(monthOperating.filter(en=>en.type==='expense' && en.budgetType==='need').reduce((s,e)=>s+e.amount,0));
  const wantSpent = round2(monthOperating.filter(en=>en.type==='expense' && en.budgetType==='want').reduce((s,e)=>s+e.amount,0));
  const needTarget = round2(inc * needPct/100), wantTarget = round2(inc * wantPct/100);
  document.getElementById('budgetTitle').textContent = tfmt('budgetTitleFmt', { need:numFmt(needPct), want:numFmt(wantPct) });
  document.getElementById('needSpentLabel').textContent = tfmt('needPctLabelFmt', { pct:numFmt(needPct) });
  document.getElementById('wantSpentLabel').textContent = tfmt('wantPctLabelFmt', { pct:numFmt(wantPct) });
  document.getElementById('needAmt').textContent = moneyFmt(needSpent) + (inc>0? ' / '+moneyFmt(needTarget) : '');
  document.getElementById('wantAmt').textContent = moneyFmt(wantSpent) + (inc>0? ' / '+moneyFmt(wantTarget) : '');
  const needRatioPct = needTarget>0 ? (needSpent/needTarget*100) : (needSpent>0 ? 150 : 0);
  const wantRatioPct = wantTarget>0 ? (wantSpent/wantTarget*100) : (wantSpent>0 ? 150 : 0);
  const needFillEl = document.getElementById('needFill'), wantFillEl = document.getElementById('wantFill');
  needFillEl.style.width = (needTarget>0 ? Math.min(100, Math.round(needRatioPct)) : (needSpent>0 ? 100 : 0)) + '%';
  needFillEl.style.background = budgetBarColor(needRatioPct);
  wantFillEl.style.width = (wantTarget>0 ? Math.min(100, Math.round(wantRatioPct)) : (wantSpent>0 ? 100 : 0)) + '%';
  wantFillEl.style.background = budgetBarColor(wantRatioPct);

  catDetailSource = { expense: Object.create(null), income: Object.create(null) };
  monthOperating.forEach(en=>{
    if(en.type !== 'expense' && en.type !== 'income') return;
    const k = en.note ? en.note.trim() : L('otherCategory');
    (catDetailSource[en.type][k] = catDetailSource[en.type][k] || []).push(en);
  });
  const cats = Object.create(null);
  monthOperating.filter(en=>en.type==='expense').forEach(en=>{
    const key = en.note ? en.note.trim() : L('otherCategory');
    cats[key] = round2((cats[key]||0) + en.amount);
  });
  const catDiv = document.getElementById('catBreakdown');
  const catKeys = Object.keys(cats).sort((a,b)=>cats[b]-cats[a]).slice(0,8);
  if(catKeys.length===0){ catDiv.innerHTML = '<div class="empty">'+L('noExpense')+'</div>'; }
  else {
    const max = cats[catKeys[0]];
    catDiv.innerHTML = catKeys.map(k=>'<div class="catrow cd-click" role="button" tabindex="0" data-type="expense" data-key="'+escapeHtml(k)+'"><span class="k">'+escapeHtml(k)+'</span><span class="bar"><span style="width:'+Math.round((cats[k]/max)*100)+'%"></span></span><span class="v">'+moneyFmt(cats[k])+'</span><span class="cd-chev">›</span></div>').join('');
  }

  const incomeCats = Object.create(null);
  monthOperating.filter(en=>en.type==='income').forEach(en=>{
    const key = en.note ? en.note.trim() : L('otherCategory');
    incomeCats[key] = round2((incomeCats[key]||0) + en.amount);
  });
  const incomeDiv = document.getElementById('incomeBreakdown');
  const incomeKeys = Object.keys(incomeCats).sort((a,b)=>incomeCats[b]-incomeCats[a]).slice(0,8);
  if(incomeKeys.length===0){ incomeDiv.innerHTML = '<div class="empty">'+L('noIncome')+'</div>'; }
  else {
    const incMax = incomeCats[incomeKeys[0]];
    incomeDiv.innerHTML = incomeKeys.map(k=>'<div class="catrow cd-click" role="button" tabindex="0" data-type="income" data-key="'+escapeHtml(k)+'"><span class="k">'+escapeHtml(k)+'</span><span class="bar"><span style="width:'+Math.round((incomeCats[k]/incMax)*100)+'%; background:var(--ledger-green);"></span></span><span class="v">'+moneyFmt(incomeCats[k])+'</span><span class="cd-chev">›</span></div>').join('');
  }
  renderCategoryPie('incomePieWrap', 'incomePieLegend', incomeCats, L('noIncome'));
  renderCategoryPie('expensePieWrap', 'expensePieLegend', cats, L('noExpense'));

  const settleEntries = monthNormal.filter(en => en.loanId || en.dueId);
  const periodCollected = round2(settleEntries.filter(en=>en.type==='income').reduce((s,e)=>s+e.amount,0));
  const periodRepaid = round2(settleEntries.filter(en=>en.type==='expense').reduce((s,e)=>s+e.amount,0));

  document.getElementById('dbRowDuePayable').querySelector('.val').textContent = moneyFmt(periodDuePayable);
  document.getElementById('dbRowDueReceivable').querySelector('.val').textContent = moneyFmt(periodDueReceivable);
  document.getElementById('dbRowReceivable').querySelector('.val').textContent = moneyFmt(periodReceivable);
  document.getElementById('dbRowPayable').querySelector('.val').textContent = moneyFmt(periodPayable);
  document.getElementById('dbRowCollected').querySelector('.val').textContent = moneyFmt(periodCollected);
  document.getElementById('dbRowRepaid').querySelector('.val').textContent = moneyFmt(periodRepaid);

  const titleKey = periodMode === 'day'   ? 'entryListTitleDay'
                 : periodMode === 'week'  ? 'entryListTitleWeek'
                 : periodMode === 'month' ? 'entryListTitleMonth'
                 : periodMode === 'year'  ? 'entryListTitleYear'
                 : 'entryListTitleAll';
  document.getElementById('entryListTitleText').textContent = L(titleKey);

  const monthList = document.getElementById('monthEntryList');
  if(monthNormal.length===0){ monthList.innerHTML = '<div class="empty">'+L('noEntries')+'</div>'; }
  else {
    const sorted = [...monthNormal].sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id-a.id);
    monthList.innerHTML = sorted.map(en=>'<div class="entry"><div class="left"><span class="tag"><span class="accbadge">'+accLabel(en.account)+'</span>'+((en.budgetType==='need'||en.budgetType==='want')?('<span class="bwbadge '+en.budgetType+'">'+L(en.budgetType+'Label')+'</span>'):'')+'<span class="en-date">'+escapeHtml(en.date)+'</span>'+(en.note?'<span class="en-note">'+escapeHtml(en.note)+'</span>':'')+entryDetailSpan(en)+'</span></div><div class="actions"><span class="amt '+en.type+'">'+(en.type==='income'?'+':'-')+moneyFmt(en.amount)+'</span>'+entryActionsHtml(en)+'</div></div>').join('');
  }
}

const debtDetailModalEl = document.getElementById('debtDetailModal');
const DEBT_DETAIL_TITLE_KEYS = {
  duePayable:'debtBoxDuePayableLabel', dueReceivable:'debtBoxDueReceivableLabel',
  receivable:'totalReceivableLabel', payable:'totalPayableLabel',
  collected:'debtCollectedLabel', repaid:'debtRepaidLabel'
};
/* S8 — ৬ সারির ডিটেইল তালিকা। §৫-এর সংজ্ঞা renderSummary-এর সাথে হুবহু এক (একই inRange/monthNormal/settleEntries নিয়ম) */
function getDebtDetailRows(kind){
  const range = getPeriodRange();
  const inRange = (ds) => !!ds && ds >= range.start && ds <= range.end;
  const rows = [];
  if(kind === 'duePayable' || kind === 'dueReceivable'){
    const dtype = kind === 'duePayable' ? 'payable' : 'receivable';
    dues.filter(d => d.type===dtype && !d.settled && inRange(d.date)).forEach(d=>{
      rows.push({ id:d.id, badge:'', name:d.person, note:d.reason, date:d.date, acc:'', amount:d.amount, original:d.originalAmount, paid:d.paidAmount });
    });
  } else if(kind === 'receivable' || kind === 'payable'){
    loans.filter(l => (kind==='receivable' ? l.type==='given' : (l.type==='taken' || l.type==='self')) && !l.settled && inRange(l.date)).forEach(l=>{
      rows.push({ id:l.id, badge:'', name:(l.type==='self' ? L('loanSelfPersonLabel') : l.person), note:l.note, date:l.date, acc:l.account, amount:l.amount, original:l.originalAmount, paid:l.paidAmount });
    });
  } else if(kind === 'collected' || kind === 'repaid'){
    const etype = kind === 'collected' ? 'income' : 'expense';
    entries.filter(en => !en.transfer && inRange(en.date) && (en.loanId || en.dueId) && en.type===etype).forEach(en=>{
      let name = '', badge = '';
      if(en.loanId){
        const l = loans.find(x => x.id === en.loanId);
        if(l){ name = (l.type==='self' ? L('loanSelfPersonLabel') : l.person); badge = l.type==='taken' ? L('loanTakenLabel') : l.type==='self' ? L('loanSelfLabel') : L('loanGivenLabel'); }
      } else {
        const d = dues.find(x => x.id === en.dueId);
        if(d){ name = d.person; badge = d.type==='receivable' ? L('dueReceivableLabel') : L('duePayableLabel'); }
      }
      if(!name) name = en.note || L('otherCategory');
      rows.push({ id:en.id, badge, name, note:'', date:en.date, acc:en.account, amount:en.amount });
    });
  }
  rows.sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id - a.id);
  return rows;
}
function renderDebtDetailBody(kind){
  const rows = getDebtDetailRows(kind);
  if(rows.length === 0) return '<div class="empty">'+L('noEntries')+'</div>';
  const positive = (kind==='dueReceivable' || kind==='receivable' || kind==='collected');
  const total = round2(rows.reduce((s,r)=> s + r.amount, 0));
  const totalHtml = '<div class="debt-detail-total"><span>'+L('debtDetailTotalLabel')+'</span><b style="color:var(--'+(positive?'ledger-green':'ledger-red')+');">'+moneyFmt(total)+'</b></div>';
  const listHtml = rows.map(r=>{
    const partial = (r.paid > 0)
      ? '<div class="debt-detail-sub">'+L('debtDetailOriginalLabel')+': '+moneyFmt(r.original)+' · '+L('paidSoFarLabel')+': '+moneyFmt(r.paid)+' · '+L('remainingDueLabel')+': '+moneyFmt(r.amount)+'</div>' : '';
    return '<div class="entry '+(positive?'income-bg':'expense-bg')+'"><div class="left"><span class="tag">'+
      (r.acc ? '<span class="accbadge">'+accLabel(r.acc)+'</span>' : '')+
      (r.badge ? '<span class="accbadge">'+escapeHtml(r.badge)+'</span>' : '')+
      '<b>'+escapeHtml(r.name)+'</b> · '+escapeHtml(r.date)+(r.note ? ' · '+escapeHtml(r.note) : '')+'</span>'+partial+
      '</div><div class="actions"><span class="amt '+(positive?'income':'expense')+'">'+moneyFmt(r.amount)+'</span></div></div>';
  }).join('');
  return totalHtml + listHtml;
}
/* ক্যাটাগরি (বিবরণ) ধরে বিস্তারিত: একই নামের এন্ট্রিগুলো "বিস্তারিত" অনুযায়ী ভাগ করে সাব-টোটালসহ দেখায়
   (যেমন চিকিৎসা: মায়ের চিকিৎসা ৳৩,০০০ · নিজের ৳২,০০০) */
const catDetailModalEl = document.getElementById('catDetailModal');
function openCategoryDetail(type, key){
  const list = (catDetailSource[type] && catDetailSource[type][key]) || [];
  document.getElementById('catDetailTitle').textContent = key;
  const body = document.getElementById('catDetailBody');
  if(!list.length){
    body.innerHTML = '<div class="empty">'+L('catDetailEmpty')+'</div>';
  } else {
    const groups = Object.create(null);
    const clean = (s)=> String(s || '').replace(/\s+/g, ' ').trim();
    list.forEach(en=>{
      const g = clean(en.detail).toLowerCase();      // বড়/ছোট হাত ও বাড়তি ফাঁকা ধরা হয় না: "মায়ের চিকিৎসা" একই গ্রুপে মেলে
      const grp = groups[g] || (groups[g] = { items: [], sum: 0, label: '', last: '' });
      grp.items.push(en); grp.sum = round2(grp.sum + en.amount);
      const ds = String(en.date || '');
      if(g && ds >= grp.last){ grp.last = ds; grp.label = clean(en.detail); }
    });
    const total = round2(list.reduce((s,e)=> s + e.amount, 0));
    const gkeys = Object.keys(groups).sort((a,b)=> groups[b].sum - groups[a].sum);
    body.innerHTML = '<div class="cd-total"><span>'+L('catDetailTotal')+'</span><b class="amt '+(type==='income'?'income':'expense')+'">'+moneyFmt(total)+'</b></div>' +
      gkeys.map(g=>{
        const grp = groups[g];
        const items = [...grp.items].sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id - a.id);
        return '<div class="cd-group"><div class="cd-head"><span class="cd-name">'+(g ? escapeHtml(grp.label) : '<i>'+L('catDetailNoDetail')+'</i>')+'</span>' +
          '<span class="cd-sum">'+moneyFmt(grp.sum)+' · '+tfmt('catDetailCount', { n: numFmt(items.length) })+'</span></div>' +
          items.map(en=> '<div class="cd-row" onclick="closeCatDetail(); openEntryDetail('+Number(en.id)+')" role="button" tabindex="0"><span>'+escapeHtml(en.date)+' · '+accLabel(en.account)+'</span><span class="amt '+en.type+'">'+moneyFmt(en.amount)+'</span></div>').join('') +
        '</div>';
      }).join('');
  }
  catDetailModalEl.classList.add('open');
  lockBodyScroll();
}
function closeCatDetail(){ if(!catDetailModalEl.classList.contains('open')) return; catDetailModalEl.classList.remove('open'); unlockBodyScroll(); }
document.getElementById('catDetailCloseBtn').addEventListener('click', closeCatDetail);
catDetailModalEl.addEventListener('click', (e)=>{ if(e.target === catDetailModalEl) closeCatDetail(); });
['catBreakdown','incomeBreakdown','incomePieLegend','expensePieLegend'].forEach(id=>{
  const el = document.getElementById(id);
  if(!el) return;
  const act = (e)=>{ const row = e.target.closest && e.target.closest('.cd-click'); if(row) openCategoryDetail(row.dataset.type, row.dataset.key); };
  el.addEventListener('click', act);
  el.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); act(e); } });
});
function openDebtDetail(kind){
  document.getElementById('debtDetailTitle').textContent = L(DEBT_DETAIL_TITLE_KEYS[kind] || '');
  document.getElementById('debtDetailBody').innerHTML = renderDebtDetailBody(kind);
  debtDetailModalEl.dataset.kind = kind;
  debtDetailModalEl.classList.add('open');
  lockBodyScroll();
}
function closeDebtDetail(){ debtDetailModalEl.classList.remove('open'); unlockBodyScroll(); }
document.getElementById('debtDetailCloseBtn').addEventListener('click', closeDebtDetail);
debtDetailModalEl.addEventListener('click', (e)=>{ if(e.target === debtDetailModalEl) closeDebtDetail(); });

/* এন্ট্রির ঐচ্ছিক "বিস্তারিত" (যেমন "মায়ের চিকিৎসা") — বিবরণের ঠিক নিচের লাইনে ছোট হরফে */
function entryDetailSpan(en){ return en && en.detail ? '<span class="en-detail">' + escapeHtml(en.detail) + '</span>' : ''; }
let catDetailSource = { expense: Object.create(null), income: Object.create(null) };
function refreshNoteSuggestions(){
  const counts = Object.create(null);
  entries.forEach(en=>{
    const n = (en.note||'').trim();
    if(n) counts[n] = (counts[n]||0) + 1;
  });
  const sorted = Object.keys(counts).sort((a,b)=> counts[b]-counts[a]);
  const dl = document.getElementById('noteSuggestions');
  if(dl) dl.innerHTML = sorted.map(n=>'<option value="'+escapeHtml(n)+'"></option>').join('');
}
function closeSiblingCollapsibles(headerEl){
  const wrapper = headerEl.closest('.settings-section, .settings-subsection, .card');
  const group = wrapper && wrapper.parentElement;
  if(!group) return;
  Array.prototype.forEach.call(group.children, function(sib){
    if(sib === wrapper) return;
    Array.prototype.forEach.call(sib.children, function(child){
      if(child.classList.contains('collapsible') && child.classList.contains('open')){
        child.classList.remove('open');
        child.setAttribute('aria-expanded', 'false');
      }
      if(child.classList.contains('collapse-body') && child.classList.contains('open')){
        child.classList.remove('open');
      }
    });
  });
}
function toggleCollapse(headerEl, targetId){
  const target = document.getElementById(targetId);
  if(!target) return;
  const opening = !target.classList.contains('open');
  if(opening) closeSiblingCollapsibles(headerEl);
  target.classList.toggle('open');
  headerEl.classList.toggle('open');
  headerEl.setAttribute('aria-expanded', headerEl.classList.contains('open') ? 'true' : 'false');
}