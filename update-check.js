/* ============================================================
   আপডেট চেক — GitHub-এ নতুন Release এলে অ্যাপে পপআপ দেখায়।
   পপআপে "ডাউনলোড" চাপলে নতুন APK ডাউনলোডের পেজ/ফাইল খোলে।
   শুধু APK (Capacitor) এ চলে। রিপো পাবলিক হতে হবে।
   ============================================================ */
let updateShownBuild = 0;      // এই সেশনে যে বিল্ডের পপআপ দেখানো/বন্ধ হয়েছে
let updateLastCheck = 0;
let updateInfo = null;

function updIsNative(){ try{ return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }catch(e){ return false; } }

function updEnsureModal(){
  let m = document.getElementById('updateModal');
  if(m) return m;
  m = document.createElement('div');
  m.className = 'modal-overlay';
  m.id = 'updateModal';
  m.innerHTML =
    '<div class="modal-card">' +
      '<div class="modal-header"><h3 id="updateTitle"></h3><button class="modal-close" id="updateCloseBtn" aria-label="' + L('a11yClose') + '">×</button></div>' +
      '<div class="settings-desc" id="updateMsg" style="margin-top:4px;"></div>' +
      '<div class="settings-desc" id="updateNotes" style="margin-top:8px; white-space:pre-wrap;"></div>' +
      '<div class="modal-actions">' +
        '<button class="btn outline" id="updateLaterBtn"></button>' +
        '<button class="btn gold" id="updateDownloadBtn"></button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  const close = ()=>{ m.classList.remove('open'); };
  m.querySelector('#updateCloseBtn').addEventListener('click', close);
  m.querySelector('#updateLaterBtn').addEventListener('click', close);
  m.querySelector('#updateDownloadBtn').addEventListener('click', async ()=>{
    if(!updateInfo) return;
    close();
    // শুধু GitHub-এর https লিঙ্ক খোলা হবে (API-র উত্তরে অন্য কিছু এলেও নয়)
    if(!/^https:\/\/github\.com\//.test(String(updateInfo.url || ''))) return;
    try{
      const B = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Browser;
      if(B && B.open) await B.open({ url: updateInfo.url });
      else window.open(updateInfo.url, '_system');
    }catch(e){ try{ window.open(updateInfo.url, '_blank'); }catch(e2){} }
  });
  return m;
}

function updShow(info){
  const m = updEnsureModal();
  m.querySelector('#updateTitle').textContent = L('updateTitle');
  m.querySelector('#updateMsg').textContent = L('updateMsg');
  const notes = (info.notes || '').trim().slice(0, 300);
  const nEl = m.querySelector('#updateNotes');
  nEl.textContent = notes;
  nEl.style.display = notes ? '' : 'none';
  m.querySelector('#updateLaterBtn').textContent = L('updateLaterBtn');
  m.querySelector('#updateDownloadBtn').textContent = L('updateDownloadBtn');
  updateInfo = info;
  m.classList.add('open');
}

async function checkForAppUpdate(force){
  if(!updIsNative()) return;
  const cur = window.APP_BUILD || {};
  if(!cur.repo || !cur.build) return;
  const now = Date.now();
  if(!force && now - updateLastCheck < 3600000) return;   // ১ ঘণ্টায় একবারের বেশি নয়
  updateLastCheck = now;
  try{
    const res = await fetch('https://api.github.com/repos/' + cur.repo + '/releases/latest', { headers: { 'Accept': 'application/vnd.github+json' } });
    if(!res.ok) return;
    const rel = await res.json();
    const m = /build-(\d+)/.exec(rel && rel.tag_name || '');
    if(!m) return;
    const latest = Number(m[1]);
    if(!(latest > cur.build) || latest <= updateShownBuild) return;
    const apk = (rel.assets || []).find(a => a && /\.apk$/i.test(a.name || ''));
    updateShownBuild = latest;
    updShow({ build: latest, url: apk ? apk.browser_download_url : rel.html_url, notes: rel.body || '' });
  }catch(e){ /* অফলাইন/ব্যর্থ হলে চুপচাপ বাদ */ }
}

(function initUpdateCheck(){
  if(!updIsNative()) return;
  setTimeout(()=>{ checkForAppUpdate(true); }, 4000);
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible') checkForAppUpdate(false);
  });
})();
