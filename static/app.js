// app.js — Feature-rich frontend for GearMatrix Pro (patched)
// Changes: added showSection(), safer help initialization, autoFillPreset adapted to your DOM
let gearCount = 0;
let chart = null;
let lastCalc = null;

// utility
const $ = id => document.getElementById(id);
const api = (path, opts={}) => fetch(path, opts).then(r=>r.json());

// ----------------- Navigation & theme -----------------
document.querySelectorAll('.sidebar nav li').forEach(li=>{
  li.addEventListener('click', ()=> {
    document.querySelectorAll('.sidebar nav li').forEach(x=>x.classList.remove('active'));
    li.classList.add('active');
    const view = li.getAttribute('data-view');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    // if data-view provided, show it
    if (view) {
      const el = document.getElementById(view);
      if (el) el.classList.remove('hidden');
      // if help view opened, render help content
      if (view === 'help-section') {
        // ensure help-root exists
        ensureHelpRoot();
        if (typeof renderHelp === 'function') renderHelp();
        else if (typeof loadHelpContent === 'function') loadHelpContent();
      }
    }
  });
});

// Keep the manual help-tab listener but call the unified helper so no error
const helpTabEl = document.getElementById("help-tab");
if (helpTabEl) helpTabEl.addEventListener("click", function () {
    // prefer to use existing nav mechanics if data-view is set, otherwise call showSection
    const view = helpTabEl.getAttribute('data-view') || "help-section";
    showSection(view);
});

// --- Small helper to show a section by id (keeps existing nav logic consistent) ---
function showSection(sectionId) {
  // hide all views
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.classList.remove('hidden');

  // if it's help-section, ensure help-root exists and render help
  if (sectionId === 'help-section') {
    ensureHelpRoot();
    if (typeof renderHelp === 'function') {
      renderHelp();
    } else if (typeof loadHelpContent === 'function') {
      loadHelpContent();
    }
  }
}

// ensure #help-root exists inside #help-section (so renderHelp can safely write)
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

// Apply theme based on localStorage value (or default 'light')
function applyTheme() {
  const t = localStorage.getItem('gm-theme') || 'light';

  if (t === 'dark') {
    // Set CSS variables for dark theme
    document.documentElement.style.setProperty('--bg', '#071023');
    document.documentElement.style.setProperty('--card', '#071422');
    document.documentElement.style.setProperty('--text', '#e6f7ff');
    document.documentElement.style.setProperty('--muted', '#9fb4c6');
    document.documentElement.style.setProperty('--accent', '#0ea5e9');
    if (themeToggle) themeToggle.textContent = 'Light';
  } else {
    // Set CSS variables for light theme
    document.documentElement.style.setProperty('--bg', '#ffffff');
    document.documentElement.style.setProperty('--card', '#fff');
    document.documentElement.style.setProperty('--text', '#0f172a');
    document.documentElement.style.setProperty('--muted', '#64748b');
    document.documentElement.style.setProperty('--accent', '#0ea5e9');
    if (themeToggle) themeToggle.textContent = 'Dark';
  }

  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || (t === 'dark' ? '#071023' : '#ffffff');
  document.body.style.background = bg;
}

// Toggle handler — flips the value and reapplies
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const cur = localStorage.getItem('gm-theme') || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    localStorage.setItem('gm-theme', next);
    applyTheme();
  });
}

// Ensure theme is applied on load
applyTheme();
// ----------------------------------------------------------------


// ----------------- Login modal (mock) -----------------
if ($('openLogin')) $('openLogin').addEventListener('click', ()=> $('loginModal').classList.remove('hidden'));
if ($('loginCancel')) $('loginCancel').addEventListener('click', ()=> $('loginModal').classList.add('hidden'));
if ($('loginSubmit')) $('loginSubmit').addEventListener('click', ()=>{
  const u = $('loginUser').value, p = $('loginPass').value;
  if(!u){ alert('enter user'); return; }
  localStorage.setItem('gm-user', JSON.stringify({user:u, ts:Date.now()}));
  $('loginModal').classList.add('hidden');
  alert('Logged in as ' + u + ' (mock)');
});

// ----------------- Gear row UI -----------------
function addGear(preset={}) {
  const container = $('gears');
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

  // if preset contains a type, set it
  if (preset.type) {
    const sel = document.getElementById(`type-${id}`);
    if (sel) sel.value = preset.type;
  }
}
function removeGear(id){ const el = $('gear-'+id); if(el) el.remove(); }

// initial gear
addGear();

// ----------------- API actions -----------------
if ($('addGear')) $('addGear').addEventListener('click', ()=> addGear());
if ($('calcBtn')) $('calcBtn').addEventListener('click', calculate);

// save/list/load
if ($('saveSet')) $('saveSet').addEventListener('click', async()=>{
  const name = prompt('Set name (alphanumeric)');
  if(!name) return;
  const payload = buildPayload();
  payload.name = name;
  const r = await api('/api/save-set', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  if(r.error) alert('Save failed: '+r.error); else alert('Saved: '+r.filename);
});
if ($('listSets')) $('listSets').addEventListener('click', async()=>{
  const r = await api('/api/list-sets');
  if(r.sets) {
    const out = r.sets.map(s=>`<div><a href="#" onclick="loadSet('${s}')">${s}</a></div>`).join('');
    if ($('savedList')) $('savedList').innerHTML = out || '(no sets)';
    // jump to Saved tab
    const savedNav = document.querySelector('[data-view="saved"]');
    if (savedNav) savedNav.click();
  }
});

window.loadSet = async (name) => {
  const r = await api('/api/load-set/' + encodeURIComponent(name));
  if(r.error) { alert(r.error); return; }
  // populate UI
  // clear current
  $('gears').innerHTML=''; gearCount=0;
  if (r.rpm_input) { if ($('rpm')) $('rpm').value = r.rpm_input; }
  if (r.torque_input) { if ($('torque')) $('torque').value = r.torque_input; }
  (r.gears || []).forEach(g => addGear(g));
  alert('Loaded set: '+name);
  const designerNav = document.querySelector('[data-view="designer"]');
  if (designerNav) designerNav.click();
};

// export CSV via backend (requires lastCalc)
if ($('exportCsv')) $('exportCsv').addEventListener('click', async ()=>{
  if(!lastCalc){ alert('Run calculation first'); return; }
  const res = await fetch('/api/export-csv', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(lastCalc)});
  if(!res.ok){ const err = await res.json(); alert('Export failed: '+(err.error||res.statusText)); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'gearmatrix_export.csv'; a.click();
});

// export PDF (client-side)
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
    doc.text(lines[i].substring(0,120), 14, y);
    y+=5;
  }
  doc.save('gearmatrix_report.pdf');
});

// ----------------- Build payload -----------------
function buildPayload(){
  const unit = $('unit') ? $('unit').value : (document.querySelector('[data-length-unit]') ? document.querySelector('[data-length-unit]').value : 'mm');
  const torqueUnit = $('torqueUnit') ? $('torqueUnit').value : (document.querySelector('[data-torque-unit]') ? document.querySelector('[data-torque-unit]').value : 'Nm');
  const rpm = $('rpm') ? $('rpm').value : (document.querySelector('[data-input-rpm]') ? document.querySelector('[data-input-rpm]').value : 0);
  const torque = $('torque') ? $('torque').value : (document.querySelector('[data-input-torque]') ? document.querySelector('[data-input-torque]').value : 0);
  const gears = [];
  for(let i=0;i<gearCount;i++){
    const row = $('gear-'+i);
    if(!row) continue;
    const getVal = id => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };
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

// ----------------- Calculation -----------------
async function calculate(){
  const payload = buildPayload();
  const res = await fetch('/api/calc', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  const data = await res.json();
  if(data.error){ if ($('resultText')) $('resultText').textContent = 'Error: '+data.error; return; }
  lastCalc = data;
  if ($('resultText')) $('resultText').textContent = JSON.stringify(data, null, 2);
  drawChart(data);
  drawDiagram(payload, data);
}

// ----------------- Chart (Chart.js with zoom) -----------------
function drawChart(data){
  const gearStates = data.gear_states || {};
  const idxs = Object.keys(gearStates).map(Number).sort((a,b)=>a-b);
  const rpms = idxs.map(i => gearStates[i].rpm || 0);
  const torques = idxs.map(i => gearStates[i].torque || 0);
  const canvas = $('chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: idxs,
      datasets: [
        { label:'RPM', data: rpms, borderColor:'#0284c7', tension:0.2, fill:false },
        { label:'Torque (Nm)', data: torques, borderColor:'#ef4444', tension:0.2, fill:false }
      ]
    },
    options: {
      responsive:true,
      plugins: {
        zoom: {
          pan: { enabled:true, mode:'x' },
          zoom: { wheel:{enabled:true}, pinch:{enabled:true}, mode:'x' }
        }
      }
    }
  });
}

// ----------------- Simple 2D Gear Diagram -----------------
function drawDiagram(payload, calcData){
  const container = $('diagramArea');
  if (!container) return;
  container.innerHTML = ''; // clear
  const gears = payload.gears || [];
  if(gears.length===0){ container.innerHTML = '<em>No gears</em>'; return; }
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS,'svg');
  svg.setAttribute('width','100%'); svg.setAttribute('height','360'); svg.setAttribute('viewBox','0 0 1200 360');
  let x = 80;
  const scale = 2.5; // scale radii to px
  const centers = [];
  gears.forEach((g,i)=>{
    const r = Math.max(6, Number(g.radius||50) * scale / 10);
    const cy = 180;
    const cx = x;
    centers.push({cx,cy,r});
    x += r*2 + 40; // spacing
  });
  // draw links (if connects provided)
  gears.forEach((g,i)=>{
    const conns = (g.connects||'').split(',').map(s=>s.trim()).filter(s=>s!=='').map(Number);
    conns.forEach(c=>{
      if(centers[c]){
        const line = document.createElementNS(svgNS,'line');
        line.setAttribute('x1', centers[i].cx); line.setAttribute('y1', centers[i].cy);
        line.setAttribute('x2', centers[c].cx); line.setAttribute('y2', centers[c].cy);
        line.setAttribute('stroke','#cbd5e1'); line.setAttribute('stroke-width','2');
        svg.appendChild(line);
      }
    });
  });
  // draw gears
  centers.forEach((ct,i)=>{
    const ggroup = document.createElementNS(svgNS,'g');
    const circle = document.createElementNS(svgNS,'circle');
    circle.setAttribute('cx', ct.cx); circle.setAttribute('cy', ct.cy); circle.setAttribute('r', ct.r);
    circle.setAttribute('fill','#f8fafc'); circle.setAttribute('stroke','#94a3b8'); circle.setAttribute('stroke-width','2');
    ggroup.appendChild(circle);
    const text = document.createElementNS(svgNS,'text');
    text.setAttribute('x', ct.cx); text.setAttribute('y', ct.cy+4); text.setAttribute('text-anchor','middle');
    text.setAttribute('font-size','12'); text.setAttribute('fill','#0f172a'); text.textContent = `G${i}`;
    ggroup.appendChild(text);
    ggroup.style.transformOrigin = `${ct.cx}px ${ct.cy}px`;
    ggroup.style.animation = `spin ${8 - (i%5)}s linear infinite`;
    svg.appendChild(ggroup);
  });
  container.appendChild(svg);
}

// initial hook
document.addEventListener('DOMContentLoaded', ()=>{
  // default nav
  const defaultNav = document.querySelector('[data-view="designer"]') || document.querySelector('.sidebar nav li');
  if (defaultNav) defaultNav.click();
  // prepare help content skeleton so it's ready when user opens Help
  ensureHelpRoot();
  if (typeof renderHelp === 'function') renderHelp();
});

// ---------- Help / Guide renderer ----------
function makeNodeFromHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function toggleSection(el) {
  const body = el.querySelector('.body');
  if (!body) return;
  const isOpen = body.style.display === 'block';
  body.style.display = isOpen ? 'none' : 'block';
}

// Example presets (you can add more)
const PRESETS = {
  "Simple 2-stage reducer": {
    rpm: 1500, torque: 8, unit: 'mm', torque_unit: 'Nm',
    gears: [
      {type:'Spur', teeth:20, radius:50, connects: '1'},
      {type:'Spur', teeth:40, radius:100, connects: ''},
    ]
  },
  "3-stage Helical chain": {
    rpm:1000, torque: 10, unit:'mm', torque_unit:'Nm',
    gears: [
      {type:'Helical', teeth:18, radius:30, connects: '1'},
      {type:'Helical', teeth:36, radius:60, connects: '2'},
      {type:'Helical', teeth:18, radius:30, connects: ''},
    ]
  }
};

// Render the guide HTML into #help-root
function renderHelp() {
  // ensure help-root exists
  ensureHelpRoot();
  const root = document.getElementById('help-root');
  if (!root) return;
  root.innerHTML = ''; // reset

  const html = `
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

  root.innerHTML = html;

  // wire up collapsibles
  Array.from(root.querySelectorAll('.section')).forEach(sec => {
    const header = sec.querySelector('.header');
    header.addEventListener('click', () => toggleSection(sec));
    // default first two open
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

    box.querySelector('button').addEventListener('click', () => {
      autoFillPreset(preset);
    });
  });

  // optional: tutorial link
  const tut = root.querySelector('#open-tutorial-video');
  if (tut) {
    tut.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Tutorial feature not configured — you can add an embedded YouTube or video here.');
    });
  }
}

/* Auto-fill function adapted to your form structure.
   Your addGear() creates rows with:
     - div.gear-row id="gear-<i>"
     - select#type-<i>, input#teeth-<i>, input#radius-<i>, input#module-<i>, input#connects-<i>, input#mesh-<i>
*/
function autoFillPreset(preset) {
  try {
    // find existing gear rows; if not enough, click the "+ Add Gear" button
    let rows = Array.from(document.querySelectorAll('.gear-row'));
    const addBtn = document.querySelector('#addGear') || document.querySelector('#add-gear-btn') || document.querySelector('.add-gear');

    // ensure enough rows
    while (rows.length < preset.gears.length) {
      if (addBtn) {
        addBtn.click();
      } else {
        // fallback: call addGear() directly if button not found
        if (typeof addGear === 'function') addGear();
      }
      rows = Array.from(document.querySelectorAll('.gear-row'));
    }

    // fill top-level inputs (RPM, torque, units)
    const rpmInput = document.querySelector('#rpm') || document.querySelector('[data-input-rpm]');
    const torqueInput = document.querySelector('#torque') || document.querySelector('[data-input-torque]');
    const lengthUnit = document.querySelector('#unit') || document.querySelector('[data-length-unit]');
    const torqueUnit = document.querySelector('#torqueUnit') || document.querySelector('[data-torque-unit]');

    if (rpmInput) rpmInput.value = preset.rpm;
    if (torqueInput) torqueInput.value = preset.torque;
    if (lengthUnit) lengthUnit.value = preset.unit || 'mm';
    if (torqueUnit) torqueUnit.value = preset.torque_unit || 'Nm';

    // fill gear rows using your actual id-based inputs
    preset.gears.forEach((g, i) => {
      const row = document.getElementById(`gear-${i}`);
      if (!row) return;
      const typeEl = row.querySelector(`#type-${i}`);
      const teethEl = row.querySelector(`#teeth-${i}`);
      const radiusEl = row.querySelector(`#radius-${i}`);
      const moduleEl = row.querySelector(`#module-${i}`);
      const connectsEl = row.querySelector(`#connects-${i}`);
      const meshEl = row.querySelector(`#mesh-${i}`);

      if (typeEl) {
        if (typeEl.tagName.toLowerCase() === 'select') {
          typeEl.value = g.type || typeEl.options[0].value;
          typeEl.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          typeEl.value = g.type || '';
        }
      }
      if (teethEl) teethEl.value = g.teeth || '';
      if (radiusEl) radiusEl.value = g.radius || '';
      if (moduleEl) moduleEl.value = g.module || '';
      if (connectsEl) connectsEl.value = g.connects || '';
      if (meshEl) meshEl.value = g.mesh_eff || (g.mesh_eff === 0 ? 0 : 98);
    });

    // highlight calculate button if present
    const calcBtn = document.querySelector('#calcBtn') || document.querySelector('.calculate-btn') || document.querySelector('#calculate-btn');
    if (calcBtn) {
      calcBtn.scrollIntoView({behavior: 'smooth'});
      calcBtn.classList.add('highlight');
      setTimeout(()=>calcBtn.classList.remove('highlight'), 1500);
    }

    alert('Preset applied. Press Calculate to compute results.');
  } catch (err) {
    console.error('AutoFill error', err);
    alert('Auto-fill failed — your form selectors differ. I can adapt the function if you paste your gear row HTML structure.');
  }
}

// ---------- Simple fallback loader (kept for backward compatibility) ----------
function loadHelpContent() {
    ensureHelpRoot();
    document.getElementById("help-root").innerHTML = `
        <h1>Help & User Guide</h1>
        <p>Welcome to <strong>GearMatrix Pro</strong>. This guide explains everything you need to design, calculate, and validate multi-stage gear systems.</p>

        <h2>1. Designer Section</h2>
        <ul>
            <li>Enter <strong>Input RPM</strong> and <strong>Input Torque</strong>.</li>
            <li>Select units for torque and length.</li>
            <li>Click <strong>+ Add Gear</strong> to insert gears.</li>
            <li>Select gear type: Spur, Helical, Bevel, or Internal.</li>
            <li>Enter teeth and module.</li>
            <li>Use the field <strong>Connects (csv)</strong> to specify which gears mesh.</li>
            <li>Click <strong>Calculate</strong> to compute RPM & torque across all stages.</li>
        </ul>

        <h2>2. Diagram Section</h2>
        <ul>
            <li>Shows a real-time schematic of your gear system.</li>
            <li>Use it to visually confirm gear connectivity.</li>
        </ul>

        <h2>3. Saved Sets</h2>
        <ul>
            <li>Store your configurations using <strong>Save Set</strong>.</li>
            <li>Load previous gear trains using <strong>List Saved</strong>.</li>
        </ul>

        <h2>4. Export Tools</h2>
        <ul>
            <li><strong>Export CSV</strong> → gear data for spreadsheets.</li>
            <li><strong>Export PDF</strong> → complete design + calculations.</li>
        </ul>

        <h2>5. Common Errors</h2>
        <ul>
            <li><strong>Error: Cycle detected</strong> → gear connection loop; fix the chain.</li>
            <li><strong>Module mismatch</strong> → gears mesh only if modules match.</li>
            <li><strong>Impossible tooth counts</strong> → check if gear ratio is realistic.</li>
        </ul>

        <h2>6. Tips</h2>
        <ul>
            <li>Use different gear types to simulate complex gearboxes.</li>
            <li>Internal gears reverse rotation behavior.</li>
            <li>Export results to document your design workflow.</li>
        </ul>

        <p><strong>You're all set—GearMatrix Pro is your digital gearbox engineer!</strong></p>
    `;
}
// ---------- end help renderer ----------
// mobile sidebar toggle
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.sidebar');
  const openBtn = document.querySelector('#hamburgerBtn'); // add this id to burger
  const overlay = document.createElement('div');
  overlay.className = 'mobile-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 40, display: 'none'
  });
  document.body.appendChild(overlay);

  function openSidebar(){
    if(!sidebar) return;
    sidebar.classList.add('open');
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar(){
    if(!sidebar) return;
    sidebar.classList.remove('open');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  if(openBtn){
    openBtn.addEventListener('click', () => {
      if(sidebar.classList.contains('open')) closeSidebar();
      else openSidebar();
    });
  }
  overlay.addEventListener('click', closeSidebar);

  // close on swipe left for mobile (simple)
  let startX = null;
  sidebar.addEventListener('touchstart', e => startX = e.touches[0].clientX, {passive:true});
  sidebar.addEventListener('touchend', e => {
    if(!startX) return;
    const endX = e.changedTouches[0].clientX;
    if (startX - endX > 60) closeSidebar();
    startX = null;
  }, {passive:true});
});
const ctx = document.getElementById('myChart');
const myChart = new Chart(ctx, {
  type: 'line',
  data: {...},
  options: {
    responsive: true,
    maintainAspectRatio: false, // allows height control via CSS
    // other options
  }
});

