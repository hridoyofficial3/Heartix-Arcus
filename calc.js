/* Arcus — সাধারণ ক্যালকুলেটর। হেডারের লোগোতে ২ বার ট্যাপ করলে খোলে। */
(function(){
  var modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'calcModal';
  modal.innerHTML =
    '<div class="modal-card calc-card">' +
      '<div class="modal-header"><h3 id="calcTitle">Calculator</h3>' +
      '<button class="modal-close" id="calcCloseBtn" aria-label="' + L('a11yClose') + '">×</button></div>' +
      '<div class="calc-screen"><div class="calc-expr" id="calcExpr"></div><div class="calc-res" id="calcRes">0</div></div>' +
      '<div class="calc-grid" id="calcGrid"></div>' +
    '</div>';
  document.body.appendChild(modal);

  var keys = [
    ['C','fn'],['⌫','fn'],['%','fn'],['÷','op'],
    ['7'],['8'],['9'],['×','op'],
    ['4'],['5'],['6'],['−','op'],
    ['1'],['2'],['3'],['+','op'],
    ['00'],['0'],['.'],['=','eq']
  ];
  var grid = modal.querySelector('#calcGrid');
  keys.forEach(function(k){
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'calc-key' + (k[1] ? ' ' + k[1] : '');
    b.textContent = k[0];
    b.dataset.k = k[0];
    grid.appendChild(b);
  });

  var exprEl = modal.querySelector('#calcExpr');
  var resEl = modal.querySelector('#calcRes');
  var nums = [], ops = [], cur = '', justEq = false, err = false;

  function fmt(n){
    if(!isFinite(n)) return 'Error';
    n = Math.round(n * 1e10) / 1e10;
    var s = String(n);
    if(s.indexOf('e') > -1) return s;
    var p = s.split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return p.join('.');
  }
  function apply(a, op, b){
    if(op === '+') return a + b;
    if(op === '−') return a - b;
    if(op === '×') return a * b;
    if(op === '÷') return b === 0 ? NaN : a / b;
  }
  function prec(op){ return (op === '×' || op === '÷') ? 2 : 1; }
  function evaluate(n, o){
    n = n.slice(); o = o.slice();
    var outN = [n[0]], outO = [];
    for(var i = 0; i < o.length; i++){
      while(outO.length && prec(outO[outO.length-1]) >= prec(o[i])){
        var op = outO.pop(), b = outN.pop(), a = outN.pop();
        outN.push(apply(a, op, b));
      }
      outO.push(o[i]); outN.push(n[i+1]);
    }
    while(outO.length){
      var op2 = outO.pop(), b2 = outN.pop(), a2 = outN.pop();
      outN.push(apply(a2, op2, b2));
    }
    return outN[0];
  }
  function curNum(){ return cur === '' || cur === '.' || cur === '-' ? null : parseFloat(cur); }
  function show(){
    var s = '';
    for(var i = 0; i < ops.length; i++) s += fmt(nums[i]) + ' ' + ops[i] + ' ';
    s += cur === '' ? '' : (cur.indexOf('.') > -1 ? cur.replace(/^(\d+)/, function(m){ return fmt(parseFloat(m)); }) : fmt(parseFloat(cur)));
    if(!justEq) exprEl.textContent = s;
    if(err){ resEl.textContent = 'Error'; return; }
    var n = curNum();
    if(justEq) return;
    if(n === null && !ops.length){ resEl.textContent = '0'; return; }
    var nn = nums.slice(), oo = ops.slice();
    if(n !== null) nn.push(n); else { oo.pop(); }
    resEl.textContent = nn.length ? fmt(evaluate(nn, oo)) : '0';
  }
  function reset(){ nums = []; ops = []; cur = ''; justEq = false; err = false; exprEl.textContent = ''; resEl.textContent = '0'; }

  function press(k){
    if(err && k !== 'C'){ return; }
    if(/^[0-9]$/.test(k) || k === '00'){
      if(justEq){ reset(); }
      if(cur.replace('.','').length >= 15) return;
      if(cur === '0') cur = k === '00' ? '0' : k; else cur += (cur === '' && k === '00') ? '0' : k;
    } else if(k === '.'){
      if(justEq){ reset(); }
      if(cur.indexOf('.') > -1) return;
      cur = (cur === '' ? '0' : cur) + '.';
    } else if(k === 'C'){ reset(); return;
    } else if(k === '⌫'){
      if(justEq){ return; }
      if(cur !== '') cur = cur.slice(0, -1);
      else if(ops.length){ ops.pop(); cur = String(nums.pop()); }
    } else if(k === '+' || k === '−' || k === '×' || k === '÷'){
      if(justEq){ justEq = false; exprEl.textContent = ''; }
      var n = curNum();
      if(n === null){
        if(ops.length) ops[ops.length-1] = k;
        else if(nums.length === 0) { nums.push(0); ops.push(k); }
      } else { nums.push(n); ops.push(k); cur = ''; }
    } else if(k === '%'){
      var v = curNum();
      if(v === null) return;
      var last = ops[ops.length-1];
      if(ops.length && (last === '+' || last === '−')){
        var left = evaluate(nums.slice(), ops.slice(0, -1));
        v = left * v / 100;
      } else { v = v / 100; }
      cur = String(Math.round(v * 1e10) / 1e10);
      justEq = false;
    } else if(k === '='){
      var n2 = curNum();
      if(n2 === null && !ops.length) return;
      var nn = nums.slice(), oo = ops.slice();
      if(n2 !== null) nn.push(n2); else oo.pop();
      if(!nn.length) return;
      var full = '';
      for(var i = 0; i < oo.length; i++) full += fmt(nn[i]) + ' ' + oo[i] + ' ';
      full += fmt(nn[nn.length-1]);
      var r = evaluate(nn, oo);
      exprEl.textContent = full + ' =';
      if(!isFinite(r)){ err = true; resEl.textContent = 'Error'; return; }
      r = Math.round(r * 1e10) / 1e10;
      resEl.textContent = fmt(r);
      nums = []; ops = []; cur = String(r); justEq = true;
      return;
    }
    show();
  }

  grid.addEventListener('click', function(e){
    var b = e.target.closest('.calc-key');
    if(b) press(b.dataset.k);
  });
  function open(){ reset(); modal.querySelector('#calcTitle').textContent = L('calcTitle'); modal.classList.add('open'); }
  function close(){ modal.classList.remove('open'); }
  modal.querySelector('#calcCloseBtn').addEventListener('click', close);
  modal.addEventListener('click', function(e){ if(e.target === modal) close(); });
  document.addEventListener('keydown', function(e){
    if(!modal.classList.contains('open')) return;
    var k = e.key;
    if(k === 'Escape') return close();
    var map = { '*':'×', '/':'÷', '-':'−', 'Enter':'=', 'Backspace':'⌫', 'Delete':'C' };
    k = map[k] || k;
    if(/^[0-9.+−×÷%=]$/.test(k) || k === '⌫' || k === 'C'){ e.preventDefault(); press(k); }
  });

  /* লোগোতে ২ বার ট্যাপ */
  var logo = document.querySelector('header .app-icon');
  if(logo){
    var lastTap = 0;
    logo.style.cursor = 'pointer';
    logo.style.touchAction = 'manipulation';
    logo.addEventListener('click', function(){
      var now = Date.now();
      if(now - lastTap < 400){ lastTap = 0; open(); } else { lastTap = now; }
    });
  }
})();
