/* ============================================================
   i18n core — language state and helpers (dictionaries: i18n-bn.js, i18n-en.js)
   ============================================================ */
let lang = 'bn';
try{ lang = localStorage.getItem('hisab_lang') || 'bn'; }catch(e){ lang = 'bn'; }
function L(key){ return (dict[lang] && dict[lang][key]) || dict.bn[key] || key; }
function tfmt(key, obj){
  let s = L(key);
  Object.keys(obj).forEach(k=>{ s = s.split('{'+k+'}').join(obj[k]); });
  return s;
}
const banglaDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
function numFmt(n){
  const s = String(n);
  return lang==='bn' ? s.replace(/[0-9]/g, d => banglaDigits[d]) : s;
}
