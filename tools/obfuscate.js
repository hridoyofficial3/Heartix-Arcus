/* বিল্ডের সময় www/ এর JS ফাইল এলোমেলো (obfuscate) করে। ব্যর্থ হলে সেই ফাইল আসল অবস্থায় থাকে। */
const fs = require('fs'), path = require('path'), vm = require('vm');
const JO = require('javascript-obfuscator');
const SKIP = new Set(['i18n.js', 'i18n-bn.js', 'i18n-en.js', 'sw.js', 'app-version.js']);   // অনুবাদের টেক্সট/সার্ভিস ওয়ার্কার/বিল্ড নম্বর
const dir = 'www';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !SKIP.has(f));
let ok = 0, skipped = 0;
files.forEach((f, i) => {
  const p = path.join(dir, f);
  try{
    const out = JO.obfuscate(fs.readFileSync(p, 'utf8'), {
      compact: true,
      identifierNamesGenerator: 'hexadecimal',
      identifiersPrefix: 'a' + i,
      renameGlobals: false,            // গ্লোবাল নাম বদলালে ফাইলগুলো/onclick আর মিলবে না
      stringArray: true,
      stringArrayThreshold: 0.75,
      stringArrayEncoding: ['base64'],
      rotateStringArray: true,
      shuffleStringArray: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      selfDefending: false,
      debugProtection: false,
      transformObjectKeys: false,
      unicodeEscapeSequence: false,
      simplify: true,
      target: 'browser'
    }).getObfuscatedCode();
    new vm.Script(out);                // সিনট্যাক্স ঠিক আছে কিনা যাচাই
    fs.writeFileSync(p, out);
    ok++; console.log('obfuscated:', f);
  }catch(e){ skipped++; console.warn('SKIPPED (kept original):', f, '-', e.message); }
});
console.log('done. obfuscated=' + ok + ' skipped=' + skipped);
