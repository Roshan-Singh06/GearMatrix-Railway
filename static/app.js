// app.js — Feature-rich frontend for GearMatrix Pro
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
    document.getElementById(view).classList.remove('hidden');
  });
});


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
    // update button label so user knows current action
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

  // Also ensure body uses the --bg var immediately
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
$('openLogin').addEventListener('click', ()=> $('loginModal').classList.remove('hidden'));
$('loginCancel').addEventListener('click', ()=> $('loginModal').classList.add('hidden'));
$('loginSubmit').addEventListener('click', ()=>{
  const u = $('loginUser').value, p = $('loginPass').value;
  if(!u){ alert('enter user'); return; }
  // mock: store user
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
}
function removeGear(id){ const el = $('gear-'+id); if(el) el.remove(); }

// initial gear
addGear();

// ----------------- API actions -----------------
$('addGear').addEventListener('click', ()=> addGear());
$('calcBtn').addEventListener('click', calculate);

// save/list/load
$('saveSet').addEventListener('click', async()=>{
  const name = prompt('Set name (alphanumeric)');
  if(!name) return;
  const payload = buildPayload();
  payload.name = name;
  const r = await api('/api/save-set', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  if(r.error) alert('Save failed: '+r.error); else alert('Saved: '+r.filename);
});
$('listSets').addEventListener('click', async()=>{
  const r = await api('/api/list-sets');
  if(r.sets) {
    const out = r.sets.map(s=>`<div><a href="#" onclick="loadSet('${s}')">${s}</a></div>`).join('');
    $('savedList').innerHTML = out || '(no sets)';
    // jump to Saved tab
    document.querySelector('[data-view="saved"]').click();
  }
});

window.loadSet = async (name) => {
  const r = await api('/api/load-set/' + encodeURIComponent(name));
  if(r.error) { alert(r.error); return; }
  // populate UI
  // clear current
  $('gears').innerHTML=''; gearCount=0;
  $('rpm').value = r.rpm_input || $('rpm').value;
  $('torque').value = r.torque_input || $('torque').value;
  (r.gears || []).forEach(g => addGear(g));
  alert('Loaded set: '+name);
  document.querySelector('[data-view="designer"]').click();
};

// export CSV via backend (requires lastCalc)
$('exportCsv').addEventListener('click', async ()=>{
  if(!lastCalc){ alert('Run calculation first'); return; }
  // backend expects POST /api/export-csv with last_result payload
  const res = await fetch('/api/export-csv', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(lastCalc)});
  if(!res.ok){ const err = await res.json(); alert('Export failed: '+(err.error||res.statusText)); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'gearmatrix_export.csv'; a.click();
});

// export PDF (client-side)
$('exportPdf').addEventListener('click', async ()=>{
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
  const unit = $('unit').value;
  const torqueUnit = $('torqueUnit').value;
  const rpm = $('rpm').value; const torque = $('torque').value;
  const gears = [];
  for(let i=0;i<gearCount;i++){
    const row = $('gear-'+i);
    if(!row) continue;
    gears.push({
      type: $('type-'+i).value,
      teeth: $('teeth-'+i).value,
      radius: $('radius-'+i).value,
      module: $('module-'+i).value,
      connects: $('connects-'+i).value,
      mesh_eff: $('mesh-'+i).value
    });
  }
  return { unit, torque_unit: torqueUnit, rpm_input: rpm, torque_input: torque, gears };
}

// ----------------- Calculation -----------------
async function calculate(){
  const payload = buildPayload();
  const res = await fetch('/api/calc', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  const data = await res.json();
  if(data.error){ $('resultText').textContent = 'Error: '+data.error; return; }
  lastCalc = data;
  $('resultText').textContent = JSON.stringify(data, null, 2);
  drawChart(data);
  drawDiagram(payload, data);
}

// ----------------- Chart (Chart.js with zoom) -----------------
function drawChart(data){
  const gearStates = data.gear_states || {};
  const idxs = Object.keys(gearStates).map(Number).sort((a,b)=>a-b);
  const rpms = idxs.map(i => gearStates[i].rpm || 0);
  const torques = idxs.map(i => gearStates[i].torque || 0);
  const ctx = $('chart').getContext('2d');
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
  container.innerHTML = ''; // clear
  // compute simple layout: place gears on a horizontal line, x positions accumulate radius
  const gears = payload.gears || [];
  if(gears.length===0){ container.innerHTML = '<em>No gears</em>'; return; }
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS,'svg');
  svg.setAttribute('width','100%'); svg.setAttribute('height','360'); svg.setAttribute('viewBox','0 0 1200 360');
  let x = 80;
  const scale = 2.5; // scale radii to px
  // store centers
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
    // small rotate animation
    ggroup.style.transformOrigin = `${ct.cx}px ${ct.cy}px`;
    ggroup.style.animation = `spin ${8 - (i%5)}s linear infinite`;
    svg.appendChild(ggroup);
  });
  container.appendChild(svg);
}

// initial hook
document.addEventListener('DOMContentLoaded', ()=>{
  // default nav
  document.querySelector('[data-view="designer"]').click();
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
  const root = document.getElementById('help-root');
  if (!root) return;
  root.innerHTML = ''; // reset

  const html = `
    <div class="guide-title">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style="flex:0 0 36px;">
        <circle cx="12" cy="12" r="11" stroke="#0ea5e9" stroke-width="1.6" fill="#e6f7ff"/>
        <path d="M8 12h8M8 8h8" stroke="#0369a1" stroke-width="1.4" stroke-linecap="round" />
      </svg>
      <h2 class="guide-title">GearMatrix Pro — Quick Guide</h2>
    </div>

    <div class="section" id="sec-basics">
      <div class="header"><h3>1. Basics (Input RPM & Torque)</h3><div class="muted">click to expand</div></div>
      <div class="body">
        <p>Enter your driving <strong>RPM</strong> and <strong>Torque</strong>. Choose length & torque units. These are used to convert radii and torque propagation.</p>
        <p class="hint">Tip: Use <code>mm</code> for radii unless you are working in inches.</p>
      </div>
    </div>

    <div class="section" id="sec-gears">
      <div class="header"><h3>2. Add & Configure Gears</h3><div class="muted">types, teeth, radius, connects</div></div>
      <div class="body">
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

    <div class="section" id="sec-connect">
      <div class="header"><h3>3. Connecting Gears (Examples)</h3><div class="muted">how to avoid cycles</div></div>
      <div class="body">
        <p><strong>Valid chain</strong> (linear):</p>
        <pre><code>Gear 0 connects: 1
Gear 1 connects: 2
Gear 2 connects: (empty)</code></pre>
        <p><strong>Invalid (cycle):</strong> 0 → 1 → 2 → 0 — the app will show a cycle error.</p>
      </div>
    </div>

    <div class="section" id="sec-presets">
      <div class="header"><h3>Presets & Auto-fill</h3><div class="muted">try an example instantly</div></div>
      <div class="body">
        <p>Click a preset to auto-fill the form with example gears. After auto-fill, press <strong>Calculate</strong>.</p>
        <div id="presets-container"></div>
      </div>
    </div>

    <div class="section" id="sec-troubleshoot">
      <div class="header"><h3>Troubleshooting</h3><div class="muted">quick fixes</div></div>
      <div class="body">
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
      sec.querySelector('.body').style.display = 'block';
    }
  });

  // render presets
  const presetsContainer = root.querySelector('#presets-container');
  Object.entries(PRESETS).forEach(([name, preset]) => {
    const box = document.createElement('div');
    box.className = 'preset';
    box.innerHTML = `
      <div class="meta">
        <strong>${name}</strong>
        <div class="muted" style="font-size:13px">${preset.gears.length} gears • RPM ${preset.rpm} • Torque ${preset.torque} ${preset.torque_unit || ''}</div>
      </div>
      <div>
        <button data-preset="${encodeURIComponent(name)}">Auto-Fill</button>
      </div>
    `;
    presetsContainer.appendChild(box);

    box.querySelector('button').addEventListener('click', () => {
      autoFillPreset(preset);
    });
  });

  // optional: tutorial link
  const tut = root.querySelector('#open-tutorial-video');
  tut.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Tutorial feature not configured — you can add an embedded YouTube or video here.');
  });
}

/* Auto-fill function: best attempt to populate your gear inputs.
   You will probably need to adapt selectors to your form structure.
   The function assumes:
   - gear rows are DOM elements with class "gear-row"
   - within each row: select elements / inputs with data attributes (data-gear-type, data-teeth, data-radius, data-connects)
*/
function autoFillPreset(preset) {
  try {
    // SELECTORS YOU MAY NEED TO ADJUST:
    const gearRowSelector = '.gear-row'; // container for each gear (0..N-1)
    const typeSelector = '[data-gear-type]';
    const teethSelector = '[data-teeth]';
    const radiusSelector = '[data-radius]';
    const connectsSelector = '[data-connects]';

    // find existing gear rows; if not enough, click the "+ Add Gear" button
    let rows = Array.from(document.querySelectorAll(gearRowSelector));
    const addBtn = document.querySelector('#add-gear-btn') || document.querySelector('.add-gear'); // fallback selectors

    // ensure enough rows
    while (rows.length < preset.gears.length) {
      if (addBtn) addBtn.click();
      // allow DOM update
      rows = Array.from(document.querySelectorAll(gearRowSelector));
    }

    // fill top-level inputs (RPM, torque, units)
    const rpmInput = document.querySelector('#input-rpm') || document.querySelector('[data-input-rpm]');
    const torqueInput = document.querySelector('#input-torque') || document.querySelector('[data-input-torque]');
    const lengthUnit = document.querySelector('#length-unit') || document.querySelector('[data-length-unit]');
    const torqueUnit = document.querySelector('#torque-unit') || document.querySelector('[data-torque-unit]');

    if (rpmInput) rpmInput.value = preset.rpm;
    if (torqueInput) torqueInput.value = preset.torque;
    if (lengthUnit) lengthUnit.value = preset.unit || 'mm';
    if (torqueUnit) torqueUnit.value = preset.torque_unit || 'Nm';

    // fill gear rows
    preset.gears.forEach((g, i) => {
      const row = rows[i];
      if (!row) return;
      const typeEl = row.querySelector(typeSelector);
      const teethEl = row.querySelector(teethSelector);
      const radiusEl = row.querySelector(radiusSelector);
      const connectsEl = row.querySelector(connectsSelector);

      if (typeEl) {
        if (typeEl.tagName.toLowerCase() === 'select') {
          typeEl.value = g.type;
          typeEl.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          typeEl.value = g.type;
        }
      }
      if (teethEl) teethEl.value = g.teeth;
      if (radiusEl) radiusEl.value = g.radius;
      if (connectsEl) connectsEl.value = g.connects || '';
    });

    // optional: focus calculate button
    const calcBtn = document.querySelector('#calculate-btn') || document.querySelector('.calculate-btn');
    if (calcBtn) {
      calcBtn.scrollIntoView({behavior: 'smooth'});
      calcBtn.classList.add('highlight');
      setTimeout(()=>calcBtn.classList.remove('highlight'), 1500);
    }

    // user feedback
    alert('Preset applied. Press Calculate to compute results.');
  } catch (err) {
    console.error('AutoFill error', err);
    alert('Auto-fill failed — your form selectors differ. I can adapt the function if you paste your gear row HTML structure.');
  }
}

// call renderHelp when About tab shows
// Replace this with your tab show event if different.
document.addEventListener('DOMContentLoaded', () => {
  // if you want the guide to render immediately into the About tab:
  // renderHelp();

  // Example: if you have a nav link with id "about-tab"
  const aboutNav = document.querySelector('#about-tab');
  if (aboutNav) {
    aboutNav.addEventListener('click', () => {
      renderHelp();
    });
  }

  // If you use hash routing or show the About section on page load:
  if (window.location.hash === '#about') renderHelp();
});
// ---------- end help renderer ----------

