/* ============================================================
   App Lock — v2 (PIN + Neumorphic lock screen)
   ------------------------------------------------------------
   - ৪–৮ ডিজিট PIN, PBKDF2-SHA256 (150k iter) hash+salt
   - পুরনো password-ভিত্তিক লক থাকলে: first unlock-এ পুরনো PW
     দিয়ে ঢুকে নতুন PIN সেট করতে হবে (one-time migration)
   - WebAuthn biometric: prompt auto আসে না, keypad-এর আইকনে
     ট্যাপ করলে OS prompt; mismatch/cancel-এ ডটের নিচে ছোট হিন্ট
   - ভুল PIN: ৫ বার → ৩০s cooldown
   - "USE PASSWORD" → security question → নতুন PIN
   ============================================================ */

/* ---------- Storage keys ---------- */
const LK_ENABLED     = 'hisab_lock_enabled';
const LK_PIN_HASH    = 'hisab_lock_pin_hash';
const LK_PIN_SALT    = 'hisab_lock_pin_salt';
const LK_PIN_LEN     = 'hisab_lock_pin_len';
const LK_PW_HASH     = 'hisab_lock_pw_hash';      /* legacy */
const LK_PW_SALT     = 'hisab_lock_pw_salt';      /* legacy */
const LK_SQ          = 'hisab_lock_sq';
const LK_SQ_HASH     = 'hisab_lock_sq_hash';
const LK_SQ_SALT     = 'hisab_lock_sq_salt';
const LK_WEBAUTHN    = 'hisab_lock_webauthn_id';
const LK_ACTIVITY    = 'hisab_lock_last_activity';
const LK_ATTEMPTS    = 'hisab_lock_attempts';
const LK_COOLDOWN    = 'hisab_lock_cooldown_until';
const LK_F_ATTEMPTS  = 'hisab_lock_forgot_attempts';
const LK_F_COOLDOWN  = 'hisab_lock_forgot_cooldown_until';
const IDLE_LIMIT_MS  = 60 * 60 * 1000;   /* ১ ঘণ্টা */
const PIN_MIN_LEN    = 4;
const PIN_MAX_LEN    = 8;
const LK_LEVEL       = 'hisab_lock_cooldown_level';   /* বারবার ভুলে অপেক্ষা ক্রমশ বাড়ে */
const LK_BG_GRACE_MS = 30 * 1000;                    /* অ্যাপ থেকে বেরিয়ে এতক্ষণের বেশি থাকলে আবার লক */
function lkVersionText(){
  const b = window.APP_BUILD && window.APP_BUILD.build;
  return b ? ('Build ' + b) : '';
}

/* ---------- hashing / base64 ---------- */
function lkBufToB64(buf){
  let binary = '';
  const bytes = new Uint8Array(buf);
  for(let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function lkB64ToBuf(b64){
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
function lkCryptoAvailable(){ return !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues); }
async function lkDeriveBits(secret, saltBytes){
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name:'PBKDF2', salt:saltBytes, iterations:150000, hash:'SHA-256' }, baseKey, 256);
}
async function lkHashSecret(secret){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await lkDeriveBits(secret, salt);
  return { hash: lkBufToB64(bits), salt: lkBufToB64(salt) };
}
async function lkVerifySecret(secret, hashB64, saltB64){
  try{
    const salt = new Uint8Array(lkB64ToBuf(saltB64));
    const bits = await lkDeriveBits(secret, salt);
    return lkBufToB64(bits) === hashB64;
  }catch(e){ return false; }
}
function lkNormalizeAnswer(s){ return (s || '').trim().toLowerCase(); }

/* ---------- snapshot/restore (atomic-ish write) ---------- */
function lkSnapshotKeys(keys){
  const snap = {};
  keys.forEach(k=>{ try{ snap[k] = localStorage.getItem(k); }catch(e){ snap[k] = null; } });
  return snap;
}
function lkRestoreKeys(snap){
  Object.keys(snap).forEach(k=>{
    try{
      if(snap[k] === null) localStorage.removeItem(k);
      else localStorage.setItem(k, snap[k]);
    }catch(e){}
  });
}
function lkSafeSet(key, val){
  if(typeof safeSet === 'function') return safeSet(key, val);
  try{ localStorage.setItem(key, val); return true; }catch(e){ return false; }
}
function lkSafeDel(key){ try{ localStorage.removeItem(key); }catch(e){} }

/* ---------- state queries ---------- */
function isLockEnabled(){ try{ return localStorage.getItem(LK_ENABLED) === '1'; }catch(e){ return false; } }
function hasPinSet(){
  try{ return !!localStorage.getItem(LK_PIN_HASH) && !!localStorage.getItem(LK_PIN_SALT); }catch(e){ return false; }
}
function hasOldPassword(){
  try{ return !!localStorage.getItem(LK_PW_HASH) && !!localStorage.getItem(LK_PW_SALT); }catch(e){ return false; }
}
function getPinLength(){
  try{
    const n = Number(localStorage.getItem(LK_PIN_LEN));
    return (n >= PIN_MIN_LEN && n <= PIN_MAX_LEN) ? n : 6;
  }catch(e){ return 6; }
}
function fingerprintEnabled(){ try{ return !!localStorage.getItem(LK_WEBAUTHN); }catch(e){ return false; } }
async function checkFingerprintAvailable(){
  try{
    if(!lkCryptoAvailable()) return false;
    if(!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable)) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  }catch(e){ return false; }
}

/* ---------- WebAuthn ---------- */
async function registerFingerprint(){
  if(!lkCryptoAvailable()) throw new Error('crypto unavailable');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Arcus' },
      user: { id: userId, name: 'hisab-khata-user', displayName: 'Arcus' },
      pubKeyCredParams: [{ type:'public-key', alg:-7 }, { type:'public-key', alg:-257 }],
      authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required' },
      timeout: 60000
    }
  });
  if(!cred) throw new Error('no credential');
  const idB64 = lkBufToB64(cred.rawId);
  if(!lkSafeSet(LK_WEBAUTHN, idB64)) throw new Error('storage write failed');
}
async function unlockWithFingerprint(){
  const credIdB64 = localStorage.getItem(LK_WEBAUTHN);
  if(!credIdB64) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type:'public-key', id: lkB64ToBuf(credIdB64) }],
      userVerification: 'required',
      timeout: 60000
    }
  });
  return !!assertion;
}

/* ============================================================
   DOM refs
   ============================================================ */
const lockScreenEl  = document.getElementById('appLockScreen');
const lockMainShell = document.getElementById('lockMain');
const lockAltShell  = document.getElementById('lockAltShell');
const lockHeadingEl = document.getElementById('lockHeading');
const lockDotsEl    = document.getElementById('lockDots');
const lockHintEl    = document.getElementById('lockHint');
const lockKeypadEl  = document.getElementById('lockKeypad');
const lockForgotRow = document.getElementById('lockForgotRow');
const lockAltBtn    = document.getElementById('lockAltBtn');
const lockEyebrowEl = document.getElementById('lockEyebrow');
const lockVersionEl = document.getElementById('lockVersion');
const lockCancelBtn = document.getElementById('lockCancelBtn');

/* ---------- Lock screen state ---------- */
let lockMode = 'unlock';
let lockOnSuccess = null;
let pinBuf = '';
let firstPin = null;
let lockAttemptCount = 0, lockCooldownUntil = 0;
try{ lockAttemptCount = Number(localStorage.getItem(LK_ATTEMPTS)) || 0; }catch(e){}
try{ lockCooldownUntil = Number(localStorage.getItem(LK_COOLDOWN)) || 0; }catch(e){}
let lkFpBusy = false;
let lastActivityTime = Date.now();
let _verifyTimer = null;
let _cooldownTick = null;

/* ---------- helpers ---------- */
function lockActive(){ return lockScreenEl && lockScreenEl.classList.contains('show'); }
function cooldownActive(){ return Date.now() < lockCooldownUntil; }
function clearHint(){ if(lockHintEl){ lockHintEl.textContent = ''; lockHintEl.classList.remove('warn'); } }
function setHint(txt, warn){
  if(!lockHintEl) return;
  lockHintEl.textContent = txt || '';
  lockHintEl.classList.toggle('warn', !!warn);
}
function setHeading(txt){ if(lockHeadingEl) lockHeadingEl.textContent = txt || ''; }

function buildDots(n){
  if(!lockDotsEl) return;
  lockDotsEl.innerHTML = '';
  for(let i=0;i<n;i++){
    const d = document.createElement('span');
    d.className = 'pin-dot';
    lockDotsEl.appendChild(d);
  }
}
function updateDots(){
  if(!lockDotsEl) return;
  const dots = lockDotsEl.children;
  for(let i=0;i<dots.length;i++) dots[i].classList.toggle('filled', i < pinBuf.length);
}
function shakeDots(){
  if(!lockDotsEl) return;
  lockDotsEl.classList.remove('shake'); void lockDotsEl.offsetWidth;
  lockDotsEl.classList.add('shake');
  setTimeout(()=> lockDotsEl.classList.remove('shake'), 460);
}
function flashDotsError(){
  if(!lockDotsEl) return;
  lockDotsEl.classList.add('error');
  setTimeout(()=> lockDotsEl.classList.remove('error'), 900);
}

/* ---------- keypad icons ---------- */
const LK_IC_FP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></svg>';
const LK_IC_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17.5 19 7.5"/></svg>';
const LK_IC_BK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><path d="M18 9l-6 6"/><path d="M12 9l6 6"/></svg>';

function buildKeypad(){
  if(!lockKeypadEl) return;
  const keys = ['1','2','3','4','5','6','7','8','9','special','0','back'];
  lockKeypadEl.innerHTML = keys.map(k=>{
    if(k === 'back')    return '<button type="button" class="pin-key pin-back" data-k="back" aria-label="'+L('a11yBackspace')+'">'+LK_IC_BK+'</button>';
    if(k === 'special') return '<button type="button" class="pin-key pin-special" data-k="" aria-label=""></button>';
    return '<button type="button" class="pin-key" data-k="'+k+'" aria-label="'+k+'">'+k+'</button>';
  }).join('');
}

function setSpecialKey(){
  const el = lockKeypadEl && lockKeypadEl.querySelector('.pin-special');
  if(!el) return;
  let html = '', k = '';
  if(lockMode === 'setup' && pinBuf.length >= PIN_MIN_LEN && pinBuf.length <= PIN_MAX_LEN){
    html = LK_IC_OK; k = 'check';
  } else if((lockMode === 'unlock' || lockMode === 'verify') && fingerprintEnabled() && !cooldownActive()){
    html = LK_IC_FP; k = 'finger';
  }
  el.innerHTML = html;
  el.dataset.k = k;
  el.setAttribute('aria-label', k === 'check' ? L('a11yConfirm') : k === 'finger' ? L('a11yFingerprint') : '');
  el.classList.toggle('hidden', !k);
}

function applyCooldownUI(){
  const on = cooldownActive();
  if(!lockKeypadEl) return;
  lockKeypadEl.querySelectorAll('.pin-key').forEach(b=>{ b.disabled = on; });
  clearInterval(_cooldownTick);
  if(on){
    const tick = ()=>{
      if(!lockActive() || !cooldownActive()){
        clearInterval(_cooldownTick); _cooldownTick = null;
        if(!cooldownActive()) applyCooldownUI();   // অপেক্ষা শেষ → কী চালু করো; লক স্ক্রিন বন্ধ কিন্তু অপেক্ষা চালু থাকলে আর নিজেকে ডেকো না (অসীম রিকার্সন)
        return;
      }
      const s = Math.ceil((lockCooldownUntil - Date.now()) / 1000);
      setHint(tfmt('lockScreenTooManyTries', { s }), true);
    };
    tick();
    _cooldownTick = setInterval(tick, 1000);
  } else {
    clearHint();
    setSpecialKey();
  }
}

/* ---------- alt screen ---------- */
function showAlt(html){
  if(lockMainShell) lockMainShell.hidden = true;
  if(lockAltShell){
    lockAltShell.hidden = false;
    lockAltShell.innerHTML = html;
  }
}
function hideAlt(){
  if(lockAltShell){ lockAltShell.hidden = true; lockAltShell.innerHTML = ''; }
  if(lockMainShell) lockMainShell.hidden = false;
}

function ensureLockScreenMode(){
  if(!hasPinSet() && hasOldPassword()) return 'migrate';
  if(!hasPinSet() && !hasOldPassword()) return 'setup';
  return 'unlock';
}

/* ---------- open lock screen ---------- */
function showLockScreen(opts){
  opts = opts || {};
  lockMode = opts.mode || ensureLockScreenMode();
  lockOnSuccess = opts.onSuccess || null;
  pinBuf = ''; firstPin = null;
  if(lockCancelBtn) lockCancelBtn.hidden = !opts.cancellable;

  lockScreenEl.classList.add('show');
  document.body.classList.add('lock-active');
  hideAlt();
  if(lockVersionEl) lockVersionEl.textContent = lkVersionText();

  if(lockMode === 'migrate'){
    lockMainShell.hidden = true;
    lockAltShell.hidden = false;
    lockAltShell.innerHTML = migrationHtml();
    wireMigration();
    setTimeout(()=>{ const i = document.getElementById('lockPwInput'); if(i) i.focus(); }, 60);
    return;
  }

  if(lockMode === 'forgot'){
    openSecurityQuestionFlow();
    return;
  }

  if(lockMode === 'setup'){
    setHeading(L('lockSetPinDesc'));
    lockForgotRow.classList.add('hidden');
    buildDots(PIN_MAX_LEN);
  } else {
    setHeading(L('lockEnterPin'));
    if(lockMode === 'verify') lockForgotRow.classList.add('hidden');
    else lockForgotRow.classList.remove('hidden');
    buildDots(getPinLength());
  }
  if(lockEyebrowEl) lockEyebrowEl.textContent = L('lockLoginLabel');

  updateDots(); setSpecialKey(); clearHint();
  applyCooldownUI();
}

/* ---------- close lock screen ---------- */
function hideLockScreen(){
  if(lockCancelBtn) lockCancelBtn.hidden = true;
  lockScreenEl.classList.remove('show');
  document.body.classList.remove('lock-active');
  hideAlt();
  lockMode = 'unlock';
  lockOnSuccess = null;
  pinBuf = ''; firstPin = null;
  clearHint();
  clearInterval(_cooldownTick); _cooldownTick = null;
  recordActivity();
}

/* ============================================================
   PIN entry
   ============================================================ */
function pressKey(k){
  if(!k) return;
  if(cooldownActive() && k !== 'back') return;

  if(k === 'back'){
    if(pinBuf.length){ pinBuf = pinBuf.slice(0, -1); updateDots(); setSpecialKey(); clearHint(); }
    return;
  }
  if(k === 'finger'){ runFingerprintUnlock(); return; }
  if(k === 'check'){
    if(lockMode === 'setup' && pinBuf.length >= PIN_MIN_LEN && pinBuf.length <= PIN_MAX_LEN){
      firstPin = pinBuf;
      pinBuf = '';
      lockMode = 'setup-confirm';
      setHeading(L('lockConfirmPinDesc'));
      buildDots(firstPin.length);
      updateDots(); setSpecialKey(); clearHint();
    }
    return;
  }

  const expected = (lockMode === 'setup') ? PIN_MAX_LEN
                 : (lockMode === 'setup-confirm') ? firstPin.length
                 : getPinLength();
  if(pinBuf.length >= expected) return;
  pinBuf += k;
  updateDots(); setSpecialKey(); clearHint();

  if(lockMode === 'setup-confirm' && pinBuf.length === firstPin.length){
    clearTimeout(_verifyTimer);
    _verifyTimer = setTimeout(handleConfirmPin, 160);
  } else if((lockMode === 'unlock' || lockMode === 'verify') && pinBuf.length === getPinLength()){
    clearTimeout(_verifyTimer);
    _verifyTimer = setTimeout(handleUnlockPin, 160);
  }
}

async function handleUnlockPin(){
  const pin = pinBuf; pinBuf = '';
  updateDots(); setSpecialKey();
  const hash = localStorage.getItem(LK_PIN_HASH);
  const salt = localStorage.getItem(LK_PIN_SALT);
  if(!hash || !salt){ hideLockScreen(); return; }

  const ok = await lkVerifySecret(pin, hash, salt);
  if(ok){
    lockAttemptCount = 0;
    try{ localStorage.removeItem(LK_ATTEMPTS); localStorage.removeItem(LK_COOLDOWN); localStorage.removeItem(LK_LEVEL); }catch(e){}
    lockCooldownUntil = 0;
    const cb = lockOnSuccess;
    hideLockScreen();
    if(cb) cb(); else nudgeNoSecurityQ();
  } else {
    lockAttemptCount++;
    if(lockAttemptCount >= 5){
      /* প্রতিবার ৫টা ভুলে অপেক্ষা দ্বিগুণ: ৩০সে → ১মি → ২মি → … সর্বোচ্চ ১ ঘণ্টা */
      let lvl = 0; try{ lvl = Number(localStorage.getItem(LK_LEVEL)) || 0; }catch(e){}
      const wait = Math.min(30000 * Math.pow(2, lvl), 3600000);
      try{ localStorage.setItem(LK_LEVEL, String(Math.min(lvl + 1, 7))); }catch(e){}
      lockCooldownUntil = Date.now() + wait;
      lockAttemptCount = 0;
      try{ localStorage.setItem(LK_COOLDOWN, String(lockCooldownUntil)); localStorage.removeItem(LK_ATTEMPTS); }catch(e){}
      flashDotsError(); shakeDots();
      applyCooldownUI();
    } else {
      try{ localStorage.setItem(LK_ATTEMPTS, String(lockAttemptCount)); }catch(e){}
      flashDotsError(); shakeDots();
      setHint(L('lockErrPinWrong'), true);
      setTimeout(clearHint, 1500);
    }
  }
}

async function handleConfirmPin(){
  const pin = pinBuf;
  if(pin !== firstPin){
    pinBuf = '';
    updateDots();
    flashDotsError(); shakeDots();
    setHint(L('lockErrPinMismatch'), true);
    setTimeout(()=>{
      firstPin = null;
      lockMode = 'setup';
      setHeading(L('lockSetPinDesc'));
      buildDots(PIN_MAX_LEN);
      updateDots(); setSpecialKey(); clearHint();
    }, 1000);
    return;
  }

  const len = pin.length;
  const { hash, salt } = await lkHashSecret(pin);
  const snap = lkSnapshotKeys([LK_PIN_HASH, LK_PIN_SALT, LK_PIN_LEN, LK_ENABLED]);
  const ok1 = lkSafeSet(LK_PIN_HASH, hash);
  const ok2 = ok1 && lkSafeSet(LK_PIN_SALT, salt);
  const ok3 = ok2 && lkSafeSet(LK_PIN_LEN, String(len));
  const ok4 = ok3 && lkSafeSet(LK_ENABLED, '1');
  if(!ok1 || !ok2 || !ok3 || !ok4){
    lkRestoreKeys(snap);
    // ইনপুট খালি করা হয় (আগে ভরা থেকে যেত, ডিজিট চাপলে কিছুই হতো না); নিশ্চিতকরণ-মোডে থাকে, তাই একই PIN আবার দিলেই পুনরায় চেষ্টা হয়
    pinBuf = ''; updateDots(); setSpecialKey();
    setHint(L('storageSaveFailMsg'), true);
    return;
  }
  /* migration cleanup */
  if(hasOldPassword()){ lkSafeDel(LK_PW_HASH); lkSafeDel(LK_PW_SALT); }

  pinBuf = ''; firstPin = null; updateDots();
  const cb = lockOnSuccess;
  hideLockScreen();
  if(cb) cb();
  else {
    if(typeof toast === 'function') toast(L('lockPinSetDone'));
    updateSettingsPrivacyUI();
  }
}

/* ---------- biometric ---------- */
async function runFingerprintUnlock(){
  if(lkFpBusy || !fingerprintEnabled() || !lockActive()) return;
  if(cooldownActive()) return;
  lkFpBusy = true;
  clearHint();
  try{
    const ok = await unlockWithFingerprint();
    if(ok){
      lockAttemptCount = 0;
      try{ localStorage.removeItem(LK_ATTEMPTS); localStorage.removeItem(LK_COOLDOWN); localStorage.removeItem(LK_LEVEL); }catch(e){}
      lockCooldownUntil = 0;
      const cb = lockOnSuccess;
      hideLockScreen();
      if(cb) cb(); else nudgeNoSecurityQ();
    } else {
      setHint(L('lockErrFingerprint'), true);
      setTimeout(clearHint, 2200);
    }
  }catch(err){
    setHint(L('lockErrFingerprint'), true);
    setTimeout(clearHint, 2200);
  } finally {
    lkFpBusy = false;
  }
}

/* ============================================================
   Migration (old password → new PIN)
   ============================================================ */
function migrationHtml(){
  return '<div class="lock-shell-inner">'+
    '<div class="lock-top">'+
      '<div class="lock-eyebrow">'+L('lockLoginLabel')+'</div>'+
      '<div class="lock-heading">'+L('lockMigrateTitle')+'</div>'+
    '</div>'+
    '<div class="lock-body">'+
      '<div class="lock-pw-form">'+
        '<div class="lock-sq">'+L('lockMigrateDesc')+'</div>'+
        '<input type="password" id="lockPwInput" autocomplete="off" placeholder="'+L('lockPasswordDesc')+'">'+
        '<div class="lock-hint alt" id="lockPwHint"></div>'+
        '<button type="button" class="lock-btn" id="lockPwBtn">'+L('lockVerifyContinueBtn')+'</button>'+
      '</div>'+
      (lkVersionText() ? '<div class="lock-version">'+lkVersionText()+'</div>' : '')+
    '</div></div>';
}
function wireMigration(){
  const inp = document.getElementById('lockPwInput');
  const btn = document.getElementById('lockPwBtn');
  const hint = document.getElementById('lockPwHint');
  const submit = async ()=>{
    const pw = inp ? inp.value : '';
    if(!pw) return;
    const hash = localStorage.getItem(LK_PW_HASH);
    const salt = localStorage.getItem(LK_PW_SALT);
    const ok = hash && salt && await lkVerifySecret(pw, hash, salt);
    if(ok){
      /* সোজা setup মোডে */
      lockOnSuccess = null;
      lockMode = 'setup';
      hideAlt();
      setHeading(L('lockSetPinDesc'));
      lockForgotRow.classList.add('hidden');
      buildDots(PIN_MAX_LEN);
      updateDots(); setSpecialKey(); clearHint();
      if(lockEyebrowEl) lockEyebrowEl.textContent = L('lockLoginLabel');
    } else {
      if(hint){ hint.textContent = L('lockErrPasswordWrong'); hint.classList.add('warn'); }
    }
  };
  if(btn) btn.addEventListener('click', submit);
  if(inp) inp.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); submit(); } });
}

/* ============================================================
   Forgot PIN → security question
   ============================================================ */
function openSecurityQuestionFlow(){
  const sqRaw = localStorage.getItem(LK_SQ);
  let sq = null;
  try{ sq = sqRaw ? JSON.parse(sqRaw) : null; }catch(e){ sq = null; }
  const qText = sq ? (sq.type === 'preset' ? L(sq.key) : sq.text) : null;
  if(!sq){
    showAlt('<div class="lock-shell-inner"><div class="lock-top"><div class="lock-eyebrow">'+L('lockLoginLabel')+'</div>'+
      '<div class="lock-heading">'+L('lockSqTitle')+'</div></div>'+
      '<div class="lock-body"><div class="lock-pw-form">'+
      '<div class="lock-sq">'+L('forgotPwNoQSetMsg')+'</div>'+
      '<button type="button" class="lock-btn ghost" id="lockSqBack">'+L('forgotPwCancelBtn')+'</button>'+
      '</div></div></div>');
    document.getElementById('lockSqBack').addEventListener('click', ()=>{
      hideAlt();
      showLockScreen({ mode: 'unlock' });
    });
    return;
  }
  showAlt('<div class="lock-shell-inner"><div class="lock-top">'+
    '<div class="lock-eyebrow">'+L('lockLoginLabel')+'</div>'+
    '<div class="lock-heading">'+L('forgotPwTitle')+'</div></div>'+
    '<div class="lock-body"><div class="lock-pw-form">'+
    '<div class="lock-sq">'+escapeHtmlLite(qText)+'</div>'+
    '<input type="text" id="lockSqInput" autocomplete="off" placeholder="'+L('forgotPwAnswerPh')+'">'+
    '<div class="lock-hint alt" id="lockSqHint"></div>'+
    '<button type="button" class="lock-btn" id="lockSqBtn">'+L('forgotPwSubmitBtn')+'</button>'+
    '<button type="button" class="lock-btn ghost" id="lockSqBack">'+L('forgotPwCancelBtn')+'</button>'+
    '</div></div></div>');
  const inp = document.getElementById('lockSqInput');
  const btn = document.getElementById('lockSqBtn');
  const back = document.getElementById('lockSqBack');
  const hint = document.getElementById('lockSqHint');
  setTimeout(()=>{ if(inp) inp.focus(); }, 60);
  const submit = async ()=>{
    const ans = lkNormalizeAnswer(inp ? inp.value : '');
    if(!ans) return;
    /* ভুল উত্তরে সীমা: ৫টা ভুলে ৫ মিনিট অপেক্ষা (রিলোড করলেও থাকে) */
    const fUntil = Number(localStorage.getItem(LK_F_COOLDOWN)) || 0;
    if(Date.now() < fUntil){
      if(hint){ hint.textContent = tfmt('lockScreenTooManyTries', { s: Math.ceil((fUntil - Date.now()) / 1000) }); hint.classList.add('warn'); }
      return;
    }
    const hash = localStorage.getItem(LK_SQ_HASH);
    const salt = localStorage.getItem(LK_SQ_SALT);
    const ok = hash && salt && await lkVerifySecret(ans, hash, salt);
    if(ok){
      lkSafeDel(LK_F_ATTEMPTS); lkSafeDel(LK_F_COOLDOWN);
      hideAlt();
      lockMode = 'setup';
      setHeading(L('lockSetPinDesc'));
      lockForgotRow.classList.add('hidden');
      buildDots(PIN_MAX_LEN);
      updateDots(); setSpecialKey(); clearHint();
    } else {
      let n = (Number(localStorage.getItem(LK_F_ATTEMPTS)) || 0) + 1;
      if(n >= 5){
        n = 0;
        try{ localStorage.setItem(LK_F_COOLDOWN, String(Date.now() + 5 * 60 * 1000)); }catch(e){}
      }
      try{ localStorage.setItem(LK_F_ATTEMPTS, String(n)); }catch(e){}
      if(hint){ hint.textContent = L('forgotPwWrongErr'); hint.classList.add('warn'); }
    }
  };
  if(btn) btn.addEventListener('click', submit);
  if(inp) inp.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); submit(); } });
  if(back) back.addEventListener('click', ()=>{ hideAlt(); showLockScreen({ mode: 'unlock' }); });
}
function escapeHtmlLite(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ============================================================
   Idle lock
   ============================================================ */
function recordActivity(){
  lastActivityTime = Date.now();
  try{ localStorage.setItem(LK_ACTIVITY, String(lastActivityTime)); }catch(e){}
}
function throttledRecordActivity(){
  if(!throttledRecordActivity.t){
    throttledRecordActivity.t = setTimeout(()=>{ throttledRecordActivity.t = null; recordActivity(); }, 5000);
  }
}
function checkIdleLock(){
  if(!isLockEnabled() || lockActive()) return;
  let last = lastActivityTime;
  try{
    const stored = Number(localStorage.getItem(LK_ACTIVITY));
    if(stored && stored > last) last = stored;
  }catch(e){}
  if(Date.now() - last > IDLE_LIMIT_MS) showLockScreen();
}
function initIdleWatch(){
  ['touchstart','mousedown','keydown','scroll'].forEach(evt=>{
    document.addEventListener(evt, throttledRecordActivity, { passive:true });
  });
  setInterval(checkIdleLock, 20000);
  let lkHiddenAt = 0;
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'hidden'){ lkHiddenAt = Date.now(); return; }
    /* অ্যাপ থেকে বেরিয়ে ৩০ সেকেন্ডের বেশি পরে ফিরলে আবার লক (ফাইল পিকার/ডাউনলোডের ছোট বিরতিতে নয়) */
    if(lkHiddenAt && isLockEnabled() && !lockActive() && Date.now() - lkHiddenAt > LK_BG_GRACE_MS) showLockScreen();
    lkHiddenAt = 0;
    checkIdleLock();
  });
  window.addEventListener('focus', checkIdleLock);
}

/* ============================================================
   Settings: Privacy & Safety UI
   ============================================================ */
async function updateSettingsPrivacyUI(){
  const enabled = isLockEnabled();
  const offEl = document.getElementById('lockOffState');
  const onEl  = document.getElementById('lockOnState');
  if(offEl) offEl.style.display = enabled ? 'none' : 'block';
  if(onEl)  onEl.style.display  = enabled ? 'block' : 'none';
  if(!enabled) return;
  const fpRow = document.getElementById('fingerprintRow');
  const available = await checkFingerprintAvailable();
  if(fpRow) fpRow.style.display = available ? 'flex' : 'none';
  const fpTgl = document.getElementById('fingerprintToggle');
  if(available && fpTgl) fpTgl.checked = fingerprintEnabled();
}
const gearBtnEl = document.getElementById('gearBtn');
if(gearBtnEl) gearBtnEl.addEventListener('click', updateSettingsPrivacyUI);

document.getElementById('fingerprintToggle').addEventListener('change', async (e)=>{
  const checked = e.target.checked;
  if(checked){
    try{ await registerFingerprint(); toast(L('fingerprintEnabledToast')); }
    catch(err){ e.target.checked = false; toast(L('fingerprintEnableFailToast')); }
  } else {
    lkSafeDel(LK_WEBAUTHN);
    toast(L('fingerprintDisabledToast'));
  }
});

/* ---------- Enable / Change / Disable ---------- */
document.getElementById('enableLockBtn').addEventListener('click', ()=>{
  if(!lkCryptoAvailable()){ toast(L('storageSaveFailMsg')); return; }
  showLockScreen({ mode: 'setup', cancellable: true, onSuccess: ()=>{
    toast(L('lockPinSetDone'));
    updateSettingsPrivacyUI();
    openSecurityQModal('setup');
  }});
});
document.getElementById('changeLockPwBtn').addEventListener('click', ()=>{
  showLockScreen({ mode: 'verify', cancellable: true, onSuccess: ()=>{
    showLockScreen({ mode: 'setup', cancellable: true, onSuccess: ()=>{
      toast(L('lockPwChangedToast'));
      updateSettingsPrivacyUI();
    }});
  }});
});
document.getElementById('changeSecurityQBtn').addEventListener('click', ()=>{
  showLockScreen({ mode: 'verify', cancellable: true, onSuccess: ()=> openSecurityQModal('change') });
});
function performDisableLock(silent){
  [LK_ENABLED, LK_PIN_HASH, LK_PIN_SALT, LK_PIN_LEN,
   LK_PW_HASH, LK_PW_SALT, LK_SQ, LK_SQ_HASH, LK_SQ_SALT,
   LK_WEBAUTHN, LK_ACTIVITY, LK_ATTEMPTS, LK_COOLDOWN,
   LK_F_ATTEMPTS, LK_F_COOLDOWN, LK_LEVEL].forEach(lkSafeDel);
  if(silent !== true) toast(L('lockDisabledToast'));
  updateSettingsPrivacyUI();
}
document.getElementById('disableLockBtn').addEventListener('click', ()=>{
  showLockScreen({ mode: 'verify', cancellable: true, onSuccess: ()=> openSimpleConfirm(L('disableLockConfirmMsg'), performDisableLock) });
});

/* ============================================================
   Security question modal
   ============================================================ */
const securityQModalEl = document.getElementById('securityQModal');
let securityQMode = null;
function openSecurityQModal(mode){
  securityQMode = mode;
  document.getElementById('securityQSelect').value = 'securityQ1';
  document.getElementById('securityQCustomInput').style.display = 'none';
  document.getElementById('securityQCustomInput').value = '';
  document.getElementById('securityAnswerInput').value = '';
  document.getElementById('securityQError').style.display = 'none';
  securityQModalEl.classList.add('open');
  lockBodyScroll();
  setTimeout(()=>{ document.getElementById('securityQSelect').focus(); }, 60);
}
function closeSecurityQModal(){
  const wasSetup = (securityQMode === 'setup');
  securityQModalEl.classList.remove('open'); unlockBodyScroll();
  securityQMode = null;
  /* এইমাত্র লক চালু হয়েছে অথচ প্রশ্ন সেট না করেই বন্ধ করা হলো → লক বাতিল।
     নইলে PIN ভুলে গেলে ফেরার কোনো উপায় থাকে না (শুধু আনইনস্টল = ডাটা লস) */
  let hasSq = false;
  try{ hasSq = !!localStorage.getItem(LK_SQ); }catch(e){}
  if(wasSetup && isLockEnabled() && !hasSq){
    performDisableLock(true);
    if(typeof toast === 'function') toast(L('lockDisabledNoSqToast'), 7000);
  }
}
/* আগে থেকেই প্রশ্ন ছাড়া লক চালু থাকা ইউজারদের জন্য: আনলকের পর (সেশনে একবার) মনে করিয়ে দেওয়া */
let lkSqNudged = false;
function nudgeNoSecurityQ(){
  try{
    if(lkSqNudged || !isLockEnabled() || localStorage.getItem(LK_SQ)) return;
    lkSqNudged = true;
    setTimeout(()=>{ if(typeof toast === 'function') toast(L('lockNoSqNudgeToast'), 7000); }, 600);
  }catch(e){}
}
document.getElementById('securityQSelect').addEventListener('change', (e)=>{
  document.getElementById('securityQCustomInput').style.display = e.target.value === 'custom' ? 'block' : 'none';
});
document.getElementById('securityQCloseBtn').addEventListener('click', ()=> closeSecurityQModal());
securityQModalEl.addEventListener('click', (e)=>{ if(e.target === securityQModalEl) closeSecurityQModal(); });
document.getElementById('securityAnswerInput').addEventListener('keypress', (e)=>{
  if(e.key === 'Enter') document.getElementById('securityQSaveBtn').click();
});
document.getElementById('securityQSaveBtn').addEventListener('click', async ()=>{
  const sel = document.getElementById('securityQSelect').value;
  const customText = document.getElementById('securityQCustomInput').value.trim();
  const answer = document.getElementById('securityAnswerInput').value;
  const err = document.getElementById('securityQError');
  if((sel === 'custom' && !customText) || !answer.trim()){
    err.textContent = L('securityQRequiredErr'); err.style.display = 'block'; return;
  }
  if(!lkCryptoAvailable()){
    err.textContent = L('securityQRequiredErr'); err.style.display = 'block'; return;
  }
  try{
    const sqData = sel === 'custom' ? { type:'custom', text: customText } : { type:'preset', key: sel };
    const { hash, salt } = await lkHashSecret(lkNormalizeAnswer(answer));
    const sqSnap = lkSnapshotKeys([LK_SQ, LK_SQ_HASH, LK_SQ_SALT]);
    const ok1 = lkSafeSet(LK_SQ, JSON.stringify(sqData));
    const ok2 = ok1 && lkSafeSet(LK_SQ_HASH, hash);
    const ok3 = ok2 && lkSafeSet(LK_SQ_SALT, salt);
    if(!ok1 || !ok2 || !ok3){
      lkRestoreKeys(sqSnap);
      err.textContent = L('storageSaveFailMsg'); err.style.display = 'block'; return;
    }
    securityQModalEl.classList.remove('open'); unlockBodyScroll();
    toast(L('securityQSavedToast'));
    updateSettingsPrivacyUI();
    securityQMode = null;
  }catch(e){
    err.textContent = L('securityQRequiredErr'); err.style.display = 'block';
  }
});

/* ============================================================
   Keypad + keyboard wiring
   ============================================================ */
buildKeypad();
if(lockKeypadEl){
  lockKeypadEl.addEventListener('click', (e)=>{
    const b = e.target.closest('.pin-key'); if(!b) return;
    if(b.disabled) return;
    pressKey(b.dataset.k);
    try{ navigator.vibrate && navigator.vibrate(6); }catch(_){}
  });
}
if(lockCancelBtn){
  lockCancelBtn.addEventListener('click', ()=>{ hideLockScreen(); });
}
if(lockAltBtn){
  lockAltBtn.addEventListener('click', ()=>{
    if(lockMode === 'unlock'){
      lockMode = 'forgot';
      openSecurityQuestionFlow();
    }
  });
}

/* keyboard support */
document.addEventListener('keydown', (e)=>{
  if(!lockActive()) return;
  if(document.activeElement && document.activeElement.tagName === 'INPUT') return;
  const k = e.key;
  if(/^[0-9]$/.test(k)){ e.preventDefault(); pressKey(k); return; }
  if(k === 'Backspace'){ e.preventDefault(); pressKey('back'); return; }
  if(k === 'Enter'){ e.preventDefault(); if(lockMode === 'setup') pressKey('check'); return; }
  if(k === 'Escape'){ clearHint(); return; }
});

/* ============================================================
   Cold start
   ============================================================ */
if(isLockEnabled() && lockScreenEl && lockScreenEl.classList.contains('show')){
  showLockScreen();
}
recordActivity();
initIdleWatch();

/* settings.js থেকে কল করার জন্য */
window.updateSettingsPrivacyUI = updateSettingsPrivacyUI;