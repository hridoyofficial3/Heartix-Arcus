/* ============================================================
   Google Drive auto-backup (APK / Capacitor only)
   - Drive-এর লুকানো "appDataFolder"-এ একটাই ফাইল রাখে (arcus-backup.json)
   - scope: drive.appdata (ইউজারের বাকি Drive ফাইল অ্যাপ দেখতে পায় না)
   - ডাটা বদলালে ~8 সেকেন্ড পর অটো আপলোড; অ্যাপ ব্যাকগ্রাউন্ডে গেলে সঙ্গে সঙ্গে
   ============================================================ */
(function(){
  'use strict';

  // >>> Google Cloud Console থেকে পাওয়া "Web application" Client ID এখানে বসাও <<<
  var GD_WEB_CLIENT_ID = '742909845874-lick60srks603ivah5mldg06vjimmho4.apps.googleusercontent.com';

  var GD_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var GD_FILE  = 'arcus-backup.json';
  var GD_PREV  = 'arcus-backup-prev.json';   // আগের কপি: মূল ফাইল ২০ ঘণ্টার পুরনো হলে ওভাররাইটের আগে এখানে সরানো হয়
  var SNAP_MS  = 20 * 3600 * 1000;
  var K_ON = 'hisab_gd_on', K_EMAIL = 'hisab_gd_email', K_LAST = 'hisab_gd_last', K_ASKED = 'hisab_gd_asked';
  var K_PW  = 'hisab_gd_pw';                 // ঐচ্ছিক: Drive ব্যাকআপ এনক্রিপ্ট করার পাসওয়ার্ড (এই ফোনে থাকে যাতে অটো-ব্যাকআপ চলে)
  var K_MOD = 'hisab_gd_mod';                // আমাদের শেষ আপলোডের পর Drive ফাইলের modifiedTime (অন্য ডিভাইস লিখলে এটা মিলবে না)
  var conflict = false, conflictWarned = false;
  var needSync = false, syncWarned = false;   // Drive-এ ব্যাকআপ আছে অথচ এই ফোন আগে কখনো সিঙ্ক করেনি (যেমন পুরনো সংস্করণে ফেরানো, রিলোডের পর কোনো ব্যাকআপ হয়নি)
  var DEBOUNCE_MS = 8000;

  var tok = null;            // { v, exp }
  var inited = false;
  var busy = false, dirty = false, timer = null;
  var fileId = null;

  /* ---------- ছোট হেল্পার ---------- */
  function en(){ return (typeof lang !== 'undefined') && lang === 'en'; }
  function T(bn, e){ return en() ? e : bn; }
  function ls(k, v){
    try{
      if(v === undefined) return localStorage.getItem(k);
      if(v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    }catch(e){}
    return null;
  }
  function say(msg, ms){ try{ toast(msg, ms); }catch(e){ console.log(msg); } }
  function plugin(){
    try{
      var C = window.Capacitor;
      if(C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.SocialLogin) return C.Plugins.SocialLogin;
    }catch(e){}
    return null;
  }
  function configured(){ return GD_WEB_CLIENT_ID.indexOf('PASTE_') !== 0; }
  function isOn(){ return ls(K_ON) === '1'; }
  function tokStr(x){ return typeof x === 'string' ? x : (x && x.token) || null; }
  function setTok(raw, expiresHint){
    var v = tokStr(raw); if(!v) return false;
    var exp = Date.now() + 45 * 60000;
    if(raw && raw.expires){ var t = Date.parse(raw.expires); if(t && t > Date.now()) exp = t; }
    else if(expiresHint) exp = expiresHint;
    tok = { v: v, exp: exp };
    return true;
  }

  /* ---------- সাইন-ইন / টোকেন ---------- */
  async function init(){
    if(inited) return;
    var P = plugin(); if(!P) throw new Error('no-plugin');
    await P.initialize({ google: { webClientId: GD_WEB_CLIENT_ID, mode: 'online' } });
    inited = true;
  }
  async function loginInteractive(){
    await init();
    var r = await plugin().login({ provider: 'google', options: { scopes: ['email', 'profile', GD_SCOPE] } });
    var res = r && r.result;
    if(!res || !setTok(res.accessToken)) throw new Error('no-access-token');
    var email = res.profile && res.profile.email;
    if(email) ls(K_EMAIL, email);
    return email || '';
  }
  async function getToken(force){
    if(!force && tok && tok.exp > Date.now() + 120000) return tok.v;
    await init();
    var P = plugin();
    if(!force){
      try{ var a = await P.getAuthorizationCode({ provider: 'google' }); if(a && setTok(a.accessToken)) return tok.v; }catch(e){}
    }
    try{
      await P.refresh({ provider: 'google', options: { scopes: [GD_SCOPE] } });
      var b = await P.getAuthorizationCode({ provider: 'google' });
      if(b && setTok(b.accessToken)) return tok.v;
    }catch(e){}
    try{
      var c = await P.login({ provider: 'google', options: { scopes: ['email', 'profile', GD_SCOPE], filterByAuthorizedAccounts: true, autoSelectEnabled: true } });
      if(c && c.result && setTok(c.result.accessToken)) return tok.v;
    }catch(e){}
    throw new Error('no-token');
  }

  /* ---------- Drive REST ---------- */
  async function api(url, opts, retried){
    var t = await getToken(!!retried);
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + t });
    var res = await fetch(url, opts);
    if(res.status === 401 && !retried){ tok = null; return api(url, opts, true); }
    if(!res.ok){ var er = new Error('drive-' + res.status); er.status = res.status; throw er; }
    return res;
  }
  async function findFile(name){
    name = name || GD_FILE;
    var q = encodeURIComponent("name='" + name + "'");
    var url = 'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=' + q + '&fields=files(id,modifiedTime)&pageSize=1';
    var j = await (await api(url)).json();
    var f = j.files && j.files[0];
    if(name === GD_FILE) fileId = f ? f.id : null;
    return f || null;
  }
  // নাম+আইডি অনুযায়ী আপলোড (id না থাকলে নতুন ফাইল); { id, modifiedTime } ফেরত দেয়
  async function uploadFile(name, id, jsonStr){
    if(id){
      var r0 = await api('https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media&fields=id,modifiedTime', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: jsonStr
      });
      return await r0.json();
    }
    var b = 'arcusbnd' + Date.now();
    var body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify({ name: name, parents: ['appDataFolder'] }) + '\r\n--' + b +
      '\r\nContent-Type: application/json\r\n\r\n' + jsonStr + '\r\n--' + b + '--';
    var r = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', {
      method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: body
    });
    var out = await r.json();
    if(name === GD_FILE) fileId = out.id;
    return out;
  }
  async function download(id){
    var r = await api('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media');
    return r.json();
  }
  // বর্তমান মূল ফাইলের কপি GD_PREV-এ রাখে (ব্যর্থ হলে মূল আপলোড আটকায় না)
  async function snapshotCurrent(f){
    try{
      var cur = await (await api('https://www.googleapis.com/drive/v3/files/' + f.id + '?alt=media')).text();
      var p = await findFile(GD_PREV);
      await uploadFile(GD_PREV, p ? p.id : null, cur);
    }catch(e){ console.warn('gdrive snapshot failed', e); }
  }

  /* ---------- ব্যাকআপ / রিস্টোর ---------- */
  // আপলোডের স্ট্রিং: পাসওয়ার্ড সেট থাকলে এনক্রিপ্টেড (এনক্রিপ্ট না করতে পারলে প্লেইন আপলোড কখনো নয়, বরং এরর)
  async function packBackup(){
    var data = collectBackupData();
    var pw = ls(K_PW);
    if(pw){
      if(typeof encryptAndVerifyBackup !== 'function' || typeof cryptoAvailable !== 'function' || !cryptoAvailable()) throw new Error('no-crypto');
      return JSON.stringify(await encryptAndVerifyBackup(data, pw));
    }
    return JSON.stringify(data);
  }
  async function backupNow(silent, force){
    if(busy){ dirty = true; return false; }
    if(typeof hasAnyData === 'function' && !hasAnyData()){
      if(!silent) say(T('ব্যাকআপ করার মতো ডাটা নেই', 'Nothing to back up'));
      return false;
    }
    busy = true; dirty = false;
    try{
      var f = await findFile(GD_FILE);
      // এই ইনস্টল আগে কখনো Drive-এর সাথে সিঙ্ক হয়নি অথচ Drive-এ ফাইল আছে → অটো-আপলোডে ওভাররাইট নয় (ইউজার নিজে "এখনই ব্যাকআপ নাও" চাপলে চলবে)
      if(silent && !ls(K_LAST) && f){
        needSync = true;
        if(!syncWarned){ syncWarned = true; say(T('Drive-এ আগের একটা ব্যাকআপ আছে, তাই অটো-ব্যাকআপ থামানো আছে। সেটিংসে গিয়ে "ফিরিয়ে আনো" অথবা "এখনই ব্যাকআপ নাও" বেছে নাও।', 'There is an earlier backup on Drive, so auto-backup is paused. Open Settings and choose "Restore" or "Back up now".'), 7000); }
        return false;   // নীরবে ওভাররাইট নয়
      }
      needSync = false;
      // অন্য ডিভাইস/সেশন আমাদের শেষ আপলোডের পর Drive ফাইল বদলে দিয়েছে?
      var mine = ls(K_MOD);
      conflict = !!(f && mine && Date.parse(f.modifiedTime) !== Date.parse(mine));
      if(conflict && !force){
        if(silent){
          if(!conflictWarned){ conflictWarned = true; say(T('অন্য ডিভাইস Drive-এ নতুন ব্যাকআপ রেখেছে — অটো-ব্যাকআপ থামানো আছে। সেটিংসে গিয়ে ফিরিয়ে আনো বা "এখনই ব্যাকআপ নাও" চাপো।', 'Another device wrote a newer backup to Drive, so auto-backup is paused. Open Settings to restore it or tap "Back up now".'), 7000); }
        } else {
          setTimeout(function(){
            openSimpleConfirm(
              T('অন্য ডিভাইস Drive-এ নতুন ব্যাকআপ রেখেছে। এই ফোনের ডাটা দিয়ে সেটা বদলে দেবে? (আগের কপি Drive-এ "আগের ব্যাকআপ" হিসেবে থাকবে)', 'Another device saved a newer backup to Drive. Replace it with this phone\'s data? (The old one is kept as the previous backup.)'),
              function(){ backupNow(false, true); },
              function(){}
            );
          }, 0);
        }
        return false;
      }
      // মূল ফাইল ২০ ঘণ্টার পুরনো হলে (বা ইউজার জোর করে বদলালে / প্রথম সিঙ্কে) আগে তার কপি রাখো
      if(f && (force || !ls(K_LAST) || (Date.now() - Date.parse(f.modifiedTime)) > SNAP_MS)) await snapshotCurrent(f);
      var res = await uploadFile(GD_FILE, f ? f.id : null, await packBackup());
      ls(K_LAST, String(Date.now()));
      if(res && res.modifiedTime) ls(K_MOD, res.modifiedTime);
      conflict = false; conflictWarned = false; needSync = false; syncWarned = false;
      if(!silent) say(T('Google Drive-এ ব্যাকআপ হয়েছে ✓', 'Backed up to Google Drive ✓'));
      return true;
    }catch(e){
      console.warn('gdrive backup failed', e);
      if(!silent) say(T('Drive ব্যাকআপ হয়নি। ইন্টারনেট/লগইন দেখো', 'Drive backup failed. Check internet/sign-in'), 3500);
      return false;
    }finally{
      busy = false; render();
      if(dirty) schedule();
    }
  }
  function schedule(){
    if(!isOn() || !plugin()) return;
    clearTimeout(timer);
    timer = setTimeout(function(){ timer = null; backupNow(true); }, DEBOUNCE_MS);
  }
  function flushNow(){
    if(timer){ clearTimeout(timer); timer = null; backupNow(true); }
  }
  async function restoreFromDrive(usePrev){
    usePrev = (usePrev === true);   // onclick থেকে ইভেন্ট অবজেক্ট এলে false ধরা হয়
    try{
      var main = await findFile(GD_FILE);
      var f = usePrev ? await findFile(GD_PREV) : main;
      if(!f){ say(usePrev ? T('Drive-এ আগের কোনো কপি নেই', 'No previous backup on Drive') : T('Drive-এ কোনো ব্যাকআপ পাওয়া যায়নি', 'No backup found on Drive')); return; }
      var parsed = await download(f.id);
      var invalid = function(){ say(T('Drive-এর ব্যাকআপ ফাইল ঠিক নেই', 'Drive backup file is invalid')); };
      // অটো-ব্যাকআপ চালু (K_ON) হবে শুধু ইম্পোর্ট সফল হলে — ইউজার কনফার্ম বাতিল করলে Drive-এর ব্যাকআপ কখনো ওভাররাইট হবে না
      var finish = function(data, pw){
        startImportFlow(data, function(){
          ls(K_ON, '1'); ls(K_LAST, String(Date.now()));
          if(main && main.modifiedTime) ls(K_MOD, main.modifiedTime);   // মূল ফাইলের বর্তমান অবস্থার সাথে সিঙ্ক ধরা হলো
          if(pw) ls(K_PW, pw);                                          // পরের অটো-ব্যাকআপও এনক্রিপ্টেড থাকবে
        });
      };
      if(parsed && typeof parsed === 'object' && parsed.encrypted === true){
        if(!parsed.salt || !parsed.iv || !parsed.ciphertext || typeof decryptBackupPayload !== 'function' || typeof openBackupPasswordModal !== 'function'){ invalid(); return; }
        // true = সামলানো হয়েছে (সফল বা ফাইল নষ্ট); false = পাসওয়ার্ড ভুল
        var tryPw = async function(pw){
          try{
            var d = await decryptBackupPayload(parsed, pw);
            if(!d || typeof d !== 'object' || !Array.isArray(d.entries)){ invalid(); return true; }
            finish(d, pw); return true;
          }catch(err){
            if(err && err.corruptFile){ invalid(); return true; }
            return false;
          }
        };
        var saved = ls(K_PW);
        if(saved && await tryPw(saved)) return;
        openBackupPasswordModal('import', tryPw);
        return;
      }
      if(!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)){ invalid(); return; }
      finish(parsed, null);
    }catch(e){
      console.warn('gdrive restore failed', e);
      say(T('Drive থেকে ফেরানো যায়নি', 'Could not restore from Drive'), 3500);
    }
  }

  /* ---------- সংযোগ ---------- */
  async function connect(){
    if(!configured()){ say(T('Client ID বসানো হয়নি (gdrive-backup.js)', 'Client ID not set (gdrive-backup.js)'), 4000); return; }
    try{
      await loginInteractive();
    }catch(e){
      console.warn('gdrive login failed', e);
      var _d=''; try{ _d=' [' + ((e&&(e.code||e.errorCode))||'') + ' ' + ((e&&e.message)||String(e)) + ']'; }catch(_e){}
      say(T('Google লগইন হয়নি', 'Google sign-in failed') + _d, 15000); return;
    }
    try{
      var f = await findFile();
      var localHas = (typeof hasAnyData === 'function') && hasAnyData();
      if(!f){
        ls(K_ON, '1');
        if(localHas) await backupNow(false);
        say(T('Google Drive যুক্ত হয়েছে', 'Google Drive connected'));
      } else if(!localHas){
        await restoreFromDrive();
      } else {
        openSimpleConfirm(
          T('Drive-এ আগের ব্যাকআপ আছে। সেটা ফিরিয়ে আনবে? (এই ফোনের ডাটা বদলে যাবে)\n\n"না" বললে Drive-এর ব্যাকআপ বদলানোর আগে আবার জিজ্ঞেস করা হবে।',
            'A backup already exists on Drive. Restore it? (This phone\'s data will be replaced)\n\nChoosing "No" will ask you again before Drive is overwritten.'),
          function(){ restoreFromDrive(); },
          function(){
            // "না" / বাইরে ট্যাপ / ক্রস — সবই এখানে আসে, তাই ওভাররাইটের আগে আলাদা স্পষ্ট কনফার্ম
            openSimpleConfirm(
              T('Drive-এর পুরনো ব্যাকআপ মুছে এই ফোনের ডাটা রাখবে? এটা ফেরানো যাবে না।', 'Replace the backup on Drive with this phone\'s data? This cannot be undone.'),
              async function(){ ls(K_ON, '1'); await backupNow(false, true); render(); },
              function(){}
            );
          }
        );
      }
    }catch(e){
      console.warn('gdrive connect failed', e);
      say(T('Drive-এ যুক্ত হওয়া যায়নি', 'Could not connect to Drive'), 3500);
    }
    render();
  }
  async function disconnect(){
    try{ await init(); await plugin().logout({ provider: 'google' }); }catch(e){}
    tok = null; fileId = null; clearTimeout(timer); timer = null;
    ls(K_ON, null); ls(K_EMAIL, null); ls(K_LAST, null); ls(K_MOD, null); conflict = false; conflictWarned = false; needSync = false; syncWarned = false;
    say(T('Drive সংযোগ বিচ্ছিন্ন (Drive-এর ব্যাকআপ ফাইল থেকে গেছে)', 'Disconnected (backup file stays on Drive)'), 3500);
    render();
  }

  // পাসওয়ার্ড বদলালে/বন্ধ করলে মূল ফাইল নতুন ফরম্যাটে আবার আপলোড; "আগের কপি"-তেও সেটাই বসে যাতে পুরনো ফরম্যাট (প্লেইন) পড়ে না থাকে
  async function reuploadAfterPwChange(){
    var ok = await backupNow(false);
    if(!ok) return false;
    try{
      var m = await findFile(GD_FILE), p = await findFile(GD_PREV);
      if(m && p){
        var txt = await (await api('https://www.googleapis.com/drive/v3/files/' + m.id + '?alt=media')).text();
        await uploadFile(GD_PREV, p.id, txt);
      }
    }catch(e){ console.warn('gdrive prev re-sync failed', e); }
    return true;
  }
  function setDrivePassword(){
    if(typeof openBackupPasswordModal !== 'function' || typeof cryptoAvailable !== 'function' || !cryptoAvailable()){
      say(T('এই ডিভাইসে এনক্রিপশন চালানো যাচ্ছে না', 'Encryption is not available on this device')); return;
    }
    // modal-এর "বাদ দাও" বোতাম = পাসওয়ার্ড ছাড়া (এনক্রিপশন বন্ধ)
    openBackupPasswordModal('export', async function(pw){
      var oldPw = ls(K_PW);   // আপলোড ব্যর্থ হলে ফেরত যাওয়ার জন্য
      if(pw){
        ls(K_PW, pw);
        say(T('এখন থেকে Drive ব্যাকআপ পাসওয়ার্ড দিয়ে এনক্রিপ্ট হবে। পাসওয়ার্ড হারালে ব্যাকআপ খোলা যাবে না।', 'Drive backups will now be encrypted. If you lose the password the backup cannot be opened.'), 6000);
      } else {
        if(!ls(K_PW)) return;
        ls(K_PW, null);
        say(T('Drive ব্যাকআপের এনক্রিপশন বন্ধ করা হলো', 'Drive backup encryption turned off'));
      }
      var done = await reuploadAfterPwChange();
      if(!done && !conflict && typeof hasAnyData === 'function' && hasAnyData()){
        // ইন্টারনেট/লগইন সমস্যায় আপলোড হয়নি: Drive-এ ফাইল পুরনো ফরম্যাটেই আছে, তাই সেটিংও আগেরটায় ফেরানো (নইলে 🔒 দেখাত অথচ Drive-এ প্লেইন/পুরনো পাসওয়ার্ডের কপি)
        ls(K_PW, oldPw || null);
        say(T('পাসওয়ার্ড বদলানো যায়নি (Drive-এ আপলোড হয়নি)। আগের সেটিং ঠিকই আছে, ইন্টারনেট দেখে আবার চেষ্টা করো।', 'Could not change the password (upload failed). Your previous setting is unchanged; check your connection and try again.'), 6000);
      }
      render();
    });
    // modal-এর লেখা Drive-এর জন্য বদলানো (পরের খোলায় openBackupPasswordModal নিজেই আসল লেখা বসায়)
    try{
      document.getElementById('backupPasswordTitle').textContent = T('Drive ব্যাকআপের পাসওয়ার্ড', 'Drive backup password');
      document.getElementById('backupPasswordDesc').textContent = T('এই পাসওয়ার্ড দিয়ে Drive-এর ব্যাকআপ এনক্রিপ্ট হবে। অটো-ব্যাকআপ চালু রাখতে পাসওয়ার্ড এই ফোনে সেভ থাকবে; নতুন ফোনে ফেরানোর সময় এটা লাগবে। হারালে ব্যাকআপ খোলার উপায় নেই।', 'Your Drive backup will be encrypted with this password. It is kept on this phone so auto-backup keeps working, and you will need it when restoring on a new phone. If you lose it the backup cannot be opened.');
      document.getElementById('backupPasswordSkipBtn').textContent = T('এনক্রিপশন বন্ধ রাখো / বন্ধ করো', 'Keep / turn encryption off');
    }catch(e){}
  }

  /* ---------- সেটিংস UI ---------- */
  var box = null;
  function mk(tag, cls, txt){ var e = document.createElement(tag); if(cls) e.className = cls; if(txt) e.textContent = txt; return e; }
  function render(){
    if(!box) return;
    box.innerHTML = '';
    if(!isOn()){
      box.appendChild(mk('div', 'settings-desc', T('ডাটা বদলালেই নিজে নিজে তোমার Drive-এ ব্যাকআপ হবে। নতুন ফোনে লগইন করলেই ফিরে পাবে।', 'Data is backed up to your Drive automatically. Sign in on a new phone to get it back.')));
      var c = mk('button', 'btn gold', T('Google Drive যুক্ত করো', 'Connect Google Drive'));
      c.style.cssText = 'margin-top:8px;width:100%;'; c.onclick = connect; box.appendChild(c);
      return;
    }
    var last = Number(ls(K_LAST)) || 0;
    var when = last ? new Date(last).toLocaleString(en() ? 'en-GB' : 'bn-BD') : T('এখনও হয়নি', 'not yet');
    box.appendChild(mk('div', 'settings-desc ok', (ls(K_EMAIL) || T('যুক্ত আছে', 'Connected')) + ' • ' + T('শেষ ব্যাকআপ: ', 'Last: ') + when + (ls(K_PW) ? ' • 🔒 ' + T('এনক্রিপ্টেড', 'encrypted') : '')));
    var b1 = mk('button', 'btn gold', busy ? T('ব্যাকআপ হচ্ছে…', 'Backing up…') : T('এখনই Drive-এ ব্যাকআপ নাও', 'Back up to Drive now'));
    b1.style.cssText = 'margin-top:8px;width:100%;'; b1.disabled = busy; b1.onclick = function(){ backupNow(false); };
    var b2 = mk('button', 'btn outline', T('Drive থেকে ফিরিয়ে আনো', 'Restore from Drive'));
    b2.style.cssText = 'margin-top:8px;width:100%;'; b2.onclick = function(){ restoreFromDrive(); };
    var b4 = mk('button', 'btn outline', T('Drive-এর আগের কপি থেকে ফিরিয়ে আনো', 'Restore previous backup from Drive'));
    b4.style.cssText = 'margin-top:8px;width:100%;'; b4.onclick = function(){ restoreFromDrive(true); };
    var b3 = mk('button', 'btn outline', T('সংযোগ বিচ্ছিন্ন করো', 'Disconnect'));
    b3.style.cssText = 'margin-top:8px;width:100%;'; b3.onclick = disconnect;
    if(needSync && !conflict) box.appendChild(mk('div', 'settings-desc warn', T('Drive-এ আগের একটা ব্যাকআপ আছে, তাই অটো-ব্যাকআপ থামানো আছে। "ফিরিয়ে আনো" অথবা "এখনই ব্যাকআপ নাও" বেছে নাও।', 'There is an earlier backup on Drive, so auto-backup is paused. Choose "Restore" or "Back up now".')));
    if(conflict) box.appendChild(mk('div', 'settings-desc warn', T('অন্য ডিভাইস Drive-এ নতুন ব্যাকআপ রেখেছে — অটো-ব্যাকআপ থামানো আছে। ফিরিয়ে আনো, অথবা "এখনই ব্যাকআপ নাও" চেপে এই ফোনের ডাটা রাখো।', 'Another device saved a newer backup — auto-backup is paused. Restore it, or tap "Back up now" to keep this phone\'s data.')));
    var b5 = mk('button', 'btn outline', ls(K_PW) ? T('Drive ব্যাকআপের পাসওয়ার্ড বদলাও / বন্ধ করো', 'Change / turn off Drive backup password') : T('Drive ব্যাকআপে পাসওয়ার্ড দাও (এনক্রিপ্ট)', 'Password-protect Drive backup (encrypt)'));
    b5.style.cssText = 'margin-top:8px;width:100%;'; b5.onclick = function(){ setDrivePassword(); };
    box.appendChild(b1); box.appendChild(b2); box.appendChild(b4); box.appendChild(b5); box.appendChild(b3);
  }

  function boot(){
    // শুধু APK-তে (নেটিভ প্লাগিন থাকলে) দেখাবে
    var slot = document.getElementById('gdriveBackupSlot');
    var blk = document.getElementById('gdriveBackupBlock');
    var anchor = document.getElementById('importDataBtn');
    if(!plugin()){
      if(slot){
        slot.appendChild(mk('div', 'settings-desc', T('Google Drive অটো-ব্যাকআপ শুধু Arcus APK অ্যাপে চলে। ব্রাউজারে নিচের ফাইল ব্যাকআপ ব্যবহার করো।', 'Google Drive auto-backup works only in the Arcus APK app. In the browser, use file backup below.')));
        if(blk) blk.style.display = '';
      }
      return;
    }
    if(!slot && !anchor) return;
    box = mk('div', '');
    if(slot){ slot.appendChild(box); if(blk) blk.style.display = ''; }
    else { box.style.marginTop = '14px'; anchor.insertAdjacentElement('afterend', box); }
    render();

    // সব save*() ফাংশনে অটো-ব্যাকআপ হুক
    ['saveEntries','saveNotes','savePlans','saveLoans','saveDues','saveSettings','saveRecurring'].forEach(function(n){
      var orig = window[n]; if(typeof orig !== 'function') return;
      window[n] = function(){ var r = orig.apply(this, arguments); schedule(); return r; };
    });
    document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'hidden') flushNow(); });
    window.addEventListener('pagehide', flushNow);

    // প্রথমবার APK খুললে একবার জিজ্ঞেস করবে — যুক্ত করলে এরপর সব অটো
    if(!isOn() && configured() && ls(K_ASKED) !== '1'){
      setTimeout(function(){
        if(isOn() || ls(K_ASKED) === '1' || typeof openSimpleConfirm !== 'function') return;
        ls(K_ASKED, '1');
        openSimpleConfirm(
          T('Google Drive-এ অটো-ব্যাকআপ চালু করবে? একবার লগইন করলেই এরপর ডাটা বদলালে নিজে নিজে ব্যাকআপ হবে।',
            'Turn on automatic Google Drive backup? Sign in once and your data will be backed up automatically after every change.'),
          function(){ connect(); },
          function(){}
        );
      }, 3000);
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.gdriveBackup = { setPassword: setDrivePassword, backupNow: backupNow, restore: function(usePrev){ return restoreFromDrive(usePrev === true); }, connect: connect, disconnect: disconnect };
})();
