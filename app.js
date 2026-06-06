(() => {
  'use strict';

  // ==================== CONFIGURATION ====================
  const PLANER_TYPES = {
    flat:     { name: '平刨', min: 25, max: 35, default: 30, desc: '平面精加工 · 推荐角度 25°–35°' },
    pressure: { name: '压刨', min: 28, max: 38, default: 32, desc: '厚度刨削 · 推荐角度 28°–38°' },
    groove:   { name: '槽刨', min: 30, max: 45, default: 38, desc: '开槽成型 · 推荐角度 30°–45°' },
    edge:     { name: '边刨', min: 20, max: 30, default: 25, desc: '边缘修整 · 推荐角度 20°–30°' },
    bird:     { name: '鸟刨', min: 22, max: 32, default: 27, desc: '曲面成型 · 推荐角度 22°–32°' }
  };

  const WOOD_HARDNESS = {
    soft:   { name: '软木',    label: '软',   K: 2.0,  examples: '松木、杨木、杉木', cycle: '约80次' },
    medium: { name: '中硬木',  label: '中',   K: 4.5,  examples: '橡木、榉木、樱桃木', cycle: '约50次' },
    hard:   { name: '硬木',    label: '硬',   K: 7.0,  examples: '水曲柳、胡桃木', cycle: '约30次' },
    extra:  { name: '极硬木',  label: '极硬', K: 10.0, examples: '紫檀、酸枝、黄花梨', cycle: '约15次' }
  };

  const BLADE_WIDTH = 40;
  const STORAGE_KEY = 'woodPlanerPresets';
  const WOOD_LIB_KEY = 'woodPlanerWoodLibrary';
  const COMPARE_STATE_KEY = 'woodPlanerCompareState';

  const REFERENCE_TABLE = [
    { wood: '松木 / 杉木 / 杨木', hardness: 'soft',   flat: '25°–28°', pressure: '28°–30°', groove: '30°–33°', edge: '20°–23°', bird: '22°–25°' },
    { wood: '椴木 / 枫木（软）',   hardness: 'soft',   flat: '26°–29°', pressure: '29°–31°', groove: '31°–34°', edge: '21°–24°', bird: '23°–26°' },
    { wood: '橡木 / 榉木 / 樱桃', hardness: 'medium', flat: '30°–33°', pressure: '32°–35°', groove: '35°–39°', edge: '25°–28°', bird: '27°–30°' },
    { wood: '胡桃木 / 柚木',     hardness: 'medium', flat: '31°–34°', pressure: '33°–36°', groove: '37°–40°', edge: '26°–29°', bird: '28°–31°' },
    { wood: '水曲柳 / 柞木',     hardness: 'hard',   flat: '33°–35°', pressure: '35°–38°', groove: '40°–43°', edge: '28°–30°', bird: '30°–32°' },
    { wood: '红木 / 花梨木',     hardness: 'hard',   flat: '34°–36°', pressure: '36°–39°', groove: '42°–45°', edge: '29°–31°', bird: '31°–33°' },
    { wood: '紫檀 / 酸枝',       hardness: 'extra',  flat: '35°–37°', pressure: '37°–40°', groove: '43°–45°', edge: '30°–32°', bird: '32°–34°' },
    { wood: '黄花梨 / 乌木',     hardness: 'extra',  flat: '36°–38°', pressure: '38°–40°', groove: '44°–45°', edge: '31°–33°', bird: '33°–35°' }
  ];

  // ==================== STATE ====================
  const state = {
    planerType: 'flat',
    bladeAngle: 30,
    cutDepth: 0.8,
    woodHardness: 'soft',
    reverseMode: false,
    targetRa: 3.2,
    compareOpen: false,
    compareSelA: 'current',
    compareSelB: 'current',
    currentWoodName: ''
  };

  // ==================== COMPUTATION ====================
  const deg2rad = d => d * Math.PI / 180;
  const rad2deg = r => r * 180 / Math.PI;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const round = (v, n = 2) => Number(v.toFixed(n));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function computeForward(angleDeg, depthMm, K, b = BLADE_WIDTH) {
    const a = deg2rad(angleDeg);
    const chipMm = depthMm * Math.sin(a);
    const forceN = K * chipMm * b / Math.sin(a);
    const raUm = (depthMm / (8 * Math.tan(a))) * 1000;
    return { chipMm, forceN, raUm };
  }

  function assessChip(chipMm) {
    if (chipMm < 0.1) return { label: '极细', grade: 'excellent', pct: 95, color: '#4CAF50' };
    if (chipMm < 0.3) return { label: '精细', grade: 'good',      pct: 78, color: '#8BC34A' };
    if (chipMm < 0.6) return { label: '中等', grade: 'medium',    pct: 55, color: '#FFC107' };
    if (chipMm < 1.0) return { label: '较粗', grade: 'coarse',    pct: 32, color: '#FF9800' };
    return { label: '粗切', grade: 'heavy', pct: 10, color: '#E53935' };
  }

  function assessForce(forceN) {
    if (forceN < 80)  return { label: '省力', grade: 'light',   pct: 90, color: '#2196F3' };
    if (forceN < 150) return { label: '适中', grade: 'medium',  pct: 68, color: '#4CAF50' };
    if (forceN < 250) return { label: '较重', grade: 'heavy',   pct: 42, color: '#FF9800' };
    if (forceN < 400) return { label: '费力', grade: 'hard',    pct: 22, color: '#FF5722' };
    return { label: '极重', grade: 'extreme', pct: 8, color: '#E53935' };
  }

  function assessRa(raUm) {
    if (raUm < 1.6)  return { label: '极细', grade: 'mirror', pct: 95, color: '#4CAF50' };
    if (raUm < 3.2)  return { label: '细',   grade: 'fine',   pct: 80, color: '#8BC34A' };
    if (raUm < 6.3)  return { label: '中',   grade: 'medium', pct: 58, color: '#FFC107' };
    if (raUm < 12.5) return { label: '粗',   grade: 'rough',  pct: 35, color: '#FF9800' };
    return { label: '极粗', grade: 'coarse', pct: 12, color: '#E53935' };
  }

  function buildAdvice(angleDeg, depthMm, K, raUm, forceN, planerType) {
    const info = PLANER_TYPES[planerType];
    const advices = [];
    if (angleDeg < info.min) advices.push(`当前角度 ${angleDeg}° 低于 ${info.name} 推荐下限 ${info.min}°，刀刃易崩损，建议增大角度。`);
    if (angleDeg > info.max) advices.push(`当前角度 ${angleDeg}° 高于 ${info.name} 推荐上限 ${info.max}°，切削阻力大，建议减小角度。`);
    if (depthMm > 2.5) advices.push(`刨削深度 ${depthMm}mm 较大，建议分多次走刀，单次深度不超过 2mm 以保护刀刃。`);
    if (depthMm < 0.2) advices.push(`刨削深度 ${depthMm}mm 很薄，适合最后精修，注意进料速度均匀。`);
    if (K >= 7) advices.push(`加工硬木，建议刃口保持锋利，进给速度放慢，必要时预热木材。`);
    if (raUm > 6.3) advices.push(`当前粗糙度较粗，若需精面可减小深度或增大角度后再走一道精刨。`);
    if (forceN > 250) advices.push(`刨削力较大，建议检查刀刃锋利度，或减小每次刨削深度。`);
    if (advices.length === 0) advices.push('参数合理，可直接加工；建议首件试刨后微调 ±2°。');
    return advices;
  }

  function reverseCompute(targetRaUm, depthMm, planerType) {
    const info = PLANER_TYPES[planerType];
    const targetRaMm = targetRaUm / 1000;
    const tanA = depthMm / (8 * targetRaMm);
    let minAngle = rad2deg(Math.atan(tanA));
    minAngle = clamp(minAngle, 15, 60);
    let lo = clamp(Math.max(minAngle, info.min), 15, 60);
    let hi = clamp(Math.min(lo + 6, info.max), 15, 60);
    if (lo > hi) {
      lo = info.min;
      hi = info.max;
    }
    const rec = round((lo + hi) / 2, 1);
    return {
      minAngle: round(minAngle, 1),
      lo: round(lo, 1),
      hi: round(hi, 1),
      recommended: rec
    };
  }

  // ==================== SVG DIAGRAM ====================
  function updateSvg(angleDeg, depthMm) {
    const svg = document.getElementById('planer-svg');
    const polygon = document.getElementById('blade-polygon');
    const edge = document.getElementById('blade-edge');
    const arc = document.getElementById('angle-arc');
    const angleLabel = document.getElementById('angle-label');
    const depthLineTop = document.getElementById('depth-line-top');
    const depthLineBot = document.getElementById('depth-line-bot');
    const depthLabel = document.getElementById('depth-label');
    const chipLine = document.getElementById('chip-line');
    const chipLabel = document.getElementById('chip-label');

    const Y_SURFACE = 230;
    const X_TIP = 200;
    const a = deg2rad(angleDeg);
    const bladeLen = 180;
    const bladeThickness = 28;

    const x2 = X_TIP - Math.sin(a) * bladeLen;
    const y2 = Y_SURFACE - Math.cos(a) * bladeLen;

    const perpX = Math.cos(a) * bladeThickness;
    const perpY = -Math.sin(a) * bladeThickness;

    const x3 = x2 + perpX;
    const y3 = y2 + perpY;
    const x4 = X_TIP + perpX;
    const y4 = Y_SURFACE + perpY;

    polygon.setAttribute('points', `${X_TIP},${Y_SURFACE} ${x2},${y2} ${x3},${y3} ${x4},${y4}`);

    const edgeLen = 20;
    const ex2 = X_TIP - Math.sin(a) * edgeLen;
    const ey2 = Y_SURFACE - Math.cos(a) * edgeLen;
    const ex3 = ex2 + perpX * 0.7;
    const ey3 = ey2 + perpY * 0.7;
    const ex4 = X_TIP + perpX * 0.7;
    const ey4 = Y_SURFACE + perpY * 0.7;
    edge.setAttribute('points', `${X_TIP},${Y_SURFACE} ${ex2},${ey2} ${ex3},${ey3} ${ex4},${ey4}`);

    const r = 38;
    const startX = X_TIP + r;
    const startY = Y_SURFACE;
    const endX = X_TIP + r * Math.cos(a);
    const endY = Y_SURFACE - r * Math.sin(a);
    const largeArc = angleDeg > 180 ? 1 : 0;
    arc.setAttribute('d', `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 0 ${endX} ${endY}`);

    const labelR = 54;
    const lx = X_TIP + labelR * Math.cos(a / 2);
    const ly = Y_SURFACE - labelR * Math.sin(a / 2);
    angleLabel.setAttribute('x', lx - 8);
    angleLabel.setAttribute('y', ly + 6);

    const depthScale = 22;
    const scaledDepth = depthMm * depthScale;
    const yBot = Math.min(Y_SURFACE + scaledDepth, 370);
    depthLineTop.setAttribute('y1', Y_SURFACE - 26);
    depthLineTop.setAttribute('y2', Y_SURFACE);
    depthLineBot.setAttribute('y1', Y_SURFACE);
    depthLineBot.setAttribute('y2', yBot);

    depthLabel.textContent = `d = ${depthMm} mm`;
    depthLabel.setAttribute('y', (Y_SURFACE + yBot) / 2 + 5);

    const chipMm = depthMm * Math.sin(a);
    const chipPx = chipMm * depthScale;
    const cx1 = X_TIP;
    const cy1 = Y_SURFACE;
    const cx2 = X_TIP - chipPx * Math.cos(a);
    const cy2 = Y_SURFACE + chipPx * Math.sin(a);
    chipLine.setAttribute('x1', cx1);
    chipLine.setAttribute('y1', cy1);
    chipLine.setAttribute('x2', cx2);
    chipLine.setAttribute('y2', cy2);

    chipLabel.setAttribute('x', (cx1 + cx2) / 2 - 30);
    chipLabel.setAttribute('y', (cy1 + cy2) / 2 - 8);
    chipLabel.textContent = `h = ${round(chipMm, 3)} mm`;
  }

  // ==================== UI UPDATE ====================
  function setSliderFill(slider) {
    const min = Number(slider.min);
    const max = Number(slider.max);
    const val = Number(slider.value);
    const pct = ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--val', pct + '%');
  }

  function animateValue(el, target, formatter) {
    const prev = Number(el.dataset.prev || 0);
    const duration = 300;
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = prev + (target - prev) * eased;
      el.textContent = formatter(current);
      if (t < 1) requestAnimationFrame(step);
      else el.dataset.prev = target;
    }
    requestAnimationFrame(step);
  }

  function updateUI() {
    const K = WOOD_HARDNESS[state.woodHardness].K;
    const r = computeForward(state.bladeAngle, state.cutDepth, K);

    animateValue(document.getElementById('angle-value'), state.bladeAngle, v => round(v, 1));

    document.getElementById('val-chip').textContent = round(r.chipMm, 3);
    document.getElementById('val-force').textContent = round(r.forceN, 1);
    document.getElementById('val-ra').textContent = round(r.raUm, 2);

    const chipA = assessChip(r.chipMm);
    const forceA = assessForce(r.forceN);
    const raA = assessRa(r.raUm);

    const barChip = document.getElementById('bar-chip');
    const barForce = document.getElementById('bar-force');
    const barRa = document.getElementById('bar-ra');
    barChip.style.width = chipA.pct + '%';
    barChip.style.background = `linear-gradient(to right, ${chipA.color}, ${lighten(chipA.color)})`;
    barForce.style.width = forceA.pct + '%';
    barForce.style.background = `linear-gradient(to right, ${forceA.color}, ${lighten(forceA.color)})`;
    barRa.style.width = raA.pct + '%';
    barRa.style.background = `linear-gradient(to right, ${raA.color}, ${lighten(raA.color)})`;

    document.getElementById('tag-chip').textContent = chipA.label;
    document.getElementById('tag-force').textContent = forceA.label;
    document.getElementById('tag-ra').textContent = raA.label;

    const advices = buildAdvice(state.bladeAngle, state.cutDepth, K, r.raUm, r.forceN, state.planerType);
    const ul = document.getElementById('advice-list');
    ul.innerHTML = advices.map(a => `<li>${a}</li>`).join('');

    updateSvg(state.bladeAngle, state.cutDepth);

    const depthSlider = document.getElementById('depth-slider');
    const angleSlider = document.getElementById('angle-slider');
    setSliderFill(depthSlider);
    setSliderFill(angleSlider);

    if (state.reverseMode) updateReverse();
    if (state.compareOpen) renderCompare();
  }

  function lighten(hex) {
    const c = hex.replace('#', '');
    const num = parseInt(c, 16);
    let r = (num >> 16) + 40;
    let g = ((num >> 8) & 0xff) + 40;
    let b = (num & 0xff) + 40;
    r = Math.min(255, r); g = Math.min(255, g); b = Math.min(255, b);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function updateReverse() {
    const box = document.getElementById('recommend-box');
    const target = Number(document.getElementById('target-ra').value) || 3.2;
    const res = reverseCompute(target, state.cutDepth, state.planerType);
    box.innerHTML = `
      理论最小角度：${res.minAngle}°<br>
      <strong>${res.lo}° – ${res.hi}°</strong>
      <span style="font-size:12px;color:var(--ink-soft);font-weight:400;">（推荐 ${res.recommended}°）</span>
    `;
  }

  // ==================== PLANER TABS ====================
  function initPlanerTabs() {
    const tabs = document.querySelectorAll('.planer-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const type = tab.dataset.type;
        state.planerType = type;
        const info = PLANER_TYPES[type];
        document.getElementById('planer-desc').textContent = info.desc;
        document.getElementById('angle-range-tag').textContent = `${info.min}° – ${info.max}°`;
        if (state.bladeAngle < info.min || state.bladeAngle > info.max) {
          state.bladeAngle = info.default;
          document.getElementById('angle-slider').value = info.default;
        }
        updateUI();
      });
    });
  }

  // ==================== SLIDERS & INPUTS ====================
  function initInputs() {
    const angleSlider = document.getElementById('angle-slider');
    const depthSlider = document.getElementById('depth-slider');
    const depthInput = document.getElementById('depth-input');
    const depthMinus = document.getElementById('depth-minus');
    const depthPlus = document.getElementById('depth-plus');

    angleSlider.addEventListener('input', e => {
      state.bladeAngle = Number(e.target.value);
      updateUI();
    });

    depthSlider.addEventListener('input', e => {
      state.cutDepth = Number(e.target.value);
      depthInput.value = state.cutDepth;
      updateUI();
    });

    depthInput.addEventListener('input', e => {
      let v = Number(e.target.value);
      if (isNaN(v)) return;
      v = clamp(v, 0.1, 5);
      state.cutDepth = v;
      depthSlider.value = v;
      updateUI();
    });

    depthMinus.addEventListener('click', () => {
      state.cutDepth = clamp(round(state.cutDepth - 0.1, 1), 0.1, 5);
      depthInput.value = state.cutDepth;
      depthSlider.value = state.cutDepth;
      updateUI();
    });
    depthPlus.addEventListener('click', () => {
      state.cutDepth = clamp(round(state.cutDepth + 0.1, 1), 0.1, 5);
      depthInput.value = state.cutDepth;
      depthSlider.value = state.cutDepth;
      updateUI();
    });
  }

  function initHardnessSeg() {
    const segs = document.querySelectorAll('.seg-btn');
    segs.forEach(btn => {
      btn.addEventListener('click', () => {
        segs.forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        state.woodHardness = btn.dataset.hardness;
        updateUI();
      });
    });
  }

  function initReverseToggle() {
    const toggle = document.getElementById('reverse-toggle');
    const body = document.getElementById('reverse-body');
    const targetRa = document.getElementById('target-ra');

    toggle.addEventListener('change', () => {
      state.reverseMode = toggle.checked;
      body.style.display = toggle.checked ? 'block' : 'none';
      if (toggle.checked) updateReverse();
    });

    targetRa.addEventListener('input', () => {
      state.targetRa = Number(targetRa.value) || 3.2;
      updateReverse();
    });
  }

  // ==================== PRESETS (localStorage) ====================
  function loadPresets() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch { return []; }
  }

  function savePresets(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function renderPresets() {
    const scroll = document.getElementById('preset-scroll');
    const list = loadPresets();
    if (list.length === 0) {
      scroll.innerHTML = `<p class="preset-empty">暂无预设，点击右上角保存当前刨削参数。</p>`;
      refreshCompareSelects();
      return;
    }

    const html = list.map(p => {
      const planer = PLANER_TYPES[p.planerType];
      const hardness = WOOD_HARDNESS[p.woodHardness];
      return `
        <div class="preset-card" data-id="${p.id}" title="点击加载此预设">
          <button class="preset-del" data-id="${p.id}" title="删除预设">×</button>
          <div class="preset-name">${escapeHtml(p.name)}</div>
          <div class="preset-wood">${escapeHtml(p.woodName || '未指定')} · ${hardness ? hardness.name : ''}</div>
          <div class="preset-meta">
            <span>刨刀<strong>${planer ? planer.name : ''}</strong></span>
            <span>角度<strong>${p.bladeAngle}°</strong></span>
            <span>深度<strong>${p.cutDepth}mm</strong></span>
          </div>
        </div>
      `;
    }).join('');
    scroll.innerHTML = html;

    scroll.querySelectorAll('.preset-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.classList.contains('preset-del')) return;
        loadPresetById(card.dataset.id);
      });
    });

    scroll.querySelectorAll('.preset-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        deletePreset(btn.dataset.id);
      });
    });

    refreshCompareSelects();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function loadPresetById(id) {
    const list = loadPresets();
    const p = list.find(x => x.id === id);
    if (!p) return;
    state.planerType = p.planerType;
    state.bladeAngle = p.bladeAngle;
    state.cutDepth = p.cutDepth;
    state.woodHardness = p.woodHardness;
    state.currentWoodName = p.woodName || '';

    document.querySelectorAll('.planer-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.type === p.planerType);
    });
    const info = PLANER_TYPES[p.planerType];
    document.getElementById('planer-desc').textContent = info.desc;
    document.getElementById('angle-range-tag').textContent = `${info.min}° – ${info.max}°`;

    document.getElementById('angle-slider').value = p.bladeAngle;
    document.getElementById('depth-slider').value = p.cutDepth;
    document.getElementById('depth-input').value = p.cutDepth;

    document.querySelectorAll('.seg-btn').forEach(s => {
      s.classList.toggle('active', s.dataset.hardness === p.woodHardness);
    });

    updateUI();
    if (state.compareOpen) renderCompare();
    const card = document.querySelector(`.preset-card[data-id="${id}"]`);
    if (card) {
      card.classList.add('flash');
      setTimeout(() => card.classList.remove('flash'), 600);
    }
  }

  function deletePreset(id) {
    if (!confirm('确认删除此预设？')) return;
    const list = loadPresets().filter(x => x.id !== id);
    savePresets(list);
    if (state.compareSelA === `preset:${id}`) { state.compareSelA = 'current'; }
    if (state.compareSelB === `preset:${id}`) { state.compareSelB = 'current'; }
    renderPresets();
    if (state.compareOpen) renderCompare();
  }

  function initPresetModal() {
    const overlay = document.getElementById('modal-overlay');
    const btnSave = document.getElementById('btn-save-preset');
    const btnCancel = document.getElementById('modal-cancel');
    const btnConfirm = document.getElementById('modal-confirm');
    const nameInp = document.getElementById('preset-name');
    const woodInp = document.getElementById('preset-wood');
    const noteInp = document.getElementById('preset-note');

    function openModal() {
      nameInp.value = '';
      woodInp.value = '';
      noteInp.value = '';
      overlay.style.display = 'flex';
      setTimeout(() => nameInp.focus(), 50);
    }
    function closeModal() { overlay.style.display = 'none'; }

    btnSave.addEventListener('click', openModal);
    btnCancel.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    btnConfirm.addEventListener('click', () => {
      const name = nameInp.value.trim();
      if (!name) { alert('请填写预设名称'); nameInp.focus(); return; }
      const wName = woodInp.value.trim();
      const preset = {
        id: uid(),
        name,
        planerType: state.planerType,
        bladeAngle: state.bladeAngle,
        cutDepth: state.cutDepth,
        woodHardness: state.woodHardness,
        woodName: wName,
        note: noteInp.value.trim(),
        createdAt: Date.now()
      };
      const list = loadPresets();
      list.unshift(preset);
      savePresets(list);
      if (wName) state.currentWoodName = wName;
      renderPresets();
      if (state.compareOpen) renderCompare();
      closeModal();
    });
  }

  // ==================== WOOD LIBRARY (localStorage) ====================
  function loadWoodLibrary() {
    try {
      return JSON.parse(localStorage.getItem(WOOD_LIB_KEY)) || [];
    } catch { return []; }
  }

  function saveWoodLibrary(list) {
    localStorage.setItem(WOOD_LIB_KEY, JSON.stringify(list));
  }

  function renderWoodLibrary() {
    const scroll = document.getElementById('wood-lib-scroll');
    const list = loadWoodLibrary();
    if (list.length === 0) {
      scroll.innerHTML = `<p class="preset-empty">暂无木材档案，点击右上角新增。</p>`;
      refreshCompareSelects();
      return;
    }

    const html = list.map(w => {
      const hd = WOOD_HARDNESS[w.hardness];
      const planer = PLANER_TYPES[w.planerType];
      return `
        <div class="wood-card" data-id="${w.id}">
          <div class="wood-card-head">
            <div class="wood-card-name">${escapeHtml(w.name)}</div>
            <span class="wood-card-badge ${w.hardness}">${hd ? hd.label : ''}</span>
          </div>
          <div class="wood-card-meta">
            <span>刨刀<strong>${planer ? planer.name : ''}</strong></span>
            <span>角度<strong>${w.angleMin}°–${w.angleMax}°</strong></span>
            <span>深度<strong>${w.depth}mm</strong></span>
            <span>硬度<strong>${hd ? hd.name : ''}</strong></span>
          </div>
          ${w.note ? `<div class="wood-card-note">${escapeHtml(w.note)}</div>` : ''}
          <div class="wood-card-actions">
            <button class="wood-btn" data-action="apply" data-id="${w.id}">带入参数</button>
            <button class="wood-btn wood-btn-compare" data-action="compareA" data-id="${w.id}">对比A</button>
            <button class="wood-btn wood-btn-compare" data-action="compareB" data-id="${w.id}">对比B</button>
            <button class="wood-btn wood-btn-edit" data-action="edit" data-id="${w.id}">编辑</button>
            <button class="wood-btn wood-btn-del" data-action="del" data-id="${w.id}">删除</button>
          </div>
        </div>
      `;
    }).join('');
    scroll.innerHTML = html;

    scroll.querySelectorAll('.wood-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === 'apply') applyWoodToCurrent(id);
        else if (action === 'compareA') setCompareSelection('a', `wood:${id}`);
        else if (action === 'compareB') setCompareSelection('b', `wood:${id}`);
        else if (action === 'edit') window.openWoodModal(id);
        else if (action === 'del') deleteWood(id);
      });
    });

    refreshCompareSelects();
  }

  function applyWoodToCurrent(id) {
    const list = loadWoodLibrary();
    const w = list.find(x => x.id === id);
    if (!w) return;

    state.planerType = w.planerType;
    state.bladeAngle = clamp((Number(w.angleMin) + Number(w.angleMax)) / 2,
      PLANER_TYPES[w.planerType].min, PLANER_TYPES[w.planerType].max);
    state.cutDepth = Number(w.depth);
    state.woodHardness = w.hardness;
    state.currentWoodName = w.name;

    document.querySelectorAll('.planer-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.type === w.planerType);
    });
    const info = PLANER_TYPES[w.planerType];
    document.getElementById('planer-desc').textContent = info.desc;
    document.getElementById('angle-range-tag').textContent = `${info.min}° – ${info.max}°`;

    document.getElementById('angle-slider').value = state.bladeAngle;
    document.getElementById('depth-slider').value = state.cutDepth;
    document.getElementById('depth-input').value = state.cutDepth;

    document.querySelectorAll('.seg-btn').forEach(s => {
      s.classList.toggle('active', s.dataset.hardness === w.hardness);
    });

    updateUI();
    if (state.compareOpen) renderCompare();

    const card = document.querySelector(`.wood-card[data-id="${id}"]`);
    if (card) {
      card.classList.add('flash');
      setTimeout(() => card.classList.remove('flash'), 600);
    }
  }

  function deleteWood(id) {
    if (!confirm('确认删除此木材档案？删除不影响已保存的预设。')) return;
    const list = loadWoodLibrary().filter(x => x.id !== id);
    saveWoodLibrary(list);
    if (state.compareSelA === `wood:${id}`) { state.compareSelA = 'current'; }
    if (state.compareSelB === `wood:${id}`) { state.compareSelB = 'current'; }
    renderWoodLibrary();
    if (state.compareOpen) renderCompare();
  }

  // ==================== WOOD MODAL ====================
  function initWoodModal() {
    const overlay = document.getElementById('wood-modal-overlay');
    const btnAdd = document.getElementById('btn-add-wood');
    const btnCancel = document.getElementById('wood-modal-cancel');
    const btnConfirm = document.getElementById('wood-modal-confirm');

    function openModalForNew() {
      document.getElementById('wood-modal-title').textContent = '新增木材档案';
      document.getElementById('wood-edit-id').value = '';
      document.getElementById('wood-name').value = '';
      document.getElementById('wood-hardness').value = 'soft';
      document.getElementById('wood-planer').value = 'flat';
      document.getElementById('wood-angle-min').value = 25;
      document.getElementById('wood-angle-max').value = 35;
      document.getElementById('wood-depth').value = 0.8;
      document.getElementById('wood-note').value = '';
      overlay.style.display = 'flex';
      setTimeout(() => document.getElementById('wood-name').focus(), 50);
    }

    function openModalForEdit(id) {
      const list = loadWoodLibrary();
      const w = list.find(x => x.id === id);
      if (!w) return;
      document.getElementById('wood-modal-title').textContent = '编辑木材档案';
      document.getElementById('wood-edit-id').value = id;
      document.getElementById('wood-name').value = w.name;
      document.getElementById('wood-hardness').value = w.hardness;
      document.getElementById('wood-planer').value = w.planerType;
      document.getElementById('wood-angle-min').value = w.angleMin;
      document.getElementById('wood-angle-max').value = w.angleMax;
      document.getElementById('wood-depth').value = w.depth;
      document.getElementById('wood-note').value = w.note || '';
      overlay.style.display = 'flex';
    }
    function openWoodModal(id) { id ? openModalForEdit(id) : openModalForNew(); }
    window.openWoodModal = openWoodModal;

    function closeModal() { overlay.style.display = 'none'; }

    btnAdd.addEventListener('click', openModalForNew);
    btnCancel.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    btnConfirm.addEventListener('click', () => {
      const name = document.getElementById('wood-name').value.trim();
      if (!name) { alert('请填写木材名称'); document.getElementById('wood-name').focus(); return; }

      const editId = document.getElementById('wood-edit-id').value;
      const angleMin = Number(document.getElementById('wood-angle-min').value) || 25;
      const angleMax = Number(document.getElementById('wood-angle-max').value) || 35;
      const lo = Math.min(angleMin, angleMax);
      const hi = Math.max(angleMin, angleMax);

      const record = {
        id: editId || uid(),
        name,
        hardness: document.getElementById('wood-hardness').value,
        planerType: document.getElementById('wood-planer').value,
        angleMin: lo,
        angleMax: hi,
        depth: Number(document.getElementById('wood-depth').value) || 0.8,
        note: document.getElementById('wood-note').value.trim(),
        updatedAt: Date.now()
      };
      if (!editId) record.createdAt = Date.now();

      const list = loadWoodLibrary();
      if (editId) {
        const idx = list.findIndex(x => x.id === editId);
        if (idx >= 0) list[idx] = { ...list[idx], ...record };
      } else {
        list.unshift(record);
      }
      saveWoodLibrary(list);
      renderWoodLibrary();
      if (state.compareOpen) renderCompare();
      closeModal();
    });
  }

  // ==================== COMPARE PANEL ====================
  function initCompareToggle() {
    const panel = document.getElementById('panel-compare');
    const btnToggle = document.getElementById('btn-compare-toggle');
    const btnClose = document.getElementById('btn-compare-close');
    const selA = document.getElementById('compare-select-a');
    const selB = document.getElementById('compare-select-b');

    function openPanel() {
      state.compareOpen = true;
      panel.style.display = 'block';
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      renderCompare();
    }
    function closePanel() {
      state.compareOpen = false;
      panel.style.display = 'none';
    }
    btnToggle.addEventListener('click', () => state.compareOpen ? closePanel() : openPanel());
    btnClose.addEventListener('click', closePanel);

    selA.addEventListener('change', () => {
      state.compareSelA = selA.value;
      renderCompare();
    });
    selB.addEventListener('change', () => {
      state.compareSelB = selB.value;
      renderCompare();
    });
  }

  function setCompareSelection(side, value) {
    if (side === 'a') {
      state.compareSelA = value;
      document.getElementById('compare-select-a').value = value;
    } else {
      state.compareSelB = value;
      document.getElementById('compare-select-b').value = value;
    }
    if (!state.compareOpen) {
      state.compareOpen = true;
      document.getElementById('panel-compare').style.display = 'block';
    }
    renderCompare();
    document.getElementById('panel-compare').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function refreshCompareSelects() {
    const woodList = loadWoodLibrary();
    const presetList = loadPresets();
    const buildOptions = (currentVal) => {
      let html = `<option value="current">—— 当前参数 ——</option>`;
      if (woodList.length > 0) {
        html += `<optgroup label="木材档案库">`;
        woodList.forEach(w => {
          html += `<option value="wood:${w.id}">🪵 ${escapeHtml(w.name)}</option>`;
        });
        html += `</optgroup>`;
      }
      if (presetList.length > 0) {
        html += `<optgroup label="已保存预设">`;
        presetList.forEach(p => {
          html += `<option value="preset:${p.id}">📋 ${escapeHtml(p.name)}</option>`;
        });
        html += `</optgroup>`;
      }
      return html;
    };
    const selA = document.getElementById('compare-select-a');
    const selB = document.getElementById('compare-select-b');
    selA.innerHTML = buildOptions(state.compareSelA);
    selB.innerHTML = buildOptions(state.compareSelB);
    selA.value = state.compareSelA;
    selB.value = state.compareSelB;
  }

  function resolveCompareSource(val) {
    if (val === 'current') {
      return {
        label: '当前参数',
        woodName: state.currentWoodName || '（未指定）',
        planerType: state.planerType,
        bladeAngle: state.bladeAngle,
        cutDepth: state.cutDepth,
        woodHardness: state.woodHardness
      };
    }
    if (val.startsWith('wood:')) {
      const id = val.slice(5);
      const w = loadWoodLibrary().find(x => x.id === id);
      if (!w) return null;
      const midAngle = clamp((Number(w.angleMin) + Number(w.angleMax)) / 2,
        PLANER_TYPES[w.planerType].min, PLANER_TYPES[w.planerType].max);
      return {
        label: w.name,
        woodName: w.name,
        planerType: w.planerType,
        bladeAngle: midAngle,
        cutDepth: Number(w.depth),
        woodHardness: w.hardness
      };
    }
    if (val.startsWith('preset:')) {
      const id = val.slice(7);
      const p = loadPresets().find(x => x.id === id);
      if (!p) return null;
      return {
        label: p.name,
        woodName: p.woodName || '（未指定）',
        planerType: p.planerType,
        bladeAngle: p.bladeAngle,
        cutDepth: p.cutDepth,
        woodHardness: p.woodHardness
      };
    }
    return null;
  }

  function paramsEqual(a, b) {
    if (!a || !b) return false;
    return a.planerType === b.planerType &&
      Math.abs(a.bladeAngle - b.bladeAngle) < 0.01 &&
      Math.abs(a.cutDepth - b.cutDepth) < 0.001 &&
      a.woodHardness === b.woodHardness;
  }

  function setCell(id, text, diff) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (diff) el.classList.add('diff'); else el.classList.remove('diff');
  }

  function renderCompare() {
    refreshCompareSelects();
    const a = resolveCompareSource(state.compareSelA);
    const b = resolveCompareSource(state.compareSelB);

    document.getElementById('cmp-head-a').textContent = '方案 A · ' + (a ? a.label : '—');
    document.getElementById('cmp-head-b').textContent = '方案 B · ' + (b ? b.label : '—');

    const noDiffEl = document.getElementById('compare-no-diff');
    if (a && b && paramsEqual(a, b)) {
      noDiffEl.style.display = 'block';
    } else {
      noDiffEl.style.display = 'none';
    }

    if (!a || !b) return;

    const hdA = WOOD_HARDNESS[a.woodHardness];
    const hdB = WOOD_HARDNESS[b.woodHardness];
    const plA = PLANER_TYPES[a.planerType];
    const plB = PLANER_TYPES[b.planerType];
    const rA = computeForward(a.bladeAngle, a.cutDepth, hdA ? hdA.K : 4.5);
    const rB = computeForward(b.bladeAngle, b.cutDepth, hdB ? hdB.K : 4.5);

    setCell('cmp-a-wood', a.woodName, a.woodName !== b.woodName);
    setCell('cmp-b-wood', b.woodName, a.woodName !== b.woodName);

    setCell('cmp-a-hardness', hdA ? hdA.name : '—', a.woodHardness !== b.woodHardness);
    setCell('cmp-b-hardness', hdB ? hdB.name : '—', a.woodHardness !== b.woodHardness);

    setCell('cmp-a-planer', plA ? plA.name : '—', a.planerType !== b.planerType);
    setCell('cmp-b-planer', plB ? plB.name : '—', a.planerType !== b.planerType);

    setCell('cmp-a-angle', `${a.bladeAngle}°`, Math.abs(a.bladeAngle - b.bladeAngle) >= 0.01);
    setCell('cmp-b-angle', `${b.bladeAngle}°`, Math.abs(a.bladeAngle - b.bladeAngle) >= 0.01);

    setCell('cmp-a-depth', `${a.cutDepth} mm`, Math.abs(a.cutDepth - b.cutDepth) >= 0.001);
    setCell('cmp-b-depth', `${b.cutDepth} mm`, Math.abs(a.cutDepth - b.cutDepth) >= 0.001);

    setCell('cmp-a-chip', `${round(rA.chipMm, 3)} mm (${assessChip(rA.chipMm).label})`,
      Math.abs(rA.chipMm - rB.chipMm) >= 0.001);
    setCell('cmp-b-chip', `${round(rB.chipMm, 3)} mm (${assessChip(rB.chipMm).label})`,
      Math.abs(rA.chipMm - rB.chipMm) >= 0.001);

    setCell('cmp-a-force', `${round(rA.forceN, 1)} N (${assessForce(rA.forceN).label})`,
      Math.abs(rA.forceN - rB.forceN) >= 0.1);
    setCell('cmp-b-force', `${round(rB.forceN, 1)} N (${assessForce(rB.forceN).label})`,
      Math.abs(rA.forceN - rB.forceN) >= 0.1);

    setCell('cmp-a-ra', `${round(rA.raUm, 2)} μm (${assessRa(rA.raUm).label})`,
      Math.abs(rA.raUm - rB.raUm) >= 0.01);
    setCell('cmp-b-ra', `${round(rB.raUm, 2)} μm (${assessRa(rB.raUm).label})`,
      Math.abs(rA.raUm - rB.raUm) >= 0.01);

    const advA = buildAdvice(a.bladeAngle, a.cutDepth, hdA ? hdA.K : 4.5, rA.raUm, rA.forceN, a.planerType);
    const advB = buildAdvice(b.bladeAngle, b.cutDepth, hdB ? hdB.K : 4.5, rB.raUm, rB.forceN, b.planerType);
    document.getElementById('cmp-a-advice').innerHTML = advA.map(x => `<li>${x}</li>`).join('');
    document.getElementById('cmp-b-advice').innerHTML = advB.map(x => `<li>${x}</li>`).join('');
  }

  // ==================== EXPORT ====================
  function initExport() {
    document.getElementById('btn-export').addEventListener('click', () => {
      const woodList = loadWoodLibrary();
      const presetList = loadPresets();
      const hasData = woodList.length > 0 || presetList.length > 0;
      if (!hasData) {
        alert('暂无可导出的数据。请先新增木材档案或保存至少一组参数预设。');
        return;
      }

      const rows = [];

      if (state.compareOpen && state.compareSelA && state.compareSelB) {
        const a = resolveCompareSource(state.compareSelA);
        const b = resolveCompareSource(state.compareSelB);
        if (a && b) {
          rows.push(['=== 参数对比结果 ===']);
          const noDiff = paramsEqual(a, b) ? '（两组参数无差异）' : '';
          rows.push(['', `方案 A: ${a.label}`, `方案 B: ${b.label}`, noDiff].join(','));
          const hdA = WOOD_HARDNESS[a.woodHardness];
          const hdB = WOOD_HARDNESS[b.woodHardness];
          const plA = PLANER_TYPES[a.planerType];
          const plB = PLANER_TYPES[b.planerType];
          const rA = computeForward(a.bladeAngle, a.cutDepth, hdA ? hdA.K : 4.5);
          const rB = computeForward(b.bladeAngle, b.cutDepth, hdB ? hdB.K : 4.5);
          rows.push(['项目', '方案 A', '方案 B', '差异']);
          const addCmpRow = (label, va, vb, same) => rows.push([
            label, va, vb, same ? '否' : '是'
          ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
          addCmpRow('木材名称', a.woodName, b.woodName, a.woodName === b.woodName);
          addCmpRow('硬度等级', hdA ? hdA.name : '', hdB ? hdB.name : '', a.woodHardness === b.woodHardness);
          addCmpRow('刨刀类型', plA ? plA.name : '', plB ? plB.name : '', a.planerType === b.planerType);
          addCmpRow('刃磨角度(°)', a.bladeAngle, b.bladeAngle, Math.abs(a.bladeAngle - b.bladeAngle) < 0.01);
          addCmpRow('刨削深度(mm)', a.cutDepth, b.cutDepth, Math.abs(a.cutDepth - b.cutDepth) < 0.001);
          addCmpRow('切屑厚度(mm)', round(rA.chipMm, 3), round(rB.chipMm, 3), Math.abs(rA.chipMm - rB.chipMm) < 0.001);
          addCmpRow('刨削力(N)', round(rA.forceN, 1), round(rB.forceN, 1), Math.abs(rA.forceN - rB.forceN) < 0.1);
          addCmpRow('理论粗糙度 Ra(μm)', round(rA.raUm, 2), round(rB.raUm, 2), Math.abs(rA.raUm - rB.raUm) < 0.01);
          rows.push('');
          rows.push(['=== 方案 A 加工建议 ===']);
          buildAdvice(a.bladeAngle, a.cutDepth, hdA ? hdA.K : 4.5, rA.raUm, rA.forceN, a.planerType)
            .forEach(adv => rows.push([`"${adv.replace(/"/g, '""')}"`].join(',')));
          rows.push(['=== 方案 B 加工建议 ===']);
          buildAdvice(b.bladeAngle, b.cutDepth, hdB ? hdB.K : 4.5, rB.raUm, rB.forceN, b.planerType)
            .forEach(adv => rows.push([`"${adv.replace(/"/g, '""')}"`].join(',')));
          rows.push('');
        }
      }

      if (woodList.length > 0) {
        rows.push(['=== 木材档案库 ===']);
        rows.push(['木材名称', '硬度等级', '常用刨刀类型', '推荐角度下限(°)', '推荐角度上限(°)',
                   '常用刨削深度(mm)', '备注'].map(v => `"${v}"`).join(','));
        woodList.forEach(w => {
          const hd = WOOD_HARDNESS[w.hardness];
          const pl = PLANER_TYPES[w.planerType];
          rows.push([
            w.name,
            hd ? hd.name : w.hardness,
            pl ? pl.name : w.planerType,
            w.angleMin,
            w.angleMax,
            w.depth,
            w.note || ''
          ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        });
        rows.push('');
      }

      if (presetList.length > 0) {
        rows.push(['=== 参数预设 ===']);
        rows.push(['预设名称', '刨刀类型', '刃磨角度(°)', '木材名称', '硬度等级',
                   '刨削深度(mm)', '切屑厚度(mm)', '刨削力(N)', 'Ra(μm)', '建议刃磨周期', '备注']);
        presetList.forEach(p => {
          const info = PLANER_TYPES[p.planerType];
          const hd = WOOD_HARDNESS[p.woodHardness];
          const r = computeForward(p.bladeAngle, p.cutDepth, hd ? hd.K : 4.5);
          rows.push([
            p.name,
            info ? info.name : p.planerType,
            p.bladeAngle,
            p.woodName || '',
            hd ? hd.name : '',
            p.cutDepth,
            round(r.chipMm, 3),
            round(r.forceN, 1),
            round(r.raUm, 2),
            hd ? hd.cycle : '',
            p.note || ''
          ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        });
      }

      const csv = '\uFEFF' + rows.join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
      a.download = `刨刀维护清单_${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // ==================== PRINT ====================
  function initPrint() {
    document.getElementById('btn-print').addEventListener('click', () => {
      buildPrintTable();
      buildPrintWoodLibrary();
      buildPrintCurrentWood();
      buildPrintCompare();
      setTimeout(() => window.print(), 200);
    });
  }

  function buildPrintTable() {
    const tbody = document.querySelector('#angle-table tbody');
    const html = REFERENCE_TABLE.map(row => `
      <tr>
        <td>${row.wood}</td>
        <td>${row.flat}</td>
        <td>${row.pressure}</td>
        <td>${row.groove}</td>
        <td>${row.edge}</td>
        <td>${row.bird}</td>
      </tr>
    `).join('');
    tbody.innerHTML = html;
    document.getElementById('print-date').textContent =
      new Date().toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric' });
  }

  function buildPrintWoodLibrary() {
    const tbody = document.querySelector('#wood-print-table tbody');
    const list = loadWoodLibrary();
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#999;font-style:italic;">暂无木材档案</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(w => {
      const hd = WOOD_HARDNESS[w.hardness];
      const pl = PLANER_TYPES[w.planerType];
      return `<tr>
        <td>${escapeHtml(w.name)}</td>
        <td>${hd ? hd.name : ''}</td>
        <td>${pl ? pl.name : ''}</td>
        <td>${w.angleMin}°–${w.angleMax}°</td>
        <td>${w.depth}mm</td>
        <td>${escapeHtml(w.note || '')}</td>
      </tr>`;
    }).join('');
  }

  function buildPrintCurrentWood() {
    const box = document.getElementById('print-current-wood');
    if (!state.currentWoodName) {
      box.innerHTML = '';
      box.className = '';
      return;
    }
    const hd = WOOD_HARDNESS[state.woodHardness];
    const pl = PLANER_TYPES[state.planerType];
    const r = computeForward(state.bladeAngle, state.cutDepth, hd ? hd.K : 4.5);
    box.className = 'print-current-wood';
    box.innerHTML = `
      <h3>当前加工木材</h3>
      <p><strong>${escapeHtml(state.currentWoodName)}</strong>（${hd ? hd.name : ''}）</p>
      <p>刨刀：${pl ? pl.name : ''}　角度：${state.bladeAngle}°　深度：${state.cutDepth}mm</p>
      <p>切屑厚度：${round(r.chipMm, 3)}mm　刨削力：${round(r.forceN, 1)}N　Ra：${round(r.raUm, 2)}μm</p>
    `;
  }

  function buildPrintCompare() {
    const box = document.getElementById('print-compare');
    if (!state.compareOpen) {
      box.innerHTML = '';
      box.className = '';
      return;
    }
    const a = resolveCompareSource(state.compareSelA);
    const b = resolveCompareSource(state.compareSelB);
    if (!a || !b) {
      box.innerHTML = '';
      box.className = '';
      return;
    }
    const hdA = WOOD_HARDNESS[a.woodHardness];
    const hdB = WOOD_HARDNESS[b.woodHardness];
    const plA = PLANER_TYPES[a.planerType];
    const plB = PLANER_TYPES[b.planerType];
    const rA = computeForward(a.bladeAngle, a.cutDepth, hdA ? hdA.K : 4.5);
    const rB = computeForward(b.bladeAngle, b.cutDepth, hdB ? hdB.K : 4.5);
    const noDiff = paramsEqual(a, b) ? '<p style="color:#E65100;font-weight:700;margin-top:8px;">⚠ 当前两组参数无差异</p>' : '';
    box.className = 'print-compare-section';
    box.innerHTML = `
      <h3>参数对比结果</h3>
      ${noDiff}
      <div class="print-compare-grid">
        <div class="print-compare-col">
          <h4>方案 A · ${escapeHtml(a.label)}</h4>
          <p>木材：${escapeHtml(a.woodName)}（${hdA ? hdA.name : ''}）</p>
          <p>刨刀：${plA ? plA.name : ''}　角度：${a.bladeAngle}°</p>
          <p>深度：${a.cutDepth}mm　切屑：${round(rA.chipMm, 3)}mm</p>
          <p>刨削力：${round(rA.forceN, 1)}N　Ra：${round(rA.raUm, 2)}μm</p>
        </div>
        <div class="print-compare-col">
          <h4>方案 B · ${escapeHtml(b.label)}</h4>
          <p>木材：${escapeHtml(b.woodName)}（${hdB ? hdB.name : ''}）</p>
          <p>刨刀：${plB ? plB.name : ''}　角度：${b.bladeAngle}°</p>
          <p>深度：${b.cutDepth}mm　切屑：${round(rB.chipMm, 3)}mm</p>
          <p>刨削力：${round(rB.forceN, 1)}N　Ra：${round(rB.raUm, 2)}μm</p>
        </div>
      </div>
    `;
  }

  // ==================== INIT ====================
  function init() {
    initPlanerTabs();
    initInputs();
    initHardnessSeg();
    initReverseToggle();
    initPresetModal();
    initWoodModal();
    initCompareToggle();
    initExport();
    initPrint();
    renderPresets();
    renderWoodLibrary();
    updateUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
