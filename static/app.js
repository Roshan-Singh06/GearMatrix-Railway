/* app.js
   GearMatrix Pro v2 — single-folder edition with Python Matplotlib plotting
*/

(() => {
  // ---------- DOM ----------
  const startupModal = document.getElementById('startupModal');
  const appRoot = document.getElementById('appRoot');
  const libraryLabel = document.getElementById('libraryLabel');

  const gearTypeSelect = document.getElementById('gearTypeSelect');
  const moduleInput = document.getElementById('moduleInput');
  const teethInput = document.getElementById('teethInput');
  const radiusInput = document.getElementById('radiusInput');
  const pressureAngle = document.getElementById('pressureAngle');
  const helixAngle = document.getElementById('helixAngle');
  const helixHand = document.getElementById('helixHand');
  const connectsTo = document.getElementById('connectsTo');
  const inputRPM = document.getElementById('inputRPM');
  const gearRole = document.getElementById('gearRole');

  const addGearBtn = document.getElementById('addGear');
  const calcBtn = document.getElementById('calcBtn');
  const saveJsonBtn = document.getElementById('saveJson');
  const saveServerBtn = document.getElementById('saveServer');
  const uploadJsonBtn = document.getElementById('uploadJson');
  const exportCsvBtn = document.getElementById('exportCsv');
  const fileInput = document.getElementById('fileInput');

  const validationPanel = document.getElementById('validationPanel');
  const resultsPre = document.getElementById('resultsPre');
  const copyResultsBtn = document.getElementById('copyResults');
  const plotImage = document.getElementById('plotImage');

  const savedList = document.getElementById('savedList');
  const refreshSaved = document.getElementById('refreshSaved');

  // Sidebar nav
  const sections = Array.from(document.querySelectorAll('.section'));
  document.querySelectorAll('.sidebar nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sections.forEach(s => s.classList.remove('active'));
      const id = btn.dataset.section;
      document.getElementById(id).classList.add('active');
    });
  });

  // ---------- LIBRARIES ----------
  const LIBRARIES = {
    A: [
      'Spur',
      'Helical',
      'Bevel (straight)',
      'Worm (single-start)',
      'Planetary (basic)',
      'Rack & Pinion',
      'Internal Ring'
    ],
    B: [
      'Spur',
      'Helical',
      'Double Helical (Herringbone)',
      'Bevel (straight)',
      'Bevel (spiral)',
      'Worm (single & multi-start)',
      'Hypoid',
      'Planetary (advanced)',
      'Rack & Pinion',
      'Face Gear',
      'Crossed Helical',
      'Crown'
    ],
    C: [
      'Spur',
      'Helical',
      'Double Helical (Herringbone)',
      'Bevel (straight)',
      'Bevel (spiral/zerol)',
      'Worm (multi-start)',
      'Hypoid',
      'Planetary (full)',
      'Rack & Pinion',
      'Face Gear',
      'Crossed Helical',
      'Crown',
      'Cycloidal',
      'Non-circular (elliptic)',
      'Harmonic Drive',
      'Magnetic Gear'
    ]
  };

  let selectedLibrary = null;
  let gears = [];
  let editIndex = null;

  // ---------- STARTUP CHOICE ----------
  document.querySelectorAll('.choice').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const choice = btn.dataset.choice;
      selectedLibrary = choice;
      startupModal.classList.add('hide');
      appRoot.removeAttribute('aria-hidden');
      libraryLabel.textContent = `Library: Option ${choice}`;
      populateGearTypes(choice);
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById('calculator').classList.add('active');
    });
  });

  function populateGearTypes(choice) {
    gearTypeSelect.innerHTML = '';
    (LIBRARIES[choice] || []).forEach(t => {
      const opt = document.createElement('option'); opt.value = t; opt.textContent = t;
      gearTypeSelect.appendChild(opt);
    });
  }

  // ---------- LIVE VALIDATION ENGINE ----------
  function mkmsg(severity, title, detail) { return { severity, title, detail }; }

  function validatePair(g1, g2) {
    const messages = [];
    if (Math.abs((g1.module||0) - (g2.module||0)) > 1e-6) {
      messages.push(mkmsg('ERROR','Module mismatch',`m1=${g1.module}, m2=${g2.module} → cannot mesh.`));
    }
    if (String(g1.pressureAngle) !== String(g2.pressureAngle)) {
      messages.push(mkmsg('ERROR','Pressure angle mismatch',`φ1=${g1.pressureAngle}°, φ2=${g2.pressureAngle}°`));
    }
    const d1 = g1.pitchDiameter || g1.radius || (g1.module * g1.teeth);
    const d2 = g2.pitchDiameter || g2.radius || (g2.module * g2.teeth);
    if ((g1.type||'').toLowerCase().includes('helical') || (g2.type||'').toLowerCase().includes('helical')) {
      if (Number(g1.helixAngle) !== Number(g2.helixAngle)) {
        messages.push(mkmsg('WARN','Helix angle difference',`β1=${g1.helixAngle}°, β2=${g2.helixAngle}°`));
      }
      if (g1.role === 'External' && g2.role === 'External' && g1.helixHand === g2.helixHand) {
        messages.push(mkmsg('ERROR','Helix-hand mismatch','External helical gears must be RH↔LH.'));
      }
    }
    if ((g1.type||'').toLowerCase().includes('worm') || (g2.type||'').toLowerCase().includes('worm')) {
      const other = (g1.type||'').toLowerCase().includes('worm') ? g2 : g1;
      if (!((other.type||'').toLowerCase().includes('wheel') || (other.type||'').toLowerCase().includes('worm') || (other.type||'').toLowerCase().includes('ring'))) {
        messages.push(mkmsg('ERROR','Invalid worm mesh','Worm must mesh with worm wheel only.'));
      }
    }
    const expectedC = (g1.role === 'Internal' || g2.role === 'Internal') ? Math.abs((d2 - d1) / 2.0) : (d1 + d2) / 2.0;
    if (!(expectedC > 0)) {
      messages.push(mkmsg('CRITICAL','Invalid centre distance',`Computed centre distance ≤ 0 (d1=${d1}, d2=${d2}).`));
    }
    const ratio = d1 / d2;
    if (Math.abs(ratio) > 15 && !((g1.type||'').toLowerCase().includes('worm') || (g2.type||'').toLowerCase().includes('worm'))) {
      messages.push(mkmsg('WARN','Excessive gear ratio',`d1/d2=${ratio.toFixed(2)} exceed recommended limit.`));
    }
    return messages;
  }

  function validateSingleAgainstExisting(newGear, existingGears) {
    const msgs = [];
    existingGears.forEach((g, idx) => {
      const pairMsgs = validatePair(newGear, g);
      pairMsgs.forEach(m => {
        m.detail = `New ↔ G${idx+1}: ${m.detail || m.title || ''}`;
        msgs.push(m);
      });
    });
    return msgs;
  }

  function runLiveValidation() {
    const newGear = {
      type: gearTypeSelect.value,
      module: parseFloat(moduleInput.value) || 0,
      teeth: parseInt(teethInput.value) || 0,
      pitchDiameter: parseFloat(radiusInput.value) || (parseFloat(moduleInput.value) * parseInt(teethInput.value) || 0),
      pressureAngle: parseFloat(pressureAngle.value) || 20,
      helixAngle: parseFloat(helixAngle.value) || 0,
      helixHand: helixHand.value || 'RH',
      role: gearRole.value || 'External'
    };

    const msgs = validateSingleAgainstExisting(newGear, gears);
    const severityOrder = { 'CRITICAL': 0, 'ERROR': 1, 'WARN': 2, 'INFO': 3 };
    msgs.sort((a,b) => (severityOrder[a.severity]||3) - (severityOrder[b.severity]||3));

    validationPanel.innerHTML = msgs.map(m => {
      const cls = m.severity === 'CRITICAL' ? 'crit' : (m.severity === 'ERROR' ? 'err' : (m.severity === 'WARN' ? 'warn' : 'info'));
      return `<div class="${cls}">[${m.severity}] ${m.title}: ${m.detail}</div>`;
    }).join('') || '<div class="info">No immediate conflicts detected for this gear.</div>';

    const hasFatal = msgs.some(m => m.severity === 'CRITICAL' || m.severity === 'ERROR');
    if (hasFatal) {
      addGearBtn.disabled = true; addGearBtn.style.opacity = 0.5; addGearBtn.title = "Fix validation errors first";
    } else {
      addGearBtn.disabled = false; addGearBtn.style.opacity = 1; addGearBtn.title = "";
    }
  }

  // Attach live validation to inputs
  [ gearTypeSelect, moduleInput, teethInput, radiusInput, pressureAngle, helixAngle, helixHand, gearRole ].forEach(el => {
    el.addEventListener('input', runLiveValidation);
    el.addEventListener('change', runLiveValidation);
  });

  // ---------- GEAR LIST UI (add/edit/remove) ----------
  function loadGearIntoInputs(g) {
    gearTypeSelect.value = g.type;
    moduleInput.value = g.module;
    teethInput.value = g.teeth;
    radiusInput.value = g.pitchDiameter;
    pressureAngle.value = g.pressureAngle;
    helixAngle.value = g.helixAngle;
    helixHand.value = g.helixHand;
    connectsTo.value = g.connectsTo || '';
    gearRole.value = g.role;
    runLiveValidation();
  }

  function renderGearsTable() {
    const list = gears.map((g, i) => {
      return `<div style="padding:6px;border-bottom:1px solid #eef;display:flex;justify-content:space-between;align-items:center">
        <div><strong>G${i+1}</strong> ${g.type} — m=${g.module} z=${g.teeth} d=${(g.pitchDiameter||g.radius).toFixed(2)}mm</div>
        <div style="display:flex;gap:6px">
          <button data-edit="${i}" class="editGear small">Edit</button>
          <button data-idx="${i}" class="delGear small">Remove</button>
        </div>
      </div>`;
    }).join('') || '<div>No gears configured.</div>';
    validationPanel.innerHTML = list;
    // attach handlers
    document.querySelectorAll('.delGear').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.dataset.idx);
        gears.splice(idx, 1);
        renderGearsTable();
      });
    });
    document.querySelectorAll('.editGear').forEach(b => {
      b.addEventListener('click', () => {
        editIndex = parseInt(b.dataset.edit);
        loadGearIntoInputs(gears[editIndex]);
        addGearBtn.textContent = "Save Changes";
      });
    });
  }

  addGearBtn.addEventListener('click', () => {
    // build gear object
    const gear = {
      type: gearTypeSelect.value,
      module: parseFloat(moduleInput.value) || 0,
      teeth: parseInt(teethInput.value) || 0,
      pitchDiameter: parseFloat(radiusInput.value) || (parseFloat(moduleInput.value) * parseInt(teethInput.value) || 0),
      radius: parseFloat(radiusInput.value) || (parseFloat(moduleInput.value) * parseInt(teethInput.value) || 0),
      pressureAngle: parseFloat(pressureAngle.value) || 20,
      helixAngle: parseFloat(helixAngle.value) || 0,
      helixHand: helixHand.value || 'RH',
      connectsTo: connectsTo.value || '',
      role: gearRole.value || 'External'
    };

    if (addGearBtn.disabled) {
      alert('Cannot add gear: fix validation errors first.');
      return;
    }

    if (editIndex !== null) {
      gears[editIndex] = gear;
      editIndex = null;
      addGearBtn.textContent = "+ Add Gear";
    } else {
      gears.push(gear);
    }
    renderGearsTable();
    runLiveValidation();
  });

  // ---------- SAVE / LOAD / EXPORT ----------
  saveJsonBtn.addEventListener('click', () => {
    const payload = { meta: { savedAt: new Date().toISOString(), library: selectedLibrary }, gears };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `gearmatrix_config_${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  uploadJsonBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (parsed.gears && Array.isArray(parsed.gears)) {
          gears = parsed.gears;
          renderGearsTable();
          validationPanel.innerHTML = '<div class="info">Loaded configuration from file.</div>';
        } else {
          alert('Invalid JSON: expected { gears: [...] }');
        }
      } catch (err) {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
  });

  exportCsvBtn.addEventListener('click', () => {
    if (!gears.length) { alert('No gears to export'); return; }
    const header = ['index,type,module,teeth,pitchDiameter,pressureAngle,helixAngle,helixHand,connectsTo,role'];
    const rows = gears.map((g, i) => `${i+1},${g.type},${g.module},${g.teeth},${g.pitchDiameter},${g.pressureAngle},${g.helixAngle},${g.helixHand},"${g.connectsTo}",${g.role}`);
    const csv = header.concat(rows).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `gearmatrix_${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  // ---------- SERVER SAVE & LIST ----------
  saveServerBtn.addEventListener('click', async () => {
    try {
      const payload = { meta: { savedAt: new Date().toISOString(), library: selectedLibrary }, gears };
      const resp = await fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await resp.json();
      if (j.ok) { alert('Saved server-side: ' + j.filename); } else { alert('Save error: ' + JSON.stringify(j)); }
    } catch (e) { alert('Server save failed: ' + e.message); }
  });

  refreshSaved.addEventListener('click', async () => {
    try {
      const resp = await fetch('/configs');
      const j = await resp.json();
      if (j.ok && Array.isArray(j.files)) {
        savedList.innerHTML = j.files.map(f => `<div class="saved-card"><a href="/configs/${f}" target="_blank">${f}</a></div>`).join('');
      } else savedList.textContent = 'No saved files.';
    } catch (e) {
      savedList.textContent = 'Failed to fetch saved files.';
    }
  });

  // ---------- CALCULATION + Python plotting ----------
  function calculate(gearArray) {
    const n = gearArray.length;
    if (n === 0) return { error: 'No gears configured.' };
    const results = gearArray.map((g, i) => ({ index: i + 1, teeth: g.teeth, radius: g.pitchDiameter || g.radius, rpm: null, ratio: null, type: g.type }));

    const input = parseFloat(inputRPM.value || 1000);
    results[0].rpm = input; results[0].ratio = 1;

    const iterations = Math.max(1, n);
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < n; i++) {
        const from = gearArray[i];
        if (!from.connectsTo) continue;
        const toIndexes = from.connectsTo.split(',').map(s => parseInt(s.trim()) - 1).filter(x => !isNaN(x));
        toIndexes.forEach(tidx => {
          if (tidx < 0 || tidx >= n) return;
          const to = gearArray[tidx];
          const rpmFrom = results[i].rpm || input;
          if (rpmFrom == null) return;
          const rpmTo = rpmFrom * ((from.pitchDiameter || from.radius) / (to.pitchDiameter || to.radius));
          results[tidx].rpm = rpmTo;
          results[tidx].ratio = (results[i].ratio || 1) * ((from.pitchDiameter || from.radius) / (to.pitchDiameter || to.radius));
        });
      }
    }
    return { inputRPM: input, results };
  }

  // POST data to /plot2d and show returned PNG
  async function renderPythonPlot(results) {
    try {
      const x = results.map(r => r.index);
      const y = results.map(r => (r.rpm == null ? 0 : Number(r.rpm)));
      const payload = { x, y, title: "RPM Progression", xlabel: "Gear Index", ylabel: "RPM", line_style: "-", marker: "o" };
      const resp = await fetch("/plot2d", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!resp.ok) {
        const j = await resp.json().catch(()=>null);
        console.error("Plot error", j);
        alert("Server plot generation failed.");
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      plotImage.src = url;
    } catch (e) {
      console.error("Error fetching matplotlib plot:", e);
    }
  }

  calcBtn.addEventListener('click', () => {
    // run validation: if there are any CRITICAL/ERROR messages, notify user
    // We perform a full validation (pairwise checks) before calculating
    const msgs = runFullValidation(); // reuse function below for full validation
    const hasFatal = msgs.some(m => m.severity === 'CRITICAL' || m.severity === 'ERROR');
    if (hasFatal) {
      if (!confirm('Validation found CRITICAL/ERROR messages. Continue calculation anyway?')) return;
    }

    const res = calculate(gears);
    if (res.error) {
      resultsPre.textContent = res.error;
    } else {
      resultsPre.textContent = JSON.stringify(res, null, 2);
      renderPythonPlot(res.results);
    }
  });

  // ---------- Full (pairwise) validation used on Calculate ----------
  function runFullValidation() {
    const allMsgs = [];
    for (let i = 0; i < gears.length; i++) {
      const g = gears[i];
      if (g.connectsTo) {
        const targets = g.connectsTo.split(',').map(s => parseInt(s.trim()) - 1).filter(n => !isNaN(n));
        targets.forEach(tidx => {
          if (tidx < 0 || tidx >= gears.length) {
            allMsgs.push(mkmsg('ERROR','Invalid connection',`Gear ${i+1} connects to index ${tidx+1} — index out of range.`));
            return;
          }
          const msgs = validatePair(g, gears[tidx]);
          msgs.forEach(m => { m.detail = `G${i+1} ↔ G${tidx+1}: ${m.detail || m.title}`; allMsgs.push(m); });
        });
      }
    }
    if (allMsgs.length === 0) allMsgs.push(mkmsg('INFO','No connections defined','No gear pair connections were provided.'));
    const severityOrder = { 'CRITICAL': 0, 'ERROR': 1, 'WARN': 2, 'INFO': 3 };
    allMsgs.sort((a,b) => (severityOrder[a.severity]||3) - (severityOrder[b.severity]||3));
    validationPanel.innerHTML = allMsgs.map(m => {
      const cls = m.severity === 'CRITICAL' ? 'crit' : (m.severity === 'ERROR' ? 'err' : (m.severity === 'WARN' ? 'warn' : 'info'));
      return `<div class="${cls}">[${m.severity}] ${m.title}: ${m.detail}</div>`;
    }).join('') || '<div class="info">No validation messages.</div>';
    return allMsgs;
  }

  // copy results
  copyResultsBtn.addEventListener('click', () => {
    const txt = resultsPre.textContent || '';
    navigator.clipboard?.writeText(txt).then(() => {
      copyResultsBtn.textContent = 'Copied';
      setTimeout(() => copyResultsBtn.textContent = 'Copy', 1200);
    }).catch(() => alert('Copy failed.'));
  });

  // ---------- Init ----------
  function initDefaults() {
    // nothing to do; modal shows on load
  }
  initDefaults();

  // expose for debug
  window.GearMatrix = {
    get gears() { return gears; },
    set gears(v) { gears = v; renderGearsTable(); },
    validate: runFullValidation
  };

})();
