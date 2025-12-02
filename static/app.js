// app.js — Cleaned & consolidated GearMatrix Pro frontend (full, drop-in)
let gearCount = 0;
let chart = null;
let lastCalc = null;

// utility
const $ = id => document.getElementById(id);
const api = (path, opts={}) => fetch(path, opts).then(r=>r.json());

// ----------------- Navigation & theme -----------------
function initSidebarNav() {
  document.querySelectorAll('.sidebar nav a').forEach(a => {
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      document.querySelectorAll('.sidebar nav a').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      const view = a.getAttribute('data-view') || (a.getAttribute('href') || '').replace('#','');
      if (view) showSection(view);
    });
  });
}

const helpTabEl = $('help-tab');
if (helpTabEl) helpTabEl.addEventListener('click', function () {
  const view = helpTabEl.getAttribute('data-view') || "help-section";
  showSection(view);
});

function showSection(sectionId) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.classList.remove('hidden');
  if (sectionId === 'help-section') {
    ensureHelpRoot();
    if (typeof renderHelp === 'function') renderHelp();
    else if (typeof loadHelpContent === 'function') loadHelpContent();
  }
}

function ensureHelpRoot(){
  const helpSection = document.getElementById('help-section');
  if (!helpSection) return;
  if (!helpSection.querySelector('#help-root')) {
    const div = document.createElement('div');
    div.id = 'help-root';
    helpSection.appendChild(div);
  }
}

const themeToggle = $('themeToggle');
function applyTheme() {
  const t = localStorage.getItem('gm-theme') || 'light';
  if (t === 'dark') {
    document.documentElement.style.setProperty('--bg', '#071023');
    document.documentElement.style.setProperty('--card', '#071422');
    document.documentElement.style.setProperty('--text', '#e6f7ff');
    document.documentElement.style.setProperty('--muted', '#9fb4c6');
    document.documentElement.style.setProperty('--accent', '#0ea5e9');
    if (themeToggle) themeToggle.textContent = 'Light';
  } else {
    document.documentElement.style.setProperty('--bg', '#ffffff');
    document.documentElement.style.setProperty('--card', '#fff');
    document.documentElement.style.setProperty('--text', '#0f172a');
    document.documentElement.style.setProperty('--muted', '#64748b');
    document.documentElement.style.setProperty('--accent', '#0ea5e9');
    if (themeToggle) themeToggle.textContent = 'Dark';
  }
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#ffffff';
  document.body.style.background = bg;
}
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const cur = localStorage.getItem('gm-theme') || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    localStorage.setItem('gm-theme', next);
    applyTheme();
  });
}
applyTheme();

// ----------------- Login modal (mock) -----------------
if ($('openLogin')) $('openLogin').addEventListener('click', ()=> $('loginModal').classList.remove('hidden'));
if ($('loginCancel')) $('loginCancel').addEventListener('click', ()=> $('loginModal').classList.add('hidden'));
if ($('loginSubmit')) $('loginSubmit').addEventListener('click', ()=>{
  const u = $('loginUser').value;
  if(!u){ alert('enter user'); return; }
  localStorage.setItem('gm-user', JSON.stringify({user:u, ts:Date.now()}));
  $('loginModal').classList.add('hidden');
  alert('Logged in as ' + u + ' (mock)');
});

// ----------------- Gear row UI -----------------
function addGear(preset={}) {
  const container = $('gears');
  if (!container) return;
  const id = gearCount++;
  const row = document.createElement('div'); row.className='gear-row'; row.id='gear-'+id;
  row.innerHTML = `
    <strong>#${id}</strong>
    <select id="type-${id}">
      <option>Spur</option><option>Helical</option><option>Bevel</option><option>Worm</option><option>Internal</option>
    </select>
    <input id="teeth-${id}" placeholder="Teeth" value="${preset.teeth||20}" style="width:70px">
    <input id="radius-${id}" placeholder="Radius" value="${preset.radius||50}" style="width:90px">
    <input id="module-${id}" placeholder="Module" value="${preset.module||''}" style="width:90px">
    <input id="connects-${id}" placeholder="Connects (csv)" value="${preset.connects||''}" style="width:120px">
    <input id="mesh-${id}" placeholder="Mesh eff (%)" value="${preset.mesh_eff||98}" style="width:90px">
    <button onclick="removeGear(${id})" class="btn small">Del</button>
  `;
  container.appendChild(row);
  if (preset.type) {
    const sel = document.getElementById(`type-${id}`);
    if (sel) sel.value = preset.type;
  }
}
function removeGear(id){ const el = $('gear-'+id); if(el) el.remove(); }
addGear();

// ----------------- API actions -----------------
if ($('addGear')) $('addGear').addEventListener('click', ()=> addGear());
if ($('calcBtn')) $('calcBtn').addEventListener('click', calculate);
if ($('saveSet')) $('saveSet').addEventListener('click', async()=>{
  const name = prompt('Set name (alphanumeric)'); if(!name) return;
  const payload = buildPayload(); payload.name = name;
  const r = await api('/api/save-set', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  if(r.error) alert('Save failed: '+r.error); else alert('Saved: '+r.filename);
});
if ($('listSets')) $('listSets').addEventListener('click', async()=>{
  const r = await api('/api/list-sets');
  if(r.sets) {
    const out = r.sets.map(s=>`<div><a href="#" onclick="loadSet('${s}')">${s}</a></div>`).join('');
    if ($('savedList')) $('savedList').innerHTML = out || '(no sets)';
    const savedNav = document.querySelector('[data-view="saved"]') || document.querySelector('a[href="#saved"]');
    if (savedNav) savedNav.click();
  }
});

window.loadSet = async (name) => {
  const r = await api('/api/load-set/' + encodeURIComponent(name));
  if(r.error) { alert(r.error); return; }
  $('gears').innerHTML=''; gearCount=0;
  if (r.rpm_input) { if ($('rpm')) $('rpm').value = r.rpm_input; }
  if (r.torque_input) { if ($('torque')) $('torque').value = r.torque_input; }
  (r.gears || []).forEach(g => addGear(g));
  alert('Loaded set: '+name);
  const designerNav = document.querySelector('[data-view="designer"]') || document.querySelector('a[href="#designer"]');
  if (designerNav) designerNav.click();
};

if ($('exportCsv')) $('exportCsv').addEventListener('click', async ()=>{
  if(!lastCalc){ alert('Run calculation first'); return; }
  const res = await fetch('/api/export-csv', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(lastCalc)});
  if(!res.ok){ const err = await res.json(); alert('Export failed: '+(err.error||res.statusText)); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'gearmatrix_export.csv'; a.click();
});
if ($('exportPdf')) $('exportPdf').addEventListener('click', async ()=>{
  if(!lastCalc){ alert('Run calculation first'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14); doc.text('GearMatrix Pro - Report', 14, 18);
  doc.setFontSize(10); doc.text('Generated: ' + new Date().toLocaleString(), 14, 28);
  doc.setFontSize(9);
  let y = 36;
  doc.text('Results:', 14, y); y+=6;
  const lines = JSON.stringify(lastCalc, null, 2).split('\n');
  for(let i=0;i<lines.length;i++){
    if(y>270){ doc.addPage(); y=20; }
    doc.text(lines[i].substring(0,120), 14, y); y+=5;
  }
  doc.save('gearmatrix_report.pdf');
});

// ----------------- Build payload & calculate -----------------
function buildPayload(){
  const unit = $('unit') ? $('unit').value : (document.querySelector('[data-length-unit]') ? document.querySelector('[data-length-unit]').value : 'mm');
  const torqueUnit = $('torqueUnit') ? $('torqueUnit').value : (document.querySelector('[data-torque-unit]') ? document.querySelector('[data-torque-unit]').value : 'Nm');
  const rpm = $('rpm') ? $('rpm').value : (document.querySelector('[data-input-rpm]') ? document.querySelector('[data-input-rpm]').value : 0);
  const torque = $('torque') ? $('torque').value : (document.querySelector('[data-input-torque]') ? document.querySelector('[data-input-torque]').value : 0);
  const gears = [];
  for(let i=0;i<gearCount;i++){
    const row = $('gear-'+i);
    if(!row) continue;
    const getVal = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    gears.push({
      type: getVal(`type-${i}`),
      teeth: getVal(`teeth-${i}`),
      radius: getVal(`radius-${i}`),
      module: getVal(`module-${i}`),
      connects: getVal(`connects-${i}`),
      mesh_eff: getVal(`mesh-${i}`)
    });
  }
  return { unit, torque_unit: torqueUnit, rpm_input: rpm, torque_input: torque, gears };
}

async function calculate(){
  const payload = buildPayload();
  const res = await fetch('/api/calc', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  const data = await res.json();
  if(data.error){ if ($('resultText')) $('resultText').textContent = 'Error: '+data.error; else alert('Error: '+data.error); return; }
  lastCalc = data;
  if ($('resultText')) $('resultText').textContent = JSON.stringify(data, null, 2);
  drawChart(data);
  drawDiagram(payload, data);
}

// ----------------- Chart & Diagram -----------------
function drawChart(data){
  const gearStates = data.gear_states || {};
  const idxs = Object.keys(gearStates).map(Number).sort((a,b)=>a-b);
  const rpms = idxs.map(i => gearStates[i].rpm || 0);
  const torques = idxs.map(i => gearStates[i].torque || 0);
  const canvas = $('chart') || $('myChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  try {
    if(chart) { try { chart.destroy(); } catch(e){} chart = null; }
    const dataObj = {
      labels: idxs,
      datasets: [
        { label:'RPM', data: rpms, borderColor:'#0284c7', tension:0.2, fill:false },
        { label:'Torque (Nm)', data: torques, borderColor:'#ef4444', tension:0.2, fill:false }
      ]
    };
    if (typeof Chart === 'undefined') { console.warn('Chart.js not loaded — skipping chart draw.'); return; }
    chart = new Chart(ctx, {
      type: 'line',
      data: dataObj,
      options: { responsive:true, maintainAspectRatio:false, plugins:{ zoom:{ pan:{enabled:true,mode:'x'}, zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'x'} } } }
    });
  } catch (err) { console.error('drawChart error', err); }
}

function drawDiagram(payload, calcData){
  const container = $('diagramArea'); if (!container) return;
  container.innerHTML = '';
  const gears = payload.gears || [];
  if(gears.length===0){ container.innerHTML = '<em>No gears</em>'; return; }
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS,'svg');
  svg.setAttribute('width','100%'); svg.setAttribute('height','360'); svg.setAttribute('viewBox','0 0 1200 360');
  let x = 80; const scale = 2.5; const centers = [];
  gears.forEach((g,i)=>{ const r = Math.max(6, Number(g.radius||50) * scale / 10); const cy = 180; const cx = x; centers.push({cx,cy,r}); x += r*2 + 40; });
  gears.forEach((g,i)=>{ const conns = (g.connects||'').split(',').map(s=>s.trim()).filter(s=>s!=='').map(Number); conns.forEach(c=>{ if(centers[c]){ const line = document.createElementNS(svgNS,'line'); line.setAttribute('x1', centers[i].cx); line.setAttribute('y1', centers[i].cy); line.setAttribute('x2', centers[c].cx); line.setAttribute('y2', centers[c].cy); line.setAttribute('stroke','#cbd5e1'); line.setAttribute('stroke-width','2'); svg.appendChild(line); } }); });
  centers.forEach((ct,i)=>{ const ggroup = document.createElementNS(svgNS,'g'); const circle = document.createElementNS(svgNS,'circle'); circle.setAttribute('cx', ct.cx); circle.setAttribute('cy', ct.cy); circle.setAttribute('r', ct.r); circle.setAttribute('fill','#f8fafc'); circle.setAttribute('stroke','#94a3b8'); circle.setAttribute('stroke-width','2'); ggroup.appendChild(circle); const text = document.createElementNS(svgNS,'text'); text.setAttribute('x', ct.cx); text.setAttribute('y', ct.cy+4); text.setAttribute('text-anchor','middle'); text.setAttribute('font-size','12'); text.setAttribute('fill','#0f172a'); text.textContent = `G${i}`; ggroup.appendChild(text); ggroup.style.transformOrigin = `${ct.cx}px ${ct.cy}px`; ggroup.style.animation = `spin ${8 - (i%5)}s linear infinite`; svg.appendChild(ggroup); });
  container.appendChild(svg);
}

// ---------- Help / Guide renderer (full) ----------
function toggleSection(el) { const body = el.querySelector('.body'); if (!body) return; const isOpen = body.style.display === 'block'; body.style.display = isOpen ? 'none' : 'block'; }

const PRESETS = { "Simple 2-stage reducer": { rpm:1500, torque:8, unit:'mm', torque_unit:'Nm', gears:[{type:'Spur',teeth:20,radius:50,connects:'1'},{type:'Spur',teeth:40,radius:100,connects:''}] }, "3-stage Helical chain": { rpm:1000, torque:10, unit:'mm', torque_unit:'Nm', gears:[{type:'Helical',teeth:18,radius:30,connects:'1'},{type:'Helical',teeth:36,radius:60,connects:'2'},{type:'Helical',teeth:18,radius:30,connects:''}] } };

function renderHelp(){
  ensureHelpRoot();
  const root = document.getElementById('help-root'); if(!root) return;
  root.innerHTML = `
    <div class="guide-title" style="display:flex; gap:12px; align-items:center;">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style="flex:0 0 36px;">
        <circle cx="12" cy="12" r="11" stroke="#0ea5e9" stroke-width="1.6" fill="#e6f7ff"/>
        <path d="M8 12h8M8 8h8" stroke="#0369a1" stroke-width="1.4" stroke-linecap="round" />
      </svg>
      <h2 class="guide-title">GearMatrix Pro — Quick Guide</h2>
    </div>

    <div class="section" id="sec-basics" style="border-bottom:1px solid #e6eef7; padding:10px 0;">
      <div class="header" style="cursor:pointer;"><h3>1. Basics (Input RPM & Torque)</h3><div class="muted">click to expand</div></div>
      <div class="body" style="display:none; padding:8px 0;">
        <p>Enter your driving <strong>RPM</strong> and <strong>Torque</strong>. Choose length & torque units. These are used to convert radii and torque propagation.</p>
        <p class="hint">Tip: Use <code>mm</code> for radii unless you are working in inches.</p>
      </div>
    </div>

    <div class="section" id="sec-gears" style="border-bottom:1px solid #e6eef7; padding:10px 0;">
      <div class="header" style="cursor:pointer;"><h3>2. Add & Configure Gears</h3><div class="muted">types, teeth, radius, connects</div></div>
      <div class="body" style="display:none; padding:8px 0;">
        <p>Click <code>+ Add Gear</code> to add rows. Each row contains:</p>
        <ul>
          <li><strong>Type:</strong> Spur/Helical/Bevel/Internal</li>
          <li><strong>Teeth:</strong> number of teeth</li>
          <li><strong>Radius:</strong> pitch radius (your chosen length unit)</li>
          <li><strong>Connects (csv):</strong> gear index(s) this gear drives — <em>use gear numbers like 0,1,2</em>.</li>
        </ul>
        <p class="hint">Important: <strong>Connects</strong> must be gear indices, not radii/teeth. Example chain: <code>0 → 1 → 2</code>.</p>
      </div>
    </div>

    <div class="section" id="sec-connect" style="border-bottom:1px solid #e6eef7; padding:10px 0;">
      <div class="header" style="cursor:pointer;"><h3>3. Connecting Gears (Examples)</h3><div class="muted">how to avoid cycles</div></div>
      <div class="body" style="display:none; padding:8px 0;">
        <p><strong>Valid chain</strong> (linear):</p>
        <pre><code>Gear 0 connects: 1
Gear 1 connects: 2
Gear 2 connects: (empty)</code></pre>
        <p><strong>Invalid (cycle):</strong> 0 → 1 → 2 → 0 — the app will show a cycle error.</p>
      </div>
    </div>

    <div class="section" id="sec-presets" style="border-bottom:1px solid #e6eef7; padding:10px 0;">
      <div class="header" style="cursor:pointer;"><h3>Presets & Auto-fill</h3><div class="muted">try an example instantly</div></div>
      <div class="body" style="display:none; padding:8px 0;">
        <p>Click a preset to auto-fill the form with example gears. After auto-fill, press <strong>Calculate</strong>.</p>
        <div id="presets-container" style="display:flex;flex-direction:column; gap:8px;"></div>
      </div>
    </div>

    <div class="section" id="sec-troubleshoot" style="padding:10px 0;">
      <div class="header" style="cursor:pointer;"><h3>Troubleshooting</h3><div class="muted">quick fixes</div></div>
      <div class="body" style="display:none; padding:8px 0;">
        <ul>
          <li><strong>Error: Cycle detected</strong> — check your Connects values for loops or wrong indexes.</li>
          <li><strong>Wrong RPM/Torque</strong> — verify gear teeth and radius are realistic; module should be radius/teeth.</li>
          <li><strong>Graph not updating</strong> — make sure first gear (#0) has RPM & Torque inputs set.</li>
        </ul>
      </div>
    </div>

    <div style="margin-top:14px;">
      <a class="btn-inline" id="open-tutorial-video" href="#" title="Open tutorial (if available)">Open short tutorial</a>
      <span style="margin-left:12px" class="muted">Need a simpler UI? Ask for <strong>Auto-connect</strong> or <strong>Dropdown connects</strong>.</span>
    </div>
  `;

  // wire up collapsibles
  Array.from(root.querySelectorAll('.section')).forEach(sec => {
    const header = sec.querySelector('.header');
    header.addEventListener('click', () => toggleSection(sec));
    if (sec.id === 'sec-basics' || sec.id === 'sec-gears') {
      const b = sec.querySelector('.body');
      if (b) b.style.display = 'block';
    }
  });

  // render presets
  const presetsContainer = root.querySelector('#presets-container');
  Object.entries(PRESETS).forEach(([name, preset]) => {
    const box = document.createElement('div');
    box.className = 'preset';
    box.style.display = 'flex'; box.style.justifyContent = 'space-between'; box.style.alignItems = 'center';
    box.innerHTML = `
      <div class="meta">
        <strong>${name}</strong>
        <div class="muted" style="font-size:13px">${preset.gears.length} gears • RPM ${preset.rpm} • Torque ${preset.torque} ${preset.torque_unit || ''}</div>
      </div>
      <div>
        <button data-preset="${encodeURIComponent(name)}" class="btn">Auto-Fill</button>
      </div>
    `;
    presetsContainer.appendChild(box);
    box.querySelector('button').addEventListener('click', () => { autoFillPreset(preset); });
  });

  const tut = root.querySelector('#open-tutorial-video');
  if (tut) tut.addEventListener('click', (e) => { e.preventDefault(); alert('Tutorial feature not configured — add a video here.'); });
}

function autoFillPreset(preset) {
  try {
    let rows = Array.from(document.querySelectorAll('.gear-row'));
    const addBtn = document.querySelector('#addGear') || document.querySelector('#add-gear-btn') || document.querySelector('.add-gear');
    while (rows.length < preset.gears.length) {
      if (addBtn) addBtn.click();
      else if (typeof addGear === 'function') addGear();
      rows = Array.from(document.querySelectorAll('.gear-row'));
    }
    const rpmInput = document.querySelector('#rpm') || document.querySelector('[data-input-rpm]');
    const torqueInput = document.querySelector('#torque') || document.querySelector('[data-input-torque]');
    const lengthUnit = document.querySelector('#unit') || document.querySelector('[data-length-unit]');
    const torqueUnit = document.querySelector('#torqueUnit') || document.querySelector('[data-torque-unit]');
    if (rpmInput) rpmInput.value = preset.rpm;
    if (torqueInput) torqueInput.value = preset.torque;
    if (lengthUnit) lengthUnit.value = preset.unit || 'mm';
    if (torqueUnit) torqueUnit.value = preset.torque_unit || 'Nm';
    preset.gears.forEach((g, i) => {
      const row = document.getElementById(`gear-${i}`);
      if (!row) return;
      const typeEl = row.querySelector(`#type-${i}`); const teethEl = row.querySelector(`#teeth-${i}`);
      const radiusEl = row.querySelector(`#radius-${i}`); const moduleEl = row.querySelector(`#module-${i}`);
      const connectsEl = row.querySelector(`#connects-${i}`); const meshEl = row.querySelector(`#mesh-${i}`);
      if (typeEl) { if (typeEl.tagName.toLowerCase() === 'select') { typeEl.value = g.type || typeEl.options[0].value; typeEl.dispatchEvent(new Event('change', { bubbles: true })); } else typeEl.value = g.type || ''; }
      if (teethEl) teethEl.value = g.teeth || '';
      if (radiusEl) radiusEl.value = g.radius || '';
      if (moduleEl) moduleEl.value = g.module || '';
      if (connectsEl) connectsEl.value = g.connects || '';
      if (meshEl) meshEl.value = g.mesh_eff || (g.mesh_eff === 0 ? 0 : 98);
    });
    const calcBtn = document.querySelector('#calcBtn') || document.querySelector('.calculate-btn') || document.querySelector('#calculate-btn');
    if (calcBtn) { calcBtn.scrollIntoView({behavior: 'smooth'}); calcBtn.classList.add('highlight'); setTimeout(()=>calcBtn.classList.remove('highlight'), 1500); }
    alert('Preset applied. Press Calculate to compute results.');
  } catch (err) { console.error('AutoFill error', err); alert('Auto-fill failed — your form selectors differ.'); }
}

function loadHelpContent() {
  ensureHelpRoot();
  const root = document.getElementById('help-root');
  if (!root) return;
  root.innerHTML = `<h1>Help & User Guide</h1><p>Welcome to <strong>GearMatrix Pro</strong>... (short help)</p>`;
}

// ---------- Single robust sidebar + overlay manager ----------
(function sidebarManager(){
  const overlay = document.getElementById('mobileOverlay') || (()=>{
    const o = document.createElement('div'); o.className='mobile-overlay'; o.id='mobileOverlay'; document.body.appendChild(o); return o;
  })();
  const sidebar = document.querySelector('.sidebar');
  const hb = document.getElementById('hamburgerBtn') || document.querySelector('[data-toggle="sidebar"]');
  if(!sidebar || !hb) { console.warn('Sidebar manager: sidebar or hamburger button not found.'); return; }
  Array.from(document.querySelectorAll('.mobile-overlay')).slice(1).forEach(e => e.remove());
  function openSidebar(){ sidebar.classList.add('open'); overlay.classList.add('show'); overlay.setAttribute('aria-hidden','false'); if(window.innerWidth < 700) document.documentElement.style.overflow = 'hidden'; overlay.style.zIndex = getComputedStyle(document.documentElement).getPropertyValue('--gm-overlay-z') || '50'; sidebar.style.zIndex = getComputedStyle(document.documentElement).getPropertyValue('--gm-sidebar-z') || '60'; }
  function closeSidebar(){ sidebar.classList.remove('open'); overlay.classList.remove('show'); overlay.setAttribute('aria-hidden','true'); document.documentElement.style.overflow = ''; }
  hb.addEventListener('click', (e) => { e.stopPropagation(); if(sidebar.classList.contains('open')) closeSidebar(); else openSidebar(); });
  overlay.addEventListener('click', closeSidebar);
  sidebar.addEventListener('click', (e) => { e.stopPropagation(); const a = e.target.closest('a'); if(a && window.innerWidth < 700) setTimeout(closeSidebar, 120); });
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closeSidebar(); });
  window.addEventListener('resize', () => { if(window.innerWidth >= 700) { overlay.classList.remove('show'); sidebar.classList.remove('open'); document.documentElement.style.overflow = ''; } });
})();

// initial hook
document.addEventListener('DOMContentLoaded', ()=>{
  console.log('app.js loaded', new Date().toISOString());
  initSidebarNav();
  const defaultNav = document.querySelector('[data-view="designer"]') || document.querySelector('.sidebar nav a');
  if (defaultNav) defaultNav.click();
  ensureHelpRoot();
  if (typeof renderHelp === 'function') renderHelp();
});
