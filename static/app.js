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
