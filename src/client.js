// ============================================================
// ASHGRAVE — client
// Reads the engine state and draws it. Only sends commands.
// In co-op this layer stays the same; only where S comes from changes.
// ============================================================
(function () {
  'use strict';
  var E = Engine, R = DATA.rules, TICK = R.tick, PID = 'p1';
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), ctx = cv.getContext('2d');
  var dpr = 1, vw = 0, vh = 0, Z = 1, HW = 32, HH = 16;

  var S = null, running = false, explored = null, prev = new Map(), alpha = 0;
  var trialFailing = false, deadHits = [], deadLost = 0, deadWaiting = false, npcHits = [], shopId = null, swings = [], chains = [], corpses = [], parts = [], texts = [], hoverList = [], labels = [], hoverId = null, hoverLabel = null;
  var mapOpen = false, hurtFlash = 0, gameTime = 0, lastSave = 0;
  var mouse = { x: 0, y: 0, down: false, held: 'none', last: 0, touch: false };
  var oxC = 0, oyC = 0;

  // ---------- Saving ----------
  // Four character slots under one key. Each character carries its own format version
  // (Engine.SAVE_VERSION) and is upgraded by Engine.migrateCharacter when loaded.
  var STORE_KEY = 'ashgrave.saves', SLOTS = 4;
  var store = null, memStore = null, activeSlot = -1;
  // Saves from the Swedish build used Swedish item ids; map them over once.
  var OLD_BASES = { kortbage: 'short_bow', jaktbage: 'hunters_bow', langbage: 'long_bow', kompositbage: 'composite_bow', krigsbage: 'war_bow',
    huva: 'hood', hjalm: 'helm', stormhuva: 'storm_hood', laderrock: 'leather_coat', ringbrynja: 'ring_mail', pansar: 'plate',
    handskar: 'gloves', kedjehandskar: 'chain_gloves', stovlar: 'boots', jarnstovlar: 'iron_boots', amulett: 'amulet' };
  function fixOldIds(c) {
    if (c.name === 'Bågskytt') c.name = 'Archer';
    function fix(it) { if (it && OLD_BASES[it.base]) it.base = OLD_BASES[it.base]; }
    (c.inv || []).forEach(fix); Object.keys(c.eq || {}).forEach(function (k) { fix(c.eq[k]); });
    return c;
  }
  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function readLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function emptyStore() { return { version: 2, slots: [null, null, null, null], last: 0 }; }
  // Always re-read from disk, so two tabs (or a host and a client in one browser) never
  // overwrite each other's slots with a stale copy.
  function loadStore() {
    var raw = readLS(STORE_KEY), st = null;
    try { st = raw ? JSON.parse(raw) : null; } catch (e) { st = null; }
    if (!st && memStore) st = memStore;
    if (!st) {
      // First run on this version: bring over the single save from earlier builds.
      st = emptyStore();
      var old = null;
      try { old = JSON.parse(readLS('ashgrave.v1') || readLS('askgraven.v1') || 'null'); } catch (e) { old = null; }
      if (old && old.char) st.slots[0] = fixOldIds(old.char);
    }
    while (st.slots.length < SLOTS) st.slots.push(null);
    st.slots = st.slots.slice(0, SLOTS).map(function (c) {
      if (!c) return null;
      try { c = E.migrateCharacter(fixOldIds(c)); if (!c.id) c.id = newId(); if (!c.created) c.created = Date.now(); return c; } catch (e) { return null; }
    });
    var changed = !raw; store = st; if (changed) saveStore();
    return store;
  }
  function saveStore() {
    memStore = store;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); return true; } catch (e) { return false; }
  }
  function writeSave() {
    if (!S || activeSlot < 0) return;
    if (S.trial && !S.trialDone) return; // a Trial attempt only counts once it is won
    var p = S.players[PID];
    if (!p || !p.inv || !p.progress) return; // a client may not have the full character yet
    var c = E.characterOf(p);
    var prev = loadStore().slots[activeSlot]; // fresh read, then change only our own slot
    if (prev) { c.id = prev.id; c.created = prev.created; }
    c.savedAt = Date.now();
    store.slots[activeSlot] = c; store.last = activeSlot;
    saveStore();
  }

  // ---------- Audio (synthesized, no files) ----------
  var AC = null, master = null, noiseBuf = null, lastSfx = {}, muted = false;
  try { muted = localStorage.getItem('ashgrave.mute') === '1'; } catch (e) { }
  function ensureAudio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = 0.45; master.connect(AC.destination);
      noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { AC = null; }
  }
  function env(g, t0, vol, dur, att) {
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + (att || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function noise(dur, type, freq, q, vol, delay) {
    var t0 = AC.currentTime + (delay || 0), s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q; env(g, t0, vol, dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
  }
  function tone(type, f0, f1, dur, vol, delay) {
    var t0 = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    env(g, t0, vol, dur); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  var SFX = {
    swing: function () { noise(0.09, 'bandpass', 900, 1.2, 0.28); },
    cleave: function () { noise(0.18, 'bandpass', 650, 0.9, 0.38); tone('sawtooth', 160, 70, 0.14, 0.05); },
    bow: function () { noise(0.06, 'bandpass', 2600, 1.4, 0.3); tone('triangle', 210, 95, 0.12, 0.2); },
    multi: function () { noise(0.12, 'bandpass', 2000, 0.9, 0.35); tone('triangle', 240, 90, 0.16, 0.2); },
    hit: function () { noise(0.07, 'lowpass', 900, 1, 0.35); },
    bone: function () { noise(0.05, 'highpass', 2500, 2, 0.25); tone('square', 900, 500, 0.04, 0.05); },
    death: function () { noise(0.28, 'lowpass', 320, 1, 0.45); tone('sawtooth', 110, 40, 0.3, 0.06); },
    hurt: function () { tone('square', 150, 70, 0.14, 0.1); noise(0.09, 'lowpass', 500, 1, 0.3); },
    gold: function () { tone('triangle', 1500, 1500, 0.05, 0.12); tone('triangle', 2000, 2000, 0.08, 0.1, 0.05); },
    pick: function () { tone('sine', 520, 820, 0.09, 0.18); },
    rare: function () { [880, 1175, 1568].forEach(function (f, i) { tone('triangle', f, f, 0.3, 0.1, i * 0.08); }); },
    chant: function () { [330, 392, 494].forEach(function (f, i) { tone('sine', f, f * 1.01, 0.8, 0.07, i * 0.25); }); },
    level: function () { [440, 554, 659, 880].forEach(function (f, i) { tone('triangle', f, f, 0.4, 0.13, i * 0.09); }); },
    cast: function () { noise(0.35, 'bandpass', 520, 0.7, 0.22); },
    boom: function () { noise(0.2, 'lowpass', 400, 0.8, 0.3); },
    potion: function () { tone('sine', 300, 520, 0.16, 0.18); tone('sine', 330, 600, 0.16, 0.14, 0.12); },
    stairs: function () { noise(0.6, 'lowpass', 200, 0.7, 0.4); tone('sine', 90, 50, 0.6, 0.15); },
    die: function () { tone('sawtooth', 220, 55, 1.1, 0.12); noise(0.5, 'lowpass', 250, 1, 0.3); }
  };
  function sfx(n) {
    if (!AC || muted) return;
    var now = performance.now(); if (lastSfx[n] && now - lastSfx[n] < 45) return; lastSfx[n] = now;
    try { SFX[n](); } catch (e) { }
  }

  // ---------- Isometry ----------
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = window.innerWidth; vh = window.innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    Z = Math.max(vw < 640 ? 0.9 : 0.62, Math.min(1.25, Math.min(vw / 900, vh / 640)));
    HW = 32 * Z; HH = 16 * Z;
  }
  window.addEventListener('resize', resize); resize();
  function sx(x, y) { return (x - y) * HW + oxC; }
  function sy(x, y) { return (x + y) * HH + oyC; }
  function toWorld(px, py) { var a = (px - oxC) / HW, b = (py - oyC) / HH; return { x: (a + b) / 2, y: (b - a) / 2 }; }
  function screenAngle(f) { var dx = Math.cos(f) - Math.sin(f), dy = (Math.cos(f) + Math.sin(f)) * 0.5; return Math.atan2(dy, dx); }
  function lerpE(e) {
    var p = prev.get(e.id); if (!p) return { x: e.x, y: e.y };
    if (Math.abs(p[0] - e.x) + Math.abs(p[1] - e.y) > 2) return { x: e.x, y: e.y };
    return { x: p[0] + (e.x - p[0]) * alpha, y: p[1] + (e.y - p[1]) * alpha };
  }
  function hash(x, y) { var h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; }

  // ---------- Commands ----------
  function cmd(c) {
    if (MODE === 'client') { if (hostConn) { try { hostConn.send({ t: 'cmd', c: c }); } catch (e) { } } return; }
    if (S) E.command(S, PID, c);
  }
  function me() { return S && S.players[PID]; }
  function nearestVisibleMonster() {
    var p = me(), best = null, bd = 1e9; if (!p) return null;
    S.monsters.forEach(function (m) { var d = Math.hypot(m.x - p.x, m.y - p.y); if (d < p.st.light + 1 && d < bd) { bd = d; best = m; } });
    return best;
  }
  function castSkillAuto() {
    var p = me(); if (!p) return;
    var m = nearestVisibleMonster();
    if (m) cmd({ t: 'skill', x: m.x, y: m.y });
    else cmd({ t: 'skill', x: p.x + Math.cos(p.face) * 4, y: p.y + Math.sin(p.face) * 4 });
  }
  function monsterAt(mx, my) {
    var best = null, bd = 1e9, extra = mouse.touch ? 14 : 0;
    hoverList.forEach(function (h) { var d = Math.hypot(h.sx - mx, h.sy - my); if (d < h.r + extra && d < bd) { bd = d; best = h; } });
    return best ? S.monsters.filter(function (m) { return m.id === best.id; })[0] || null : null;
  }
  function npcAt(mx, my) {
    for (var i = 0; i < npcHits.length; i++) { var h = npcHits[i]; if (Math.hypot(h.sx - mx, h.sy - my) < h.r + (mouse.touch ? 12 : 0)) return h; }
    return null;
  }
  function labelAt(mx, my) {
    for (var i = labels.length - 1; i >= 0; i--) { var l = labels[i]; if (mx >= l.x && mx <= l.x + l.w && my >= l.y && my <= l.y + l.h) return l; }
    return null;
  }

  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('pointerdown', function (e) {
    if (!running) return;
    ensureAudio(); mouse.touch = e.pointerType === 'touch'; mouse.x = e.clientX; mouse.y = e.clientY;
    var p = me(); if (!p || p.dead) return;
    var w = toWorld(e.clientX, e.clientY);
    if (e.button === 2) {
      if (drawsBow(p)) { drawing = 'mouse'; cmd({ t: 'charge' }); return; }
      var mm = monsterAt(e.clientX, e.clientY); cmd({ t: 'skill', x: mm ? mm.x : w.x, y: mm ? mm.y : w.y }); return;
    }
    if (e.button !== 0) return;
    try { cv.setPointerCapture(e.pointerId); } catch (er) { }
    mouse.down = true; mouse.last = performance.now();
    var lab = labelAt(e.clientX, e.clientY);
    if (lab) { mouse.held = 'none'; if (lab.kind === 'stairs') cmd({ t: 'stairs' }); else if (lab.kind === 'npc') cmd({ t: 'talk', id: lab.id }); else if (lab.kind === 'revive') cmd({ t: 'revive', id: lab.id }); else cmd({ t: 'pickup', id: lab.id }); return; }
    for (var di = 0; di < deadHits.length; di++) { var dh = deadHits[di]; if (Math.hypot(dh.sx - e.clientX, dh.sy - e.clientY) < dh.r + (mouse.touch ? 12 : 0)) { mouse.held = 'none'; cmd({ t: 'revive', id: dh.id }); return; } }
    var nh = npcAt(e.clientX, e.clientY);
    if (nh) { mouse.held = 'none'; cmd({ t: 'talk', id: nh.id }); return; }
    var m = monsterAt(e.clientX, e.clientY);
    if (e.shiftKey) { mouse.held = 'shoot'; cmd({ t: 'shoot', x: m ? m.x : w.x, y: m ? m.y : w.y }); return; }
    if (m) { mouse.held = 'attack'; cmd({ t: 'attack', id: m.id }); return; }
    if (E.tileAt(S.map, w.x, w.y) === 2) { mouse.held = 'none'; cmd({ t: 'stairs' }); return; }
    mouse.held = 'move'; cmd({ t: 'move', x: w.x, y: w.y });
  });
  cv.addEventListener('pointermove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; if (e.pointerType !== 'touch') mouse.touch = false; });
  function up() { mouse.down = false; mouse.held = 'none'; }
  // Sunwarden draws Multishot while the skill button is held and lets go on release.
  var drawing = null;
  function drawsBow(p) { return !!(p && p.ascendancy && DATA.ascendancies[p.ascendancy].core.charge); }
  function releaseDraw() {
    if (!drawing) return; drawing = null;
    var w = toWorld(mouse.x, mouse.y), m = monsterAt(mouse.x, mouse.y);
    cmd({ t: 'skill', x: m ? m.x : w.x, y: m ? m.y : w.y });
  }
  window.addEventListener('pointerup', function (e) { if (e.button === 2 && drawing === 'mouse') releaseDraw(); });
  window.addEventListener('keyup', function (e) { if (drawing === 'key' && e.key.toLowerCase() === keys.skill) releaseDraw(); });
  window.addEventListener('blur', function () { if (drawing) releaseDraw(); });
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  function handleHold(now) {
    if (!mouse.down || !running) return;
    var p = me(); if (!p || p.dead) return;
    var w = toWorld(mouse.x, mouse.y);
    if (mouse.held === 'move' && now - mouse.last > 170) { mouse.last = now; cmd({ t: 'move', x: w.x, y: w.y }); }
    else if (mouse.held === 'shoot' && now - mouse.last > 90) { mouse.last = now; var m = monsterAt(mouse.x, mouse.y); cmd({ t: 'shoot', x: m ? m.x : w.x, y: m ? m.y : w.y }); }
    else if (mouse.held === 'attack' && !p.order && now - mouse.last > 120) {
      mouse.last = now; var m2 = monsterAt(mouse.x, mouse.y); if (m2) cmd({ t: 'attack', id: m2.id });
    }
  }

  // ---------- Key bindings ----------
  var DEFAULT_KEYS = { potionHp: '1', potionMp: '2', skill: 'q', character: 'c', inventory: 'i', map: 'tab' };
  var KEY_LABELS = { potionHp: 'Healing potion', potionMp: 'Mana potion', skill: 'Class skill', character: 'Character', inventory: 'Inventory', map: 'Map' };
  var keys = Object.assign({}, DEFAULT_KEYS), capturing = null, paused = false, settingsFrom = 'title';
  try { var savedKeys = JSON.parse(localStorage.getItem('ashgrave.keys') || 'null'); if (savedKeys) Object.keys(DEFAULT_KEYS).forEach(function (a) { if (typeof savedKeys[a] === 'string') keys[a] = savedKeys[a]; }); } catch (e) { }
  function saveKeys() { try { localStorage.setItem('ashgrave.keys', JSON.stringify(keys)); } catch (e) { } }
  function keyName(k) { return k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1); }
  function refreshKeyLabels() {
    document.querySelectorAll('[data-bind]').forEach(function (el) { el.textContent = keyName(keys[el.getAttribute('data-bind')]); });
  }
  function renderBinds() {
    $('bindList').innerHTML = Object.keys(DEFAULT_KEYS).map(function (a) {
      return '<div class="bind"><span>' + KEY_LABELS[a] + '</span><button class="tb" data-rebind="' + a + '">' + (capturing === a ? 'Press a key…' : keyName(keys[a])) + '</button></div>';
    }).join('');
  }
  function openSettings(from) { settingsFrom = from; capturing = null; renderBinds(); $('settings').hidden = false; $('menu').hidden = true; }
  function closeSettings() { capturing = null; $('settings').hidden = true; if (settingsFrom === 'menu') $('menu').hidden = false; }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-rebind]') : null; if (!b) return;
    capturing = b.dataset.rebind; renderBinds();
  });
  $('bindReset').addEventListener('click', function () { keys = Object.assign({}, DEFAULT_KEYS); saveKeys(); capturing = null; renderBinds(); refreshKeyLabels(); });
  $('bindBack').addEventListener('click', closeSettings);
  $('tKeys').addEventListener('click', function () { openSettings('title'); });

  // ---------- Menu (Esc) ----------
  function openMenu() {
    $('menu').hidden = false; paused = MODE === 'solo';
    $('menuNote').textContent = S && S.trial && !S.trialDone ? 'The game is paused. Leaving abandons this attempt; nothing is lost.' : MODE === 'solo' ? 'The game is paused.' : MODE === 'host' ? 'The game keeps running for your friends. Leaving closes the room for everyone.' : 'The game keeps running. Leaving takes you out of the room.';
    $('mQuit').textContent = S && S.trial && !S.trialDone ? 'Abandon the Trial' : MODE === 'solo' ? 'Save and quit to main menu' : 'Leave and return to main menu';
    mouse.down = false;
  }
  function closeMenu() { $('menu').hidden = true; paused = false; }
  function handleEscape() {
    if (capturing) { capturing = null; renderBinds(); return; }
    if (!$('altar').hidden) { closeAltar(); return; }
    if (!$('settings').hidden) { closeSettings(); return; }
    if (!$('menu').hidden) { closeMenu(); return; }
    var anyOpen = !$('charPanel').hidden || !$('invPanel').hidden || !$('shopPanel').hidden || !$('talkPanel').hidden || mapOpen;
    if (anyOpen) { closePanel('charPanel'); closePanel('invPanel'); closePanel('shopPanel'); closePanel('talkPanel'); mapOpen = false; return; }
    if (running || MODE === 'client') openMenu();
  }
  $('mResume').addEventListener('click', closeMenu);
  $('mSettings').addEventListener('click', function () { openSettings('menu'); });
  $('mQuit').addEventListener('click', function () {
    if (MODE === 'host') conns.forEach(function (c) { try { c.send({ t: 'bye' }); } catch (er) { } });
    closeMenu(); leaveToTitle('');
  });
  $('bMenu').addEventListener('click', function () { if (running) openMenu(); });

  window.addEventListener('keydown', function (e) {
    if (capturing) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { capturing = null; renderBinds(); return; }
      var nk = e.key.toLowerCase();
      // Swap with whichever action already uses this key.
      Object.keys(keys).forEach(function (a) { if (keys[a] === nk && a !== capturing) keys[a] = keys[capturing]; });
      keys[capturing] = nk; capturing = null; saveKeys(); renderBinds(); refreshKeyLabels();
      return;
    }
    var k = e.key.toLowerCase();
    if (k === 'escape') { e.preventDefault(); handleEscape(); return; }
    if (!running || !$('menu').hidden || !$('settings').hidden) return;
    if (k === keys.map) { e.preventDefault(); mapOpen = !mapOpen; return; }
    if (e.repeat && k !== keys.skill) return;
    ensureAudio();
    if (k === keys.potionHp) cmd({ t: 'potion', kind: 'hp' });
    else if (k === keys.potionMp) cmd({ t: 'potion', kind: 'mp' });
    else if (k === keys.skill) {
      if (drawsBow(me())) { if (!e.repeat && !drawing) { drawing = 'key'; cmd({ t: 'charge' }); } }
      else { var w = toWorld(mouse.x, mouse.y), m = monsterAt(mouse.x, mouse.y); cmd({ t: 'skill', x: m ? m.x : w.x, y: m ? m.y : w.y }); }
    }
    else if (k === keys.character) toggle('charPanel');
    else if (k === keys.inventory) toggle('invPanel');
  });
  refreshKeyLabels();

  // ---------- Effects from engine events ----------
  function spray(x, y, n, opt) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, s = (opt.speed || 1.5) * (0.4 + Math.random());
      parts.push({ x: x, y: y, h: opt.h != null ? opt.h : 14, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vh: (opt.up || 80) * (0.5 + Math.random()),
        life: opt.life || 0.6, max: opt.life || 0.6, c: opt.colors[i % opt.colors.length], s: opt.size || 2, glow: !!opt.glow, grav: opt.grav != null ? opt.grav : 380 });
    }
  }
  function floatText(x, y, txt, color, big) { texts.push({ x: x, y: y, h: 30, txt: txt, c: color, life: big ? 1.6 : 0.9, max: big ? 1.6 : 0.9, big: !!big }); }
  var MCOL = { judge: ['#c9c2d8', '#3a3644', '#f4f0ff'], abbot: ['#ff7a2a', '#4a1612', '#ffd27a'], gnawer: ['#5b1010', '#7a1a14', '#3a0a0a'], bonewalker: ['#e2d8c4', '#b9ad96', '#8c816d'], ashpriest: ['#77706a', '#4c4642', '#a19a92'] };

  function processEvents() {
    var evs = S.events; S.events = [];
    if (MODE === 'host') for (var k = 0; k < evs.length; k++) pendingEv.push(evs[k]);
    handleEvents(evs);
  }
  function handleEvents(evs) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      switch (e.t) {
        case 'level':
          explored = new Uint8Array(S.map.W * S.map.H); corpses = []; parts = []; texts = []; prev.clear();
          setDepthLabel();
          if (e.depth > 1) { addLog('You descend to level ' + e.depth + '.', 'gold'); sfx('stairs'); }
          writeSave(); break;
        case 'shoot':
          if (e.pid === PID) sfx(e.multi ? 'multi' : 'bow');
          if (e.draw >= 1) { var sp = S.players[e.pid]; if (sp) spray(sp.x, sp.y, 14, { colors: ['#ffffff', '#fff1b0', '#ffe08a'], speed: 1.6, up: 120, life: 0.4, size: 2, glow: true, h: 20 }); }
          break;
        case 'hit':
          spray(e.x, e.y, e.light ? 7 : 5, { colors: MCOL[e.mtype], speed: 1.6, up: 90, life: 0.5, size: 2 });
          if (e.light) spray(e.x, e.y, 6, { colors: ['#ffffff', '#fff1b0', '#ffe08a'], speed: 1.4, up: 140, life: 0.35, size: 1.8, glow: true, grav: -10 });
          if (e.dark) spray(e.x, e.y, 4, { colors: ['#2a1838', '#6a3aa0', '#b48cff'], speed: 0.6, up: 60, life: 0.6, size: 2.2, grav: -20 });
          floatText(e.x, e.y, String(e.v), e.light ? '#fff1b0' : '#efe6d6');
          if (e.ambush) { floatText(e.x, e.y - 0.3, 'Ambush!', '#c9a2ff', true); spray(e.x, e.y, 10, { colors: ['#2a1838', '#7a4ab0', '#c9a2ff'], speed: 1.4, up: 110, life: 0.6, glow: true, size: 2 }); }
          sfx(e.mtype === 'bonewalker' ? 'bone' : 'hit'); break;
        case 'dot':
          floatText(e.x + 0.15, e.y, String(e.v), e.big ? '#e0b0ff' : '#b48cff', !!e.big); break;
        case 'rip':
          spray(e.x, e.y, 26, { colors: ['#1a0a12', '#7a1030', '#b48cff', '#e0d0ff'], speed: 2.4, up: 160, life: 0.7, size: 2.6, grav: 30 });
          sfx('hit'); break;
        case 'dodge':
          floatText(e.x, e.y, 'Dodged', '#cfe3ff'); break;
        case 'nodeTaken':
          if (e.pid === PID) { addLog(nodeName(e.id) + ' is now rank ' + e.rank + '.', 'gold'); sfx('level'); renderPanels(); }
          break;
        case 'block':
          floatText(e.x, e.y, 'Blocked', '#f0d890'); spray(e.x, e.y, 6, { colors: ['#fff3c0', '#f0d06a'], speed: 1.2, up: 100, life: 0.35, glow: true, size: 2, h: 18 });
          if (e.pid === PID) sfx('bone'); break;
        case 'fade':
          spray(e.x, e.y, 22, { colors: ['#0c0810', '#2a1838', '#4a3060'], speed: 1.6, up: 60, life: 0.9, size: 3.5, grav: -20 });
          if (e.pid === PID) floatText(e.x, e.y, 'Fade', '#a890c8'); break;
        case 'death':
          corpses.push({ x: e.x, y: e.y, type: e.mtype, champ: e.champ, boss: e.boss, t: gameTime, seed: Math.random() * 1000 | 0, face: e.face });
          spray(e.x, e.y, e.champ ? 26 : 14, { colors: MCOL[e.mtype], speed: 2.2, up: 140, life: 0.8, size: 2.5 });
          if (e.mtype === 'ashpriest') spray(e.x, e.y, 10, { colors: ['#ff7a2a', '#ffcf80'], speed: 1, up: 160, life: 0.9, glow: true, grav: -60, size: 2 });
          sfx('death'); break;
        case 'phit':
          if (e.pid === PID) { hurtFlash = 0.35; floatText(e.x, e.y, String(e.v), '#ff5f55'); sfx('hurt'); spray(e.x, e.y, 4, { colors: ['#7a1010', '#a3191f'], speed: 1.2, life: 0.4 }); }
          break;
        case 'pdeath':
          if (e.pid === PID && e.trial) {
            trialFailing = true; deadLost = 0; deadWaiting = false;
            $('dead').classList.remove('waiting'); $('giveUp').hidden = true;
            $('deadTxt').textContent = 'The Trial is lost. Nothing was taken from you. You return to the surface to try again.';
            $('dead').hidden = false; sfx('die'); mouse.down = false;
            setTimeout(function () { if (S && S.trial && trialFailing) leaveToTitle('You fell in the Trial. Nothing was lost. Try again when you are ready.'); }, 3600);
            break;
          }
          if (e.pid === PID) {
            deadLost = e.lost; deadWaiting = !!e.waiting;
            $('dead').classList.toggle('waiting', deadWaiting); $('giveUp').hidden = !deadWaiting;
            $('deadTxt').textContent = (e.lost ? 'You dropped ' + e.lost + ' gold. ' : '') + 'You will wake at the start of the level.';
            $('dead').hidden = false; sfx('die'); mouse.down = false; writeSave();
          } else if (S.players[e.pid]) addLog(S.players[e.pid].name + ' has fallen. Click their body to resurrect them.', 'warn');
          break;
        case 'respawn': if (e.pid === PID) $('dead').hidden = true; break;
        case 'reviveStart': sfx('chant'); break;
        case 'revived':
          spray(e.x, e.y, 34, { colors: ['#fff2c0', '#f0d06a', '#ffffff'], speed: 0.6, up: 320, life: 1.3, glow: true, grav: 60, size: 2.5 });
          sfx('level');
          if (e.pid === PID) { $('dead').hidden = true; addLog(e.by + ' brought you back.', 'rare'); }
          else addLog(e.name + ' was resurrected by ' + e.by + '.', 'rare');
          break;
        case 'levelup':
          spray(e.x, e.y, 30, { colors: ['#f0d06a', '#ffe9a8', '#b38f58'], speed: 1.8, up: 220, life: 1.1, glow: true, grav: 120, size: 2.5 });
          floatText(e.x, e.y, 'Level ' + e.level, '#f0d06a', true);
          if (e.pid === PID) { addLog('You reached level ' + e.level + '. Five new points to spend.', 'rare'); sfx('level'); writeSave(); }
          break;
        case 'pickup':
          if (e.pid !== PID) break;
          if (e.kind === 'gold') { floatText(e.x, e.y, e.text, '#d9b46c'); sfx('gold'); }
          else if (e.kind === 'potion') { addLog('Picked up: ' + e.text); sfx('pick'); }
          else { addLog('Picked up: ' + e.text, e.rarity === 3 ? 'unique' : e.rarity === 2 ? 'rare' : e.rarity === 1 ? 'magic' : ''); sfx(e.rarity >= 2 ? 'rare' : 'pick'); }
          break;
        case 'itemdrop':
          if (e.rarity === 3) { sfx('rare'); addLog('A unique item drops!', 'unique'); spray(e.x, e.y, 28, { colors: ['#c070ff', '#e8c8ff', '#8a3ad0'], speed: 0.8, up: 320, life: 1.5, glow: true, grav: 150, size: 2.4 }); }
          else if (e.rarity === 2) { sfx('rare'); spray(e.x, e.y, 16, { colors: ['#f0d06a', '#fff2c0'], speed: 0.6, up: 260, life: 1.2, glow: true, grav: 150, size: 2 }); }
          break;
        case 'msg': if (e.pid === PID) addLog(e.text, 'warn', e.quiet); break;
        case 'potion':
          if (e.pid === PID) { sfx('potion'); spray(e.x, e.y, 12, { colors: e.kind === 'hp' ? ['#ff5a4f', '#ff9a8a'] : ['#7d9bff', '#b5c7ff'], speed: 0.7, up: 150, life: 0.8, glow: true, grav: -30, size: 2 }); }
          break;
        case 'cast': sfx('cast'); break;
        case 'bossAppear':
          addLog((e.isTrue ? 'The air burns. ' : 'Something old stirs by the stairs: ') + e.name + '.', e.isTrue ? 'warn' : 'rare');
          if (e.isTrue) sfx('die'); break;
        case 'bossCast':
          floatText(e.x, e.y, e.name + '!', e.name === 'Withering Curse' ? '#c9a4ff' : '#ffa04a', true); sfx('cast'); break;
        case 'curse':
          spray(e.x, e.y, 18, { colors: ['#b48cff', '#7a4ad9', '#e0d0ff'], speed: 0.7, up: 120, life: 0.9, glow: true, grav: -20, size: 2 });
          if (e.pid === PID) { addLog('Withering Curse: your attacks are slowed for ' + e.dur + ' seconds.', 'warn'); sfx('hurt'); }
          break;
        case 'sealBroken': addLog('The seal on the stairs breaks.', 'gold'); sfx('stairs'); break;
        case 'bossDeath':
          spray(e.x, e.y, 60, { colors: ['#ffd27a', '#ff7a2a', '#fff2c0'], speed: 2.4, up: 300, life: 1.5, glow: true, grav: 140, size: 3 });
          addLog(e.isTrue ? e.name + ' is destroyed. The fire beneath Ashgrave dims, for now.' : e.name + ' has fallen.', 'rare'); sfx('level');
          break;
        case 'trialStart': addLog('Three seals, three guardians. Beyond them waits the Judge.', 'warn'); addLog('You carry ' + DATA.trial.potions.hp + ' healing potions. Fall, and the Trial begins again.', ''); break;
        case 'gateOpen':
          spray(e.x, e.y, 30, { colors: ['#ff7a5a', '#ffd0a0', '#b02a1a'], speed: 1.4, up: 220, life: 1.1, glow: true, grav: 60, size: 2.5 });
          addLog('A seal breaks. The ash gives back some of your strength.', 'gold'); sfx('stairs'); setDepthLabel(); break;
        case 'hazardBoom':
          spray(e.x, e.y, 22, { colors: ['#ffffff', '#d8c8ff', '#9a7aff'], speed: 2.2, up: 160, life: 0.6, glow: true, grav: 200, size: 2.5 });
          sfx('boom'); break;
        case 'frenzy': floatText(e.x, e.y, 'Frenzied!', '#ff6a4a', true); spray(e.x, e.y, 20, { colors: ['#ff3a2a', '#ff9a6a'], speed: 1.4, up: 160, life: 0.7, glow: true, size: 2.5 }); break;
        case 'blink':
          spray(e.x, e.y, 16, { colors: ['#1a1022', '#5a3a7a', '#d8c8ff'], speed: 1, up: 120, life: 0.6, glow: true, grav: -40, size: 2.5 });
          spray(e.x2, e.y2, 16, { colors: ['#1a1022', '#5a3a7a', '#d8c8ff'], speed: 1, up: 120, life: 0.6, glow: true, grav: -40, size: 2.5 });
          sfx('cast'); break;
        case 'trialDone':
          spray(e.x, e.y, 60, { colors: ['#ffffff', '#d8c8ff', '#f0d06a'], speed: 2, up: 320, life: 1.8, glow: true, grav: 80, size: 3 });
          addLog(e.name + ' is won. Nightmare is open to you.', 'rare'); addLog('The Veiled Keeper waits beside the Judge\'s ashes.', 'rare');
          sfx('level'); setDepthLabel(); writeSave(); break;
        case 'difficultyDone':
          spray(e.x, e.y, 40, { colors: ['#b48cff', '#7a4ad9', '#e0d0ff'], speed: 1.2, up: 260, life: 1.6, glow: true, grav: 40, size: 2.5 });
          addLog(e.name + ' is complete. A dark portal tears open where the Abbot fell.', 'rare'); sfx('stairs'); writeSave(); break;
        case 'dialog': if (e.pid === PID) openTalk(e.id, e.kind, e.difficulty); break;
        case 'merchant': addLog(e.name + ' has set up camp on this level.', 'gold'); break;
        case 'shop': if (e.pid === PID) openShop(e.id); break;
        case 'buy': if (e.pid === PID) { sfx('gold'); addLog('Bought ' + e.name + ' for ' + e.price + ' gold.'); } break;
        case 'chain':
          chains.push({ x: e.x, y: e.y, x2: e.x2, y2: e.y2, t: 0 });
          spray(e.x2, e.y2, 8, { colors: ['#ffffff', '#fff1b0', '#ffe08a'], speed: 1.2, up: 120, life: 0.4, size: 1.8, glow: true, grav: -10 }); break;
        case 'swing': swings.push({ x: e.x, y: e.y, face: e.face, arc: e.arc, big: !!e.big, reach: e.reach, t: 0 }); sfx(e.big ? 'cleave' : 'swing'); break;
        case 'wall':
          if (e.kind === 'bolt') { spray(e.x, e.y, 10, { colors: ['#ff7a2a', '#ffcf80'], speed: 1.4, up: 100, life: 0.5, glow: true, size: 2 }); sfx('boom'); }
          else spray(e.x, e.y, 3, { colors: ['#6b5d50', '#4a3f36'], speed: 0.8, up: 40, life: 0.3, size: 1.5 });
          break;
      }
    }
  }

  // ---------- Log ----------
  var lastLogText = '', lastLogAt = 0;
  function addLog(text, cls, quiet) {
    var now = performance.now();
    if (text === lastLogText && now - lastLogAt < 1500) return;
    lastLogText = text; lastLogAt = now;
    var box = $('log'), d = document.createElement('div');
    d.textContent = text; if (cls) d.className = cls;
    box.appendChild(d);
    while (box.children.length > 6) box.removeChild(box.firstChild);
    setTimeout(function () { d.style.opacity = '0'; setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 700); }, quiet ? 1800 : 6000);
  }

  // ---------- Drawing: environment ----------
  function diamond(x, y, h) {
    ctx.beginPath();
    ctx.moveTo(sx(x, y), sy(x, y) - (h || 0)); ctx.lineTo(sx(x + 1, y), sy(x + 1, y) - (h || 0));
    ctx.lineTo(sx(x + 1, y + 1), sy(x + 1, y + 1) - (h || 0)); ctx.lineTo(sx(x, y + 1), sy(x, y + 1) - (h || 0)); ctx.closePath();
  }
  // ---------- Tile art (from assets/dungeon-tiles.svg) ----------
  // The SVG atlas is rasterised once at 2x into a canvas; until then the code-drawn tiles are used.
  var tileCanvas = null, tilesReady = false, TA = 2;
  (function loadTiles() {
    if (typeof TILE_ATLAS === 'undefined') return;
    var img = new Image();
    img.onload = function () {
      try {
        tileCanvas = document.createElement('canvas'); tileCanvas.width = 512 * TA; tileCanvas.height = 224 * TA;
        tileCanvas.getContext('2d').drawImage(img, 0, 0, tileCanvas.width, tileCanvas.height);
        tilesReady = true;
      } catch (e) { tilesReady = false; }
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(TILE_ATLAS.svg);
  })();
  // ---------- Character sprites (sprites/*.webp, meta from sprites.json) ----------
  // Sheets: one row per direction (S, SW, W, NW, N, NE, E, SE), one column per frame.
  // Figures are drawn inside the per-entity transform (translate to the feet, scale by Z), where
  // one source pixel at 128 px per tile is 0.5 units.
  var SPR = typeof SPRITES !== 'undefined' ? SPRITES : null, sprImg = {};
  if (SPR) Object.keys(SPR.img).forEach(function (k) { var im = new Image(); im.src = SPR.img[k]; sprImg[k] = im; });
  function sprOk(name) { var im = sprImg[name]; return !!(im && im.complete && im.naturalWidth); }
  function dirIndex(face) {
    var i = Math.round((screenAngle(face) - Math.PI / 2) / (Math.PI / 4));
    return ((i % 8) + 8) % 8;
  }
  function hasSprite(actor) { return !!(SPR && SPR.meta.actors[actor] && sprOk(actor + '-idle')); }
  // Draws one frame with the feet at (0,0) of the current transform. Returns false if the sheet is missing.
  function drawSprite(actor, anim, dir, frame, extra) {
    var meta = SPR && SPR.meta.actors[actor]; if (!meta) return false;
    var info = meta.animations[anim] ? anim : 'idle', file = actor + '-' + info;
    if (!sprOk(file)) { info = 'idle'; file = actor + '-idle'; if (!sprOk(file)) return false; }
    var a = meta.animations[info], fs = meta.frameSize, an = meta.anchor, s = 0.5 * (meta.pxScale || 1) * (extra || 1);
    var f = Math.max(0, Math.min(a.frames - 1, frame | 0));
    ctx.drawImage(sprImg[file], f * fs, dir * fs, fs, fs, -an[0] * s, -an[1] * s, fs * s, fs * s);
    return true;
  }
  function loopFrame(actor, anim, fps, offset) {
    var meta = SPR.meta.actors[actor], a = meta && meta.animations[anim]; if (!a) return 0;
    return Math.floor(gameTime * fps + (offset || 0)) % a.frames;
  }
  function onceFrame(actor, anim, progress) {
    var meta = SPR.meta.actors[actor], a = meta && meta.animations[anim]; if (!a) return 0;
    return Math.min(a.frames - 1, Math.floor(Math.max(0, progress) * a.frames));
  }
  // The idle sheets only hold two alternating poses, which looks like twitching when played.
  // Stand in the first pose and let the game add a slow breath instead.
  function drawIdle(actor, dir, extra, phase) {
    var b = 1 + 0.014 * Math.sin(gameTime * 2.1 + (phase || 0));
    ctx.save(); ctx.scale(1 + (1 - b) * 0.5, b);
    var ok = drawSprite(actor, 'idle', dir, 0, extra);
    ctx.restore();
    return ok;
  }
  // The walk sheets barely move the legs and the frames differ mostly in cloak and arms, so
  // played straight they flicker and glide. Blend each frame into the next and add a step:
  // a small lift twice per cycle and a slight sway.
  function drawWalk(actor, dir, extra, fps, phase) {
    var meta = SPR.meta.actors[actor], n = meta.animations.walk.frames;
    var cyc = gameTime * fps + (phase || 0), f = Math.floor(cyc) % n, k = cyc - Math.floor(cyc);
    var stepPhase = (cyc / n) * Math.PI * 2;
    var lift = Math.abs(Math.sin(stepPhase)) * 2.2, sway = Math.sin(stepPhase) * 0.035;
    ctx.save(); ctx.translate(0, -lift); ctx.rotate(sway);
    var ok = drawSprite(actor, 'walk', dir, f, extra);
    if (ok && k > 0.05) { ctx.globalAlpha *= k; drawSprite(actor, 'walk', dir, (f + 1) % n, extra); }
    ctx.restore();
    return ok;
  }
  // The warrior sheet's middle strike frames always face the same way whatever the direction,
  // so use only the frames that follow the facing (wind-up, raise, recover) and a short lunge;
  // the swing trail the game already draws shows the strike itself.
  function drawWarriorAttack(dir, progress, face) {
    var f = progress < 0.3 ? 0 : progress < 0.65 ? 1 : 5;
    var lunge = Math.sin(Math.min(1, progress) * Math.PI) * 5, sa = screenAngle(face || 0);
    ctx.save(); ctx.translate(Math.cos(sa) * lunge, Math.sin(sa) * lunge * 0.5);
    var ok = drawSprite('warrior', 'attack', dir, f);
    ctx.restore();
    return ok;
  }
  var ATK_TIME = { gnawer: 0.28, bonewalker: 0.45, ashpriest: 0.6, abbot: 0.5 };
  function drawPlayerSprite(p) {
    var actor = p.cls === 'warrior' ? 'warrior' : 'archer', dir = dirIndex(p.face || 0);
    if (p.anim > 0) {
      if (actor === 'warrior') return drawWarriorAttack(dir, 1 - p.anim / 0.25, p.face);
      return drawSprite(actor, 'attack', dir, onceFrame(actor, 'attack', 1 - p.anim / 0.25));
    }
    if (p.moving) return drawWalk(actor, dir, 1, 9, (p.id || '').length);
    return drawIdle(actor, dir, 1, (p.id || '').length);
  }
  function drawMonsterSprite(m) {
    var actor = m.type, dir = dirIndex(m.face || 0), off = (m.id || 0) % 7, extra = 1;
    if (actor === 'abbot' && m.scale) extra = 1 / m.scale; // the Abbot has his own large sheet
    if (m.atk > 0) {
      var anim = 'attack', total = ATK_TIME[actor] || 0.5;
      if (actor === 'ashpriest') anim = 'cast';
      if (actor === 'abbot' && m.cast === 'volley') { anim = 'fireball-volley'; total = DATA.bosses.abbot.volley.cast; }
      if (actor === 'abbot' && m.cast === 'curse') { anim = 'withering-curse'; total = DATA.bosses.abbot.curse.cast; }
      return drawSprite(actor, anim, dir, onceFrame(actor, anim, 1 - m.atk / total), extra);
    }
    if (m.hitT > 0) return drawSprite(actor, 'hit', dir, m.hitT > 0.07 ? 0 : 1, extra);
    if (m.moving) return drawWalk(actor, dir, extra, actor === 'gnawer' ? 12 : 8, off);
    return drawIdle(actor, dir, extra, off);
  }
  var GROUND_SPR = { weapon: 'ground-bow', melee: 'ground-melee_weapon', helm: 'ground-helm', chest: 'ground-armor', gloves: 'ground-gloves', boots: 'ground-boots', ring: 'ground-ring', amulet: 'ground-amulet' };
  var ICON_SPR = { weapon: 'icon-short_bow', melee: 'icon-short_sword', helm: 'icon-helm', chest: 'icon-leather_coat', gloves: 'icon-gloves', boots: 'icon-boots', ring: 'icon-ring', amulet: 'icon-amulet' };
  function itemKind(it) { return it.slot === 'weapon' && E.baseOf(it).wclass === 'melee' ? 'melee' : it.slot === 'ring2' ? 'ring' : it.slot; }
  function drawGroundSprite(name) {
    if (!sprOk(name)) return false;
    ctx.drawImage(sprImg[name], -24 * 0.5, -24 * 0.5, 48 * 0.5, 32 * 0.5);
    return true;
  }
  function blit(name, dx, dy, s) {
    var c = TILE_ATLAS.cells[name];
    ctx.drawImage(tileCanvas, c[0] * TA, c[1] * TA, c[2] * TA, c[3] * TA, dx, dy, c[2] * s, c[3] * s);
  }
  function floorVariant(h) {
    var k = (h >>> 0) % 1000;
    return k < 800 ? 'floor-stone' : k < 870 ? 'floor-cracked' : k < 920 ? 'floor-moss' : k < 960 ? 'floor-rubble' : k < 990 ? 'floor-blood' : 'floor-rune';
  }
  // ---------- Painted environment (floor, walls, stairs, gates, props) ----------
  var ENV = sprOk('floor-stone') ? true : null;
  function envOk() { if (ENV === null || ENV === false) ENV = sprOk('floor-stone') && sprOk('wall-straight'); return ENV; }
  function envFloor(h) {
    var k = h % 1000;
    return k < 480 ? 'floor-stone' : k < 800 ? 'floor-stone-b' : k < 870 ? 'floor-cracked' : k < 915 ? 'floor-moss' : k < 950 ? 'floor-rubble' : k < 975 ? 'floor-ash' : k < 992 ? 'floor-blood' : 'floor-rune';
  }
  // Decorated faces only where they look into a room: l = the face toward +y, r = the face toward +x.
  function envWall(tx, ty, h) {
    var L = isFloor(tx, ty + 1), Rr = isFloor(tx + 1, ty);
    if (!L && !Rr) return 'wall-straight';
    var side = L && Rr ? ((h >>> 9) & 1 ? '-l' : '-r') : L ? '-l' : '-r', k = (h >>> 3) % 1000;
    var kind = k < 70 ? 'cracked' : k < 140 ? 'moss' : k < 170 ? 'torch' : k < 192 ? 'banner' : null;
    return kind ? 'wall-' + kind + side : 'wall-straight';
  }
  var lamps = [];
  // Props are decoration only: they never block movement, so they sit along the walls, out of the way.
  var PROP_KINDS = [['brazier', 0.62, 220], ['urn', 0.5, 440], ['skeleton-remains', 0.6, 620], ['rubble-pile', 0.6, 780], ['broken-pillar', 0.72, 880], ['floor-grate', 0.62, 1000]];
  var propMap = null, propKey = '';
  function buildProps() {
    var map = S.map, key = S.seed + ':' + S.depth + ':' + (S.trial ? 't' : '');
    if (propKey === key && propMap) return propMap;
    propKey = key; propMap = {};
    var placed = [], salt = (S.seed & 0xffff) ^ (S.depth * 977), W = map.W, H = map.H;
    var st = map.start || { x: -99, y: -99 }, sr = map.stairs || { x: -99, y: -99 };
    for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
      if (map.t[y * W + x] !== 1) continue;
      var nW = map.t[y * W + x - 1] === 0, nE = map.t[y * W + x + 1] === 0, nN = map.t[(y - 1) * W + x] === 0, nS = map.t[(y + 1) * W + x] === 0;
      // Only against the walls behind (north and west on screen), so the walls in front never hide them.
      if (!(nW || nN) || nE || nS) continue;
      var h = hash(x + salt, y - salt);
      if (h % 1000 >= 110) continue;
      if (Math.hypot(x + 0.5 - st.x, y + 0.5 - st.y) < 4 || Math.hypot(x + 0.5 - sr.x, y + 0.5 - sr.y) < 3) continue;
      if (placed.some(function (p) { return Math.abs(p[0] - x) + Math.abs(p[1] - y) < 5; })) continue;
      var r = hash(h & 0xffff, 7919) % 1000, kd = PROP_KINDS[PROP_KINDS.length - 1];
      for (var i = 0; i < PROP_KINDS.length; i++) if (r < PROP_KINDS[i][2]) { kd = PROP_KINDS[i]; break; }
      var ox = nW ? -0.18 : 0, oy = nN ? -0.18 : 0;
      placed.push([x, y]);
      propMap[y * W + x] = { kind: kd[0], scale: kd[1], x: x + 0.5 + ox, y: y + 0.5 + oy, flip: (h >>> 20) & 1 };
    }
    return propMap;
  }
  function drawProp(pr) {
    var name = 'prop-' + pr.kind; if (!sprOk(name)) return;
    var s = 2 * HW / 128 * pr.scale, x = sx(pr.x, pr.y), y = sy(pr.x, pr.y);
    ctx.save(); ctx.translate(x, y); if (pr.flip && pr.kind !== 'brazier') ctx.scale(-1, 1);
    ctx.drawImage(sprImg[name], -64 * s, -120 * s, 128 * s, 128 * s);
    ctx.restore();
    if (pr.kind === 'brazier') {
      lamps.push({ x: x, y: y - 70 * s, r: 60 * Z, warm: 1 });
      if (Math.random() < 0.25) spray(pr.x, pr.y, 1, { colors: ['#ffb347', '#ff6a1a', '#ffe08a'], speed: 0.25, up: 70, life: 0.7, glow: true, grav: -40, size: 1.8, h: 30 * pr.scale });
    }
  }
  function drawFloor(tx, ty, tile) {
    if (envOk()) {
      var se = 2 * HW / 128, fx = sx(tx, ty) - 64 * se, fy = sy(tx, ty);
      ctx.drawImage(sprImg[envFloor(hash(tx, ty))], fx, fy, 128 * se, 64 * se);
      if (tile === 2) {
        var sn = S.seal ? 'stairs-sealed' : 'stairs-down';
        if (sprOk(sn)) ctx.drawImage(sprImg[sn], fx, fy, 128 * se, 96 * se);
        if (S.seal) { diamond(tx, ty); ctx.fillStyle = 'rgba(170,30,20,' + (0.12 + 0.1 * Math.sin(gameTime * 3)) + ')'; ctx.fill(); }
      } else if (propMap) {
        var pr = propMap[ty * S.map.W + tx]; if (pr && pr.kind === 'floor-grate') drawProp(pr);
      }
      return;
    }
    if (tilesReady && tile !== 2) {
      var s0 = 2 * HW / 128;
      blit(floorVariant(hash(tx, ty)), sx(tx, ty) - 64 * s0, sy(tx, ty) - 1 * s0, s0);
      return;
    }
    var h = hash(tx, ty), v = h % 11;
    diamond(tx, ty);
    if (tile === 2 && S.seal) {
      diamond(tx, ty); ctx.fillStyle = 'rgba(150,20,20,' + (0.55 + 0.2 * Math.sin(gameTime * 3)) + ')'; ctx.fill();
      ctx.strokeStyle = '#ff5a3a'; ctx.lineWidth = 2 * Z; ctx.stroke();
      return;
    }
    if (tile === 2) {
      ctx.fillStyle = '#0a0706'; ctx.fill();
      for (var k = 1; k <= 4; k++) {
        var f = k / 5; ctx.strokeStyle = 'rgba(120,100,80,' + (0.5 - k * 0.1) + ')'; ctx.lineWidth = 1.5 * Z;
        ctx.beginPath(); ctx.moveTo(sx(tx + f * 0.5, ty + 0.15), sy(tx + f * 0.5, ty + 0.15) + k * 2 * Z); ctx.lineTo(sx(tx + f * 0.5, ty + 0.85), sy(tx + f * 0.5, ty + 0.85) + k * 2 * Z); ctx.stroke();
      }
      return;
    }
    var r = 46 + v, g = 39 + v, b = 34 + (v >> 1);
    ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.38)'; ctx.lineWidth = 1; ctx.stroke();
    if (h % 29 === 0) {
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath();
      ctx.moveTo(sx(tx + 0.3, ty + 0.4), sy(tx + 0.3, ty + 0.4)); ctx.lineTo(sx(tx + 0.5, ty + 0.55), sy(tx + 0.5, ty + 0.55)); ctx.lineTo(sx(tx + 0.75, ty + 0.5), sy(tx + 0.75, ty + 0.5)); ctx.stroke();
    } else if (h % 53 === 0) {
      ctx.strokeStyle = 'rgba(214,204,186,0.55)'; ctx.lineWidth = 2 * Z; ctx.beginPath();
      var bx = sx(tx + 0.5, ty + 0.5), by = sy(tx + 0.5, ty + 0.5); ctx.moveTo(bx - 5 * Z, by - 1 * Z); ctx.lineTo(bx + 5 * Z, by + 1 * Z); ctx.stroke();
    }
  }
  function isFloor(x, y) { return x >= 0 && y >= 0 && x < S.map.W && y < S.map.H && S.map.t[y * S.map.W + x] !== 0; }
  function drawWall(tx, ty, fade) {
    var h = hash(tx, ty), v = h % 9, sw = 2 * HW / 128, WH = tilesReady ? 64 * sw : 38 * Z;
    ctx.globalAlpha = fade;
    var ax = sx(tx, ty), ay = sy(tx, ty), bx = sx(tx + 1, ty), by = sy(tx + 1, ty), cx = sx(tx + 1, ty + 1), cy = sy(tx + 1, ty + 1), dx = sx(tx, ty + 1), dy = sy(tx, ty + 1);
    if (envOk()) {
      var gate = isGate(tx, ty), wn = gate && sprOk('gate-sealed') ? 'gate-sealed' : envWall(tx, ty, h);
      ctx.drawImage(sprImg[wn], ax - 64 * sw, ay - 64 * sw, 128 * sw, 128 * sw);
      if (gate) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade * (0.25 + 0.15 * Math.sin(gameTime * 4));
        var gx = (bx + cx + dx) / 3, gy = (by + cy + dy) / 3 - 30 * sw, gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 46 * sw);
        gg.addColorStop(0, 'rgba(255,70,30,1)'); gg.addColorStop(1, 'rgba(255,40,10,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx, gy, 46 * sw, 0, 6.283); ctx.fill(); ctx.restore();
      }
      if (wn.indexOf('wall-torch') === 0) lamps.push({ x: ax - 64 * sw + (wn === 'wall-torch-l' ? 15 : 112) * sw, y: ay - 64 * sw + 64 * sw, r: 70 * Z, warm: 1 });
      ctx.globalAlpha = 1;
      return;
    }
    if (tilesReady) {
      // Two stacked blocks make a full-height wall; the upper one covers the lower one's top.
      var bxl = ax - 64 * sw, byl = ay - 33 * sw;
      blit('wall-straight', bxl, byl, sw);
      blit((h >>> 4) % 100 < 10 ? 'wall-moss' : 'wall-straight', bxl, byl - 32 * sw, sw);
      if (isGate(tx, ty)) drawGateBars(ax, ay, bx, by, cx, cy, dx, dy, WH);
      ctx.globalAlpha = 1;
      return;
    }
    if (isFloor(tx + 1, ty)) { // east face
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - WH); ctx.lineTo(bx, by - WH); ctx.closePath();
      ctx.fillStyle = 'rgb(' + (62 + v) + ',' + (52 + v) + ',' + (44 + v) + ')'; ctx.fill();
      brick(bx, by, cx, cy, WH, h);
    }
    if (isFloor(tx, ty + 1)) { // south face
      ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - WH); ctx.lineTo(dx, dy - WH); ctx.closePath();
      ctx.fillStyle = 'rgb(' + (44 + v) + ',' + (37 + v) + ',' + (32 + v) + ')'; ctx.fill();
      brick(dx, dy, cx, cy, WH, h >> 3);
    }
    ctx.beginPath(); ctx.moveTo(ax, ay - WH); ctx.lineTo(bx, by - WH); ctx.lineTo(cx, cy - WH); ctx.lineTo(dx, dy - WH); ctx.closePath();
    ctx.fillStyle = 'rgb(' + (74 + v) + ',' + (64 + v) + ',' + (55 + v) + ')'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    if (isGate(tx, ty)) drawGateBars(ax, ay, bx, by, cx, cy, dx, dy, WH);
    ctx.globalAlpha = 1;
  }
  // A sealed gate: iron bars over a red glow.
  function drawGateBars(ax, ay, bx, by, cx, cy, dx, dy, WH) {
    {
      var pulse = 0.45 + 0.25 * Math.sin(gameTime * 4);
      ctx.fillStyle = 'rgba(200,40,20,' + pulse + ')';
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - WH); ctx.lineTo(bx, by - WH); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ax, ay - WH); ctx.lineTo(bx, by - WH); ctx.lineTo(cx, cy - WH); ctx.lineTo(dx, dy - WH); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2a201a'; ctx.lineWidth = 2.2 * Z; ctx.beginPath();
      for (var gb = 1; gb < 5; gb++) { var f = gb / 5, gx = bx + (cx - bx) * f, gy = by + (cy - by) * f; ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - WH); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function isGate(tx, ty) {
    var gs = S.map.gates; if (!gs) return false;
    var i = ty * S.map.W + tx;
    for (var k = 0; k < gs.length; k++) if (!gs[k].open && gs[k].tiles.indexOf(i) >= 0) return true;
    return false;
  }
  function brick(x0, y0, x1, y1, WH, h) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (var row = 1; row < 4; row++) { var o = WH * row / 4; ctx.moveTo(x0, y0 - o); ctx.lineTo(x1, y1 - o); }
    for (var r2 = 0; r2 < 4; r2++) {
      var f = ((h >> r2) % 3 + 1) / 4 * (r2 % 2 ? 0.9 : 0.6), ox = x0 + (x1 - x0) * f, oy = y0 + (y1 - y0) * f;
      ctx.moveTo(ox, oy - WH * r2 / 4); ctx.lineTo(ox, oy - WH * (r2 + 1) / 4);
    }
    ctx.stroke();
  }

  // ---------- Drawing: figures (units are pixels at Z=1, feet at 0,0) ----------
  function ellipse(x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.283); ctx.fillStyle = fill; ctx.fill(); }
  function drawArcher(p, t, cloak) {
    var sa = screenAngle(p.face), away = Math.sin(sa) < -0.15, bob = p.moving ? Math.abs(Math.sin(t * 11)) * 2 : 0, sw = p.moving ? Math.sin(t * 11) * 4 : 0;
    ellipse(0, 0, 11, 5, 'rgba(0,0,0,0.45)');
    ctx.strokeStyle = '#2a211b'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-3, -12 - bob); ctx.lineTo(-3 + sw, -1); ctx.moveTo(3, -12 - bob); ctx.lineTo(3 - sw, -1); ctx.stroke();
    var bow = function () {
      ctx.save(); ctx.translate(Math.cos(sa) * 8, -21 - bob + Math.sin(sa) * 4); ctx.rotate(sa);
      ctx.strokeStyle = '#7a5531'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(-5, 0, 12, -1.1, 1.1); ctx.stroke();
      var ex = -5 + 12 * Math.cos(1.1), ey = 12 * Math.sin(1.1), pull = p.anim > 0 ? -9 : ex;
      ctx.strokeStyle = 'rgba(232,223,207,0.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(ex, -ey); ctx.lineTo(pull, 0); ctx.lineTo(ex, ey); ctx.stroke();
      if (p.anim > 0) { ctx.strokeStyle = '#d8cdb8'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(10, 0); ctx.stroke(); }
      ctx.restore();
    };
    if (away) bow();
    // quiver
    ctx.save(); ctx.translate(-Math.cos(sa) * 4, -24 - bob); ctx.rotate(0.35); ctx.fillStyle = '#4d3420'; ctx.fillRect(-2.5, -8, 5, 13);
    ctx.strokeStyle = '#cfc4ae'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-1, -8); ctx.lineTo(-1, -12); ctx.moveTo(1.5, -8); ctx.lineTo(1.5, -11); ctx.stroke(); ctx.restore();
    // cloak
    ctx.beginPath(); ctx.moveTo(-8.5, -5 - bob); ctx.lineTo(8.5, -5 - bob); ctx.lineTo(5.5, -27 - bob); ctx.lineTo(-5.5, -27 - bob); ctx.closePath();
    ctx.fillStyle = cloak[0]; ctx.fill();
    ctx.beginPath(); ctx.moveTo(Math.cos(sa) > 0 ? -8.5 : 8.5, -5 - bob); ctx.lineTo(Math.cos(sa) > 0 ? -5.5 : 5.5, -27 - bob); ctx.lineTo(0, -27 - bob); ctx.lineTo(0, -5 - bob); ctx.closePath();
    ctx.fillStyle = cloak[1]; ctx.fill();
    ctx.fillStyle = '#5a3d22'; ctx.fillRect(-6.5, -15 - bob, 13, 2.5);
    // hood
    ctx.beginPath(); ctx.arc(0, -32 - bob, 6.5, 0, 6.283); ctx.fillStyle = cloak[1]; ctx.fill();
    if (!away) { ellipse(Math.cos(sa) * 2.2, -31 - bob, 3.6, 3.8, '#14100d'); ellipse(Math.cos(sa) * 3, -31.5 - bob, 1.6, 1.1, 'rgba(230,200,160,0.5)'); }
    if (!away) bow();
  }
  function drawWarrior(p, t, tabard) {
    var sa = screenAngle(p.face), c = Math.cos(sa), away = Math.sin(sa) < -0.15, bob = p.moving ? Math.abs(Math.sin(t * 10)) * 2 : 0, sw = p.moving ? Math.sin(t * 10) * 4 : 0;
    var prog = p.anim > 0 ? 1 - p.anim / 0.25 : -1;
    ellipse(0, 0, 13, 5.5, 'rgba(0,0,0,0.45)');
    ctx.strokeStyle = '#2b2622'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4, -12 - bob); ctx.lineTo(-4 + sw, -1); ctx.moveTo(4, -12 - bob); ctx.lineTo(4 - sw, -1); ctx.stroke();
    var sword = function () {
      // Sword sweeps across the facing direction while attacking.
      var base = sa + (prog >= 0 ? -1.3 + prog * 2.4 : 0.6), hx = c * 8, hy = -20 - bob;
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(base);
      ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(2, 0); ctx.stroke();
      ctx.strokeStyle = '#8c7a5a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(2, -4); ctx.lineTo(2, 4); ctx.stroke();
      ctx.strokeStyle = '#d6d2c8'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(19, 0); ctx.stroke();
      ctx.restore();
    };
    var shield = function () {
      var shx = -c * 9, shy = -19 - bob;
      ctx.beginPath(); ctx.ellipse(shx, shy, 6, 8, 0, 0, 6.283); ctx.fillStyle = '#5b3d22'; ctx.fill();
      ctx.strokeStyle = '#9a8f80'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(shx, shy, 1.8, 0, 6.283); ctx.fillStyle = '#b9ad96'; ctx.fill();
    };
    if (away) sword(); else shield();
    // body and tabard
    ctx.beginPath(); ctx.moveTo(-10, -5 - bob); ctx.lineTo(10, -5 - bob); ctx.lineTo(8, -28 - bob); ctx.lineTo(-8, -28 - bob); ctx.closePath();
    ctx.fillStyle = '#5c5a57'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-5, -5 - bob); ctx.lineTo(5, -5 - bob); ctx.lineTo(4.5, -26 - bob); ctx.lineTo(-4.5, -26 - bob); ctx.closePath();
    ctx.fillStyle = tabard[0]; ctx.fill();
    ctx.fillStyle = tabard[1]; ctx.fillRect(-10, -16 - bob, 20, 3);
    ctx.beginPath(); ctx.ellipse(-8, -27 - bob, 4, 2.6, 0, 0, 6.283); ctx.ellipse(8, -27 - bob, 4, 2.6, 0, 0, 6.283); ctx.fillStyle = '#77736d'; ctx.fill();
    // helm
    ctx.beginPath(); ctx.arc(0, -33 - bob, 6.5, Math.PI, 0); ctx.lineTo(6.5, -29 - bob); ctx.lineTo(-6.5, -29 - bob); ctx.closePath();
    ctx.fillStyle = '#8a857c'; ctx.fill(); ctx.strokeStyle = '#4a4640'; ctx.lineWidth = 1; ctx.stroke();
    if (!away) { ctx.fillStyle = '#0e0b09'; ctx.fillRect(c * 2 - 3.5, -33 - bob, 7, 1.8); }
    if (away) shield(); else sword();
  }
  // Rain of Arrows: a dark pool on the ground with arrows falling into it.
  function drawRain(z, cx, cy, rx, ry, a) {
    ctx.save();
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, 'rgba(60,30,100,' + (0.35 * a) + ')'); g.addColorStop(0.8, 'rgba(40,20,70,' + (0.22 * a) + ')'); g.addColorStop(1, 'rgba(40,20,70,0)');
    ctx.translate(cx, cy); ctx.scale(1, ry / rx); ctx.translate(-cx, -cy);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rx, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(180,140,255,' + (0.45 * a) + ')'; ctx.lineWidth = 1.2 * Z; ctx.beginPath(); ctx.arc(cx, cy, rx * 0.95, 0, 6.283); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.lineCap = 'round';
    for (var i = 0; i < 7; i++) {
      var ang = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * z.r, wx = z.x + Math.cos(ang) * rr, wy = z.y + Math.sin(ang) * rr;
      var px = sx(wx, wy), py = sy(wx, wy), fall = Math.random();
      ctx.strokeStyle = 'rgba(200,170,255,' + (0.7 * a) + ')'; ctx.lineWidth = 1.4 * Z;
      ctx.beginPath(); ctx.moveTo(px + 3 * Z, py - (46 - 30 * fall) * Z); ctx.lineTo(px, py - (30 - 30 * fall) * Z); ctx.stroke();
      if (fall > 0.85) spray(wx, wy, 1, { colors: ['#6a3aa0', '#b48cff'], speed: 0.5, up: 40, life: 0.3, size: 1.6 });
    }
    ctx.restore();
  }
  // Ascendancy effects on a monster: Mark for Death, bleeding and Sunwarden embers.
  function drawAscMarks(e, it, t) {
    var now = S.time || 0;
    if (e.mark || e.markT > now) {
      var hy = -46 - 3 * Math.sin(t * 4);
      ctx.save(); ctx.translate(0, hy); ctx.rotate(t * 1.5);
      ctx.strokeStyle = 'rgba(220,40,50,0.9)'; ctx.lineWidth = 1.6; ctx.shadowColor = '#ff2030'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(5, 0); ctx.lineTo(0, 5); ctx.lineTo(-5, 0); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
      ctx.restore();
    }
    var rn = e.rendN || (e.rend ? e.rend.length : 0);
    if (rn) {
      ctx.save(); ctx.fillStyle = '#c04060'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.8;
      for (var ri = 0; ri < rn; ri++) { var rx2 = (ri - (rn - 1) / 2) * 5; ctx.beginPath(); ctx.moveTo(rx2, -40); ctx.lineTo(rx2 + 2, -36); ctx.lineTo(rx2, -32); ctx.lineTo(rx2 - 2, -36); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.restore();
      if (Math.random() < 0.12) spray(it.x, it.y, 1, { colors: ['#6a0d1c', '#a3142a'], speed: 0.4, up: 20, life: 0.6, size: 2, h: 14 });
    }
    if ((e.dark || e.darkPool > 0) && Math.random() < 0.22) spray(it.x, it.y, 1, { colors: ['#1a1022', '#5a3a7a', '#9a6cff'], speed: 0.35, up: 40, life: 0.8, size: 2.4, grav: -25, h: 18 });
    if ((e.sun || (e.sunT && now - e.sunT < 0.6)) && Math.random() < 0.22) spray(it.x, it.y, 1, { colors: ['#ffe08a', '#ffb347', '#fff3c0'], speed: 0.5, up: 90, life: 0.6, glow: true, grav: -50, size: 1.8, h: 16 });
  }
  // A fallen player: body on the floor with a faint soul light above it.
  function drawFallen(q, t) {
    var x = sx(q.x, q.y), y = sy(q.x, q.y), ready = (S.time || 0) - (q.deadAt || 0) >= R.reviveDelay;
    var pa = q.cls === 'warrior' ? 'warrior' : 'archer';
    if (hasSprite(pa)) {
      ctx.save(); ctx.translate(x, y); ctx.scale(Z, Z);
      drawSprite(pa, 'death', dirIndex(q.face || 0), Math.floor(((S.time || 0) - (q.deadAt || 0)) * 10));
      var gs = ctx.createRadialGradient(0, -14, 0, 0, -14, 16);
      gs.addColorStop(0, ready ? 'rgba(255,236,170,' + (0.45 + 0.2 * Math.sin(t * 4)) + ')' : 'rgba(150,170,255,0.25)'); gs.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = gs; ctx.beginPath(); ctx.arc(0, -14, 16, 0, 6.283); ctx.fill();
      ctx.restore(); return;
    }
    ctx.save(); ctx.translate(x, y); ctx.scale(Z, Z);
    ellipse(0, 1, 15, 6, 'rgba(70,8,8,0.6)');
    ctx.save(); ctx.rotate(-0.25);
    ctx.fillStyle = q.cls === 'warrior' ? '#5c5a57' : '#2f4a2c'; ctx.fillRect(-12, -4, 18, 7);
    ctx.beginPath(); ctx.arc(9, -0.5, 4.5, 0, 6.283); ctx.fillStyle = q.cls === 'warrior' ? '#8a857c' : '#22351f'; ctx.fill();
    ctx.restore();
    var glow = ctx.createRadialGradient(0, -14, 0, 0, -14, 16);
    glow.addColorStop(0, ready ? 'rgba(255,236,170,' + (0.45 + 0.2 * Math.sin(t * 4)) + ')' : 'rgba(150,170,255,0.25)'); glow.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -14, 16, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  function drawJudge(m, t) {
    var sa = screenAngle(m.face), c = Math.cos(sa), hit = m.hitT > 0, casting = m.atk > 0 ? m.cast : null;
    var swing = casting === 'melee' ? 1 - m.atk / DATA.monsters.judge.atkTime : 0, sway = Math.sin(t * 1.5) * 0.8;
    ellipse(0, 0, 12, 5, 'rgba(0,0,0,0.5)');
    // robe
    ctx.beginPath(); ctx.moveTo(-11, -1); ctx.quadraticCurveTo(0, 3, 11, -1); ctx.lineTo(6, -30 + sway); ctx.lineTo(-6, -30 + sway); ctx.closePath();
    ctx.fillStyle = hit ? '#9a96a6' : '#3a3644'; ctx.fill(); ctx.strokeStyle = '#6a6478'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#c9c2d8'; ctx.fillRect(-1, -29 + sway, 2, 27);
    // shoulders
    ellipse(-7, -29 + sway, 5, 3, '#8a8496'); ellipse(7, -29 + sway, 5, 3, '#8a8496');
    // hood with a void face and two white eyes
    ctx.beginPath(); ctx.moveTo(-7, -30 + sway); ctx.quadraticCurveTo(0, -48 + sway, 7, -30 + sway); ctx.closePath(); ctx.fillStyle = '#2a2632'; ctx.fill();
    ellipse(c * 1.5, -36 + sway, 3.6, 4.2, '#050407');
    if (Math.sin(sa) > -0.3) { ellipse(c * 1.5 - 1.6, -37 + sway, 0.9, 0.9, '#f4f0ff'); ellipse(c * 1.5 + 1.6, -37 + sway, 0.9, 0.9, '#f4f0ff'); }
    // greatsword
    ctx.save(); ctx.translate(c * 9, -20 + sway); ctx.rotate(sa + (swing ? -1.4 + swing * 2.6 : 0.9));
    ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(2, 0); ctx.stroke();
    ctx.strokeStyle = '#d8d4e6'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(26, 0); ctx.stroke();
    ctx.restore();
    if (casting === 'judgement' || casting === 'step') {
      var g = ctx.createRadialGradient(-c * 8, -26, 0, -c * 8, -26, 14);
      g.addColorStop(0, 'rgba(240,230,255,1)'); g.addColorStop(1, 'rgba(160,120,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-c * 8, -26, 14, 0, 6.283); ctx.fill();
    }
  }
  function drawAbbot(m, t) {
    var sa = screenAngle(m.face), c = Math.cos(sa), hit = m.hitT > 0, hover = Math.sin(t * 1.8) * 1.2;
    var casting = m.atk > 0 ? m.cast : null;
    ellipse(0, 0, 12, 5, 'rgba(0,0,0,0.5)');
    ctx.beginPath(); ctx.moveTo(-12, -1); ctx.quadraticCurveTo(0, 3, 12, -1); ctx.lineTo(4, -32 + hover); ctx.lineTo(-4, -32 + hover); ctx.closePath();
    ctx.fillStyle = hit ? '#a0524a' : '#4a1612'; ctx.fill(); ctx.strokeStyle = '#7a2a1c'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(-1.2, -30 + hover, 2.4, 26);
    ctx.beginPath(); ctx.arc(0, -36 + hover, 6.5, 0, 6.283); ctx.fillStyle = hit ? '#5a3a36' : '#1a0d0b'; ctx.fill();
    if (Math.sin(sa) > -0.2) { ellipse(c * 2 - 2, -36 + hover, 1.3, 1.3, '#ffd27a'); ellipse(c * 2 + 2, -36 + hover, 1.3, 1.3, '#ffd27a'); }
    // ember crown
    for (var i = 0; i < 5; i++) {
      var fx = -6 + i * 3, fh = 5 + Math.sin(t * 9 + i * 1.7) * 2;
      ctx.beginPath(); ctx.moveTo(fx - 1.5, -42 + hover); ctx.lineTo(fx, -42 - fh + hover); ctx.lineTo(fx + 1.5, -42 + hover); ctx.closePath();
      ctx.fillStyle = i % 2 ? '#ff9a3a' : '#ffd27a'; ctx.fill();
    }
    // hands of fire or curse
    var col = casting === 'curse' ? 'rgba(170,110,255,' : 'rgba(255,120,40,';
    var size = casting && casting !== 'melee' ? 7 + Math.sin(t * 20) * 1.5 : 4;
    [-1, 1].forEach(function (sd) {
      var hx = sd * 10, hy = -20 + hover, g = ctx.createRadialGradient(hx, hy, 0, hx, hy, size * 2.2);
      g.addColorStop(0, col + '1)'); g.addColorStop(1, col + '0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, size * 2.2, 0, 6.283); ctx.fill();
    });
  }
  // The Veiled Keeper and the dark portal behind him.
  function drawPortal(t, n) {
    if (sprOk('portal')) {
      var pa = 0.92 + 0.08 * Math.sin(t * 2.3);
      ctx.save(); ctx.globalAlpha = pa; ctx.drawImage(sprImg.portal, -18 - 32, 6 - 92, 64, 96); ctx.restore();
      return;
    }
    var px = -18, py = -30;
    ctx.save(); ctx.translate(px, py);
    var g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
    g.addColorStop(0, '#000000'); g.addColorStop(0.55, '#14061f'); g.addColorStop(0.85, 'rgba(90,40,140,0.85)'); g.addColorStop(1, 'rgba(90,40,140,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 17, 30, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(190,140,255,0.55)'; ctx.lineWidth = 1.4;
    for (var i = 0; i < 3; i++) { var a0 = t * (1.2 + i * 0.4) + i * 2.1; ctx.beginPath(); ctx.ellipse(0, 0, 12 - i * 3, 24 - i * 6, 0, a0, a0 + 2.2); ctx.stroke(); }
    ctx.restore();
  }
  function drawKeeper(n, t) {
    var sway = Math.sin(t * 1.3 + n.id) * 1;
    ellipse(0, 0, 12, 5, 'rgba(0,0,0,0.5)');
    ctx.beginPath(); ctx.moveTo(-9, -1); ctx.quadraticCurveTo(0, 2, 9, -1); ctx.lineTo(4, -38 + sway); ctx.lineTo(-4, -38 + sway); ctx.closePath();
    ctx.fillStyle = '#17121c'; ctx.fill(); ctx.strokeStyle = '#3c2f4a'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -41 + sway, 6, 0, 6.283); ctx.fillStyle = '#100c14'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(1, -41 + sway, 3.2, 4, 0, 0, 6.283); ctx.fillStyle = '#d9d2c4'; ctx.fill();
    ellipse(0, -42 + sway, 0.9, 0.9, '#2a1f33'); ellipse(2.2, -42 + sway, 0.9, 0.9, '#2a1f33');
  }
  function drawPeddler(n, t) {
    var sway = Math.sin(t * 1.6 + n.id) * 0.8;
    ellipse(0, 0, 13, 5.5, 'rgba(0,0,0,0.45)');
    // pack
    ctx.fillStyle = '#5a4128'; ctx.fillRect(-12, -32 + sway, 11, 18);
    ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 1; ctx.strokeRect(-12, -32 + sway, 11, 18);
    ctx.fillStyle = '#6e5233'; ctx.fillRect(-13, -36 + sway, 9, 5);
    // robe
    ctx.beginPath(); ctx.moveTo(-8, -1); ctx.lineTo(8, -1); ctx.lineTo(5, -27 + sway); ctx.lineTo(-5, -27 + sway); ctx.closePath();
    ctx.fillStyle = '#4b3b52'; ctx.fill();
    ctx.fillStyle = '#7a5a2a'; ctx.fillRect(-7, -13 + sway * 0.5, 14, 2.5);
    ctx.beginPath(); ctx.arc(0, -31 + sway, 6, 0, 6.283); ctx.fillStyle = '#3a2d40'; ctx.fill();
    ellipse(1.5, -30.5 + sway, 3.2, 3.4, '#1a1410'); ellipse(2.5, -29 + sway, 2.2, 1.4, 'rgba(220,210,190,0.6)');
    // lantern on a pole
    ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(8, -18 + sway); ctx.lineTo(14, -34 + sway); ctx.stroke();
    ctx.fillStyle = '#2a2018'; ctx.fillRect(12, -33 + sway, 5, 7);
    ctx.fillStyle = '#ffcf6a'; ctx.fillRect(13, -32 + sway, 3, 5);
  }
  function drawGnawer(m, t) {
    var sa = screenAngle(m.face), c = Math.cos(sa), s = Math.sin(sa), bob = m.moving ? Math.abs(Math.sin(t * 22 + m.id)) * 1.5 : 0, hit = m.hitT > 0;
    var lunge = m.atk > 0 ? 3 : 0;
    ctx.translate(c * lunge, s * lunge * 0.5);
    ellipse(0, 0, 10, 4, 'rgba(0,0,0,0.45)');
    ctx.strokeStyle = hit ? '#d9a48a' : '#5e4636'; ctx.lineWidth = 1.6; ctx.beginPath();
    ctx.moveTo(-c * 8, -4 + s * -3); ctx.quadraticCurveTo(-c * 15, -2 + Math.sin(t * 9 + m.id) * 4, -c * 20, -6 - s * 4); ctx.stroke();
    ctx.save(); ctx.translate(0, -7 - bob); ctx.rotate(sa * 0.35);
    ellipse(0, 0, 10, 6, hit ? '#b08a70' : '#4a382b');
    ellipse(-1, -2, 7, 3, hit ? '#c79d80' : '#5c4636');
    ctx.restore();
    ellipse(c * 9, -8 - bob + s * 3, 4.5, 3.6, hit ? '#c09a80' : '#56402f');
    ellipse(c * 9 + 1.5, -9 - bob + s * 3, 1.2, 1.2, '#ff3b2f'); ellipse(c * 9 - 1.5, -9 - bob + s * 3, 1.2, 1.2, '#ff3b2f');
  }
  function drawBonewalker(m, t) {
    var sa = screenAngle(m.face), c = Math.cos(sa), hit = m.hitT > 0, bone = hit ? '#ffffff' : '#d8cfbd', dark = '#8c816d';
    var sw = m.moving ? Math.sin(t * 8 + m.id) * 4 : 0, raise = m.atk > 0 ? 1 - m.atk / DATA.monsters.bonewalker.atkTime : 0;
    ellipse(0, 0, 10, 4.5, 'rgba(0,0,0,0.45)');
    ctx.strokeStyle = bone; ctx.lineCap = 'round'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(-3, -14); ctx.lineTo(-3 + sw, -1); ctx.moveTo(3, -14); ctx.lineTo(3 - sw, -1); ctx.stroke();
    ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -30); ctx.stroke();
    ctx.lineWidth = 1.6; ctx.strokeStyle = dark;
    for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, -21 - i * 3.2, 6 - i * 0.6, 1.8, 0, 3.4, 6.0); ctx.stroke(); }
    ctx.strokeStyle = bone; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-6, -15); ctx.lineTo(6, -15); ctx.stroke();
    // arm + blade
    var hx = c * 9, hy = -20 - raise * 10;
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c * 4, -28); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = '#7d5a3c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + c * 6, hy - 12 + raise * 4); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -35, 5.5, 0, 6.283); ctx.fillStyle = bone; ctx.fill();
    if (Math.sin(sa) > -0.2) { ellipse(c * 1.5 - 2, -35.5, 1.6, 1.8, '#1a1210'); ellipse(c * 1.5 + 2, -35.5, 1.6, 1.8, '#1a1210'); }
    ctx.fillStyle = bone; ctx.fillRect(-2.5 + c, -31, 5, 2.5);
  }
  function drawAshPriest(m, t) {
    var sa = screenAngle(m.face), c = Math.cos(sa), hit = m.hitT > 0, hover = Math.sin(t * 2.4 + m.id) * 1.5;
    var cast = m.atk > 0 ? 1 - m.atk / DATA.monsters.ashpriest.atkTime : 0;
    ellipse(0, 0, 10, 4.5, 'rgba(0,0,0,0.45)');
    ctx.beginPath(); ctx.moveTo(-10, -1); ctx.quadraticCurveTo(0, 2, 10, -1); ctx.lineTo(3, -30 + hover); ctx.lineTo(-3, -30 + hover); ctx.closePath();
    ctx.fillStyle = hit ? '#8a837d' : '#3b3633'; ctx.fill();
    ctx.strokeStyle = '#5e5650'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -33 + hover, 6.5, 0, 6.283); ctx.fillStyle = hit ? '#77706a' : '#2b2725'; ctx.fill();
    if (Math.sin(sa) > -0.2) { ellipse(c * 2 - 1.8, -33 + hover, 1.1, 1.1, '#ff8a2a'); ellipse(c * 2 + 1.8, -33 + hover, 1.1, 1.1, '#ff8a2a'); }
    // staff
    var stx = c * 11; ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(stx, -2); ctx.lineTo(stx, -36 + hover); ctx.stroke();
    var or = 3.5 + cast * 4 + Math.sin(t * 7) * 0.5, g = ctx.createRadialGradient(stx, -38 + hover, 0, stx, -38 + hover, or * 3);
    g.addColorStop(0, 'rgba(255,220,150,1)'); g.addColorStop(0.3, 'rgba(255,120,40,0.8)'); g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(stx, -38 + hover, or * 3, 0, 6.283); ctx.fill();
  }
  function drawCorpse(cp) {
    var age = gameTime - cp.t, a = Math.max(0, Math.min(1, (90 - age) / 10)); if (a <= 0) return;
    var x = sx(cp.x, cp.y), y = sy(cp.x, cp.y);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(Z, Z);
    if (hasSprite(cp.type)) {
      var sc = cp.boss === 'mini' ? DATA.bosses.mini.scale : 1;
      drawSprite(cp.type, 'death', dirIndex(cp.face || 0), Math.floor(age * 10), sc);
      ctx.restore(); return;
    }
    if (cp.type === 'abbot') { ellipse(0, 0, 22, 9, '#2b1a14'); ellipse(2, -2, 14, 5, '#5a3a2a'); ellipse(0, -3, 6, 2.5, '#ff7a2a'); }
    else if (cp.type === 'ashpriest') { ellipse(0, 0, 11, 4.5, '#2b2725'); ellipse(1, -1, 7, 2.5, '#59524c'); }
    else {
      ellipse(0, 1, 12, 5, 'rgba(70,8,8,0.75)');
      if (cp.type === 'bonewalker') {
        ctx.strokeStyle = '#cfc6b3'; ctx.lineWidth = 2; ctx.beginPath();
        for (var i = 0; i < 4; i++) { var a2 = (cp.seed + i * 97) % 628 / 100; ctx.moveTo(Math.cos(a2) * 3, Math.sin(a2)); ctx.lineTo(Math.cos(a2) * 9, Math.sin(a2) * 3.5); }
        ctx.stroke(); ellipse(4, -2, 3.5, 3, '#d8cfbd');
      } else ellipse(-1, -2, 7, 3, '#3a2b20');
    }
    ctx.restore();
  }
  function drawGroundGlyph(g) {
    var x = sx(g.x, g.y), y = sy(g.x, g.y);
    ctx.save(); ctx.translate(x, y); ctx.scale(Z, Z);
    var gname = g.kind === 'gold' ? 'ground-gold' : g.kind === 'potion' ? (g.pot === 'hp' ? 'ground-life_potion' : 'ground-mana_potion') : GROUND_SPR[itemKind(g.item)];
    if (g.kind === 'item' && g.item.rarity) { ellipse(0, -2, 13, 5, g.item.rarity === 3 ? 'rgba(192,112,255,0.4)' : g.item.rarity === 2 ? 'rgba(240,208,106,0.28)' : 'rgba(142,168,255,0.25)'); }
    if (gname && drawGroundSprite(gname)) { ctx.restore(); return; }
    if (g.kind === 'gold') { ellipse(0, 0, 6, 2.6, '#6d5530'); ellipse(-1, -1.5, 4.5, 2, '#d1a85a'); ellipse(2, -2.5, 3, 1.4, '#f0d06a'); }
    else if (g.kind === 'potion') {
      ellipse(0, 0, 5, 2, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = g.pot === 'hp' ? '#c4232b' : '#3a62d6'; ctx.beginPath(); ctx.arc(0, -4, 4, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#c8bca6'; ctx.fillRect(-1.3, -10, 2.6, 3);
    } else {
      var col = ['#cfc5b4', '#8ea8ff', '#f0d06a', '#c070ff'][g.item.rarity];
      ellipse(0, 0, 8, 3, 'rgba(0,0,0,0.4)');
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
      if (g.item.slot === 'weapon' && E.baseOf(g.item).wclass === 'melee') { ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(9, -4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(-4, 2); ctx.stroke(); }
      else if (g.item.slot === 'weapon') { ctx.beginPath(); ctx.ellipse(0, -2, 10, 3, -0.2, 3.3, 6.1); ctx.stroke(); }
      else if (g.item.slot === 'ring' || g.item.slot === 'amulet') { ctx.beginPath(); ctx.ellipse(0, -2, 3.5, 2, 0, 0, 6.283); ctx.stroke(); }
      else { ctx.globalAlpha = 0.85; ctx.fillRect(-5, -6, 10, 6); }
    }
    ctx.restore();
  }

  // ---------- Main render ----------
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0c0a09'; ctx.fillRect(0, 0, vw, vh);
    if (!S) return;
    var p = me(), pp = lerpE(p), map = S.map, W = map.W, H = map.H, t = gameTime;
    var camY = vh * 0.44;
    oxC = vw / 2 - (pp.x - pp.y) * HW; oyC = camY - (pp.x + pp.y) * HH;
    var light = p.st.light * (1 + 0.025 * Math.sin(t * 7.3) + 0.015 * Math.sin(t * 13.1));
    // explored tiles
    var L = Math.ceil(p.st.light) + 1;
    for (var ey = Math.floor(pp.y) - L; ey <= Math.floor(pp.y) + L; ey++) for (var ex = Math.floor(pp.x) - L; ex <= Math.floor(pp.x) + L; ex++) {
      if (ex < 0 || ey < 0 || ex >= W || ey >= H) continue;
      if (Math.hypot(ex + 0.5 - pp.x, ey + 0.5 - pp.y) <= p.st.light + 0.5) explored[ey * W + ex] = 1;
    }
    var marg = 80 * Z;
    function onScreen(tx, ty) { var x = sx(tx + 0.5, ty + 0.5), y = sy(tx + 0.5, ty + 0.5); return x > -marg && x < vw + marg && y > -marg && y < vh + marg * 2; }
    // floor
    var walls = [], props = [], pm = envOk() ? buildProps() : null;
    lamps = [];
    for (var ty = 0; ty < H; ty++) for (var tx = 0; tx < W; tx++) {
      var i = ty * W + tx; if (!explored[i] || !onScreen(tx, ty)) continue;
      var tl = map.t[i];
      if (tl) { drawFloor(tx, ty, tl); if (pm && pm[i] && pm[i].kind !== 'floor-grate') props.push(pm[i]); }
      else if (isFloor(tx + 1, ty) || isFloor(tx - 1, ty) || isFloor(tx, ty + 1) || isFloor(tx, ty - 1) || isFloor(tx + 1, ty + 1) || isFloor(tx - 1, ty - 1) || isFloor(tx + 1, ty - 1) || isFloor(tx - 1, ty + 1)) walls.push([tx, ty]);
    }
    corpses.forEach(drawCorpse);
    (S.hazards || []).forEach(function (h) {
      var cx = sx(h.x, h.y), cy = sy(h.x, h.y), rx = h.r * HW * 1.414, ry = h.r * HH * 1.414, k = 1 - Math.max(0, h.t) / h.fuse;
      ctx.save();
      ctx.fillStyle = 'rgba(150,110,255,' + (0.12 + 0.25 * k) + ')'; ctx.beginPath(); ctx.ellipse(cx, cy, rx * k, ry * k, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(225,210,255,' + (0.55 + 0.4 * Math.sin(gameTime * 18) * k) + ')'; ctx.lineWidth = 2 * Z;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.283); ctx.stroke();
      ctx.restore();
    });
    (S.zones || []).forEach(function (z) {
      var cx = sx(z.x, z.y), cy = sy(z.x, z.y), rx = z.r * HW * 1.414, ry = z.r * HH * 1.414;
      var left = Math.max(0, (z.end - (S.time || 0)) / (z.dur || 3)), a = Math.min(1, left * 3);
      if (z.kind === 'rain') { drawRain(z, cx, cy, rx, ry, a); return; }
      ctx.save();
      var zg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      zg.addColorStop(0, 'rgba(255,230,150,' + (0.32 * a) + ')'); zg.addColorStop(0.7, 'rgba(240,200,100,' + (0.16 * a) + ')'); zg.addColorStop(1, 'rgba(240,200,100,0)');
      ctx.translate(cx, cy); ctx.scale(1, ry / rx); ctx.translate(-cx, -cy);
      ctx.fillStyle = zg; ctx.beginPath(); ctx.arc(cx, cy, rx, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(255,236,170,' + (0.5 * a + 0.15 * Math.sin(gameTime * 5)) + ')'; ctx.lineWidth = 1.5 * Z;
      ctx.beginPath(); ctx.arc(cx, cy, rx * 0.92, 0, 6.283); ctx.stroke();
      ctx.restore();
      if (Math.random() < 0.25 * a) { var za = Math.random() * 6.283, zr = Math.random() * z.r; spray(z.x + Math.cos(za) * zr, z.y + Math.sin(za) * zr, 1, { colors: ['#fff1b8', '#f0d06a'], speed: 0.2, up: 50, life: 0.9, glow: true, grav: -30, size: 1.8 }); }
    });
    deadHits = [];
    Object.keys(S.players).forEach(function (id) {
      var q = S.players[id]; if (!q.dead || q.x == null) return;
      drawFallen(q, t);
      if (id !== PID) deadHits.push({ id: id, sx: sx(q.x, q.y), sy: sy(q.x, q.y) - 6 * Z, r: 22 * Z });
    });
    var vis = p.st.light + 0.6;
    S.ground.forEach(function (g) { if (Math.hypot(g.x - pp.x, g.y - pp.y) < vis) drawGroundGlyph(g); });
    // depth-sorted
    var list = [];
    walls.forEach(function (w) { list.push({ d: w[0] + w[1] + 1, k: 'w', tx: w[0], ty: w[1] }); });
    props.forEach(function (pr) { list.push({ d: pr.x + pr.y, k: 'q', e: pr }); });
    hoverList = [];
    S.monsters.forEach(function (m) {
      var lp = lerpE(m); if (Math.hypot(lp.x - pp.x, lp.y - pp.y) > vis) return;
      list.push({ d: lp.x + lp.y, k: 'm', e: m, x: lp.x, y: lp.y });
      hoverList.push({ id: m.id, sx: sx(lp.x, lp.y), sy: sy(lp.x, lp.y) - 16 * Z * (m.scale || 1), r: (m.type === 'gnawer' ? 14 : 20) * Z * (m.scale || 1) + 4 });
    });
    Object.keys(S.players).forEach(function (id) { var q = S.players[id]; if (q.dead) return; var lp = lerpE(q); list.push({ d: lp.x + lp.y, k: 'p', e: q, x: lp.x, y: lp.y }); });
    npcHits = [];
    (S.npcs || []).forEach(function (n) {
      if (Math.hypot(n.x - pp.x, n.y - pp.y) > vis + 4) return;
      list.push({ d: n.x + n.y, k: 'n', e: n, x: n.x, y: n.y });
      npcHits.push({ id: n.id, sx: sx(n.x, n.y), sy: sy(n.x, n.y) - 18 * Z, r: 22 * Z });
    });
    S.projs.forEach(function (pr) { if (pr.kind === 'arrow') { var lp = lerpE(pr); list.push({ d: lp.x + lp.y, k: 'a', e: pr, x: lp.x, y: lp.y }); } });
    list.sort(function (a, b) { return a.d - b.d; });
    var pd = pp.x + pp.y, psx = sx(pp.x, pp.y), psy = sy(pp.x, pp.y);
    for (var j = 0; j < list.length; j++) {
      var it = list[j];
      if (it.k === 'w') {
        var fade = 1;
        if (it.d > pd && it.d - pd < 5) {
          var wx = sx(it.tx + 0.5, it.ty + 0.5), wy = sy(it.tx + 0.5, it.ty + 0.5);
          if (Math.abs(wx - psx) < HW * 2.4 && wy > psy - HH) fade = 0.28;
        }
        drawWall(it.tx, it.ty, fade);
      } else if (it.k === 'q') { drawProp(it.e);
      } else if (it.k === 'a') {
        var pr = it.e, ax = sx(it.x, it.y), ay = sy(it.x, it.y) - 18 * Z, sp = Math.hypot(pr.vx, pr.vy);
        var bx = sx(it.x - pr.vx / sp * 0.55, it.y - pr.vy / sp * 0.55), by = sy(it.x - pr.vx / sp * 0.55, it.y - pr.vy / sp * 0.55) - 18 * Z;
        ctx.strokeStyle = pr.light ? '#fff0b0' : pr.dark ? '#b48cff' : '#d8cdb8'; ctx.lineWidth = 1.6 * Z; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke();
        ctx.strokeStyle = '#9b8a6e'; ctx.lineWidth = 3 * Z; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + (ax - bx) * 0.18, by + (ay - by) * 0.18); ctx.stroke();
      } else {
        var e = it.e; ctx.save(); ctx.translate(sx(it.x, it.y), sy(it.x, it.y)); ctx.scale(Z, Z);
        if (it.k === 'm' && e.boss) {
          if (e.aura) { var ag = ctx.createRadialGradient(0, 0, 4, 0, 0, 40); ag.addColorStop(0, 'rgba(255,110,30,0.35)'); ag.addColorStop(1, 'rgba(255,80,20,0)'); ctx.fillStyle = ag; ctx.beginPath(); ctx.ellipse(0, 0, 40, 18, 0, 0, 6.283); ctx.fill(); }
          ctx.strokeStyle = 'rgba(230,70,40,' + (0.55 + 0.25 * Math.sin(t * 3)) + ')'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 0, 18 * (e.scale || 1), 8 * (e.scale || 1), 0, 0, 6.283); ctx.stroke();
          ctx.scale(e.scale || 1, e.scale || 1);
        }
        if (it.k === 'm' && e.champ) { ctx.strokeStyle = 'rgba(142,168,255,' + (0.5 + 0.25 * Math.sin(t * 4)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 14, 6, 0, 0, 6.283); ctx.stroke(); }
        if (it.k === 'm' && e.id === hoverId) { ctx.strokeStyle = 'rgba(220,60,50,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, 13, 5.5, 0, 0, 6.283); ctx.stroke(); }
        if (it.k === 'n') {
          if (e.kind === 'keeper') { drawPortal(t, e); if (!(hasSprite('keeper') && drawIdle('keeper', dirIndex(e.face || 0), 1, 1))) drawKeeper(e, t, true); }
          else if (!(hasSprite('corvin') && drawIdle('corvin', dirIndex(e.face || 0), 1, 2))) drawPeddler(e, t);
        }
        else if (it.k === 'p' && hasSprite(e.cls === 'warrior' ? 'warrior' : 'archer')) drawPlayerSprite(e);
        else if (it.k === 'm' && hasSprite(e.type)) drawMonsterSprite(e);
        else if (it.k === 'p') { if (e.cls === 'warrior') drawWarrior(e, t, e.id === PID ? ['#5a2420', '#3f1916'] : ['#2c3e5a', '#1f2c40']); else drawArcher(e, t, e.id === PID ? ['#2f4a2c', '#22351f'] : ['#4a2c4a', '#351f35']); }
        else if (e.type === 'gnawer') drawGnawer(e, t);
        else if (e.type === 'bonewalker') drawBonewalker(e, t);
        else if (e.type === 'abbot') drawAbbot(e, t);
        else if (e.type === 'judge') drawJudge(e, t);
        else drawAshPriest(e, t);
        if (it.k === 'm') drawAscMarks(e, it, t);
        ctx.restore();
      }
    }
    // melee swing trails
    // Chain of Light: a jagged beam from one enemy to the next
    if (chains.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      chains.forEach(function (c) {
        var a = 1 - c.t / 0.28, x1 = sx(c.x, c.y), y1 = sy(c.x, c.y) - 16 * Z, x2 = sx(c.x2, c.y2), y2 = sy(c.x2, c.y2) - 16 * Z;
        var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, segs = 6, pts = [];
        for (var q = 0; q <= segs; q++) { var f = q / segs, j = q === 0 || q === segs ? 0 : (Math.sin(q * 12.9898 + c.x * 78.233) * 43758.5453 % 1) * 9 * Z; pts.push([x1 + dx * f + nx * j, y1 + dy * f + ny * j]); }
        [[6 * Z, 'rgba(255,220,120,' + (0.25 * a) + ')'], [2.2 * Z, 'rgba(255,250,220,' + (0.9 * a) + ')']].forEach(function (st2) {
          ctx.strokeStyle = st2[1]; ctx.lineWidth = st2[0]; ctx.beginPath(); pts.forEach(function (pt, i2) { if (i2) ctx.lineTo(pt[0], pt[1]); else ctx.moveTo(pt[0], pt[1]); }); ctx.stroke();
        });
      });
      ctx.restore();
    }
    swings.forEach(function (w) {
      var k = w.t / 0.18, r = w.big ? (w.reach ? w.reach * 0.85 : 1.6) : 1.0, n = 10;
      ctx.strokeStyle = 'rgba(235,225,205,' + (0.55 * (1 - k)) + ')'; ctx.lineWidth = (w.big ? 4 : 2.5) * Z; ctx.beginPath();
      for (var q = 0; q <= n; q++) {
        var a = w.face - w.arc + (2 * w.arc) * q / n * Math.min(1, k * 2 + 0.3);
        var px2 = sx(w.x + Math.cos(a) * r, w.y + Math.sin(a) * r), py2 = sy(w.x + Math.cos(a) * r, w.y + Math.sin(a) * r) - 18 * Z;
        if (q === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
      }
      ctx.stroke();
    });
    // particles (non-glowing) below the light
    drawParts(false);
    // light
    ctx.save(); ctx.translate(psx, psy - 12 * Z); ctx.scale(1, 0.5);
    var R0 = light * HW * 1.75, g = ctx.createRadialGradient(0, 0, R0 * 0.1, 0, 0, R0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,0,0,0.12)'); g.addColorStop(0.75, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0.95)');
    ctx.fillStyle = g; ctx.fillRect(-vw * 2, -vh * 4, vw * 4, vh * 8); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(psx, psy - 12 * Z); ctx.scale(1, 0.5);
    var g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, R0 * 0.7); g2.addColorStop(0, 'rgba(255,150,70,0.10)'); g2.addColorStop(1, 'rgba(255,150,70,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, R0 * 0.7, 0, 6.283); ctx.fill(); ctx.restore();
    // the peddler's lantern is a beacon in the dark
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    (S.npcs || []).forEach(function (n) {
      var keeper = n.kind === 'keeper';
      var lx = sx(n.x, n.y) + (keeper ? -18 : 14.5) * Z, ly = sy(n.x, n.y) - (keeper ? 30 : 29.5) * Z, rr = ((keeper ? 52 : 34) + Math.sin(t * 5 + n.id) * 3) * Z;
      var gl = ctx.createRadialGradient(lx, ly, 0, lx, ly, rr);
      if (keeper) { gl.addColorStop(0, 'rgba(150,90,230,0.45)'); gl.addColorStop(1, 'rgba(110,60,200,0)'); }
      else { gl.addColorStop(0, 'rgba(255,205,110,0.55)'); gl.addColorStop(1, 'rgba(255,170,60,0)'); }
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(lx, ly, rr, 0, 6.283); ctx.fill();
    });
    ctx.restore();
    // torches and braziers burn in the dark, even in explored rooms beyond your light
    if (lamps.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      lamps.forEach(function (lm, li) {
        var fl = 1 + 0.08 * Math.sin(t * 9 + li * 1.7) + 0.05 * Math.sin(t * 23 + li), rr = lm.r * fl;
        var gl = ctx.createRadialGradient(lm.x, lm.y, 0, lm.x, lm.y, rr);
        gl.addColorStop(0, 'rgba(255,190,100,0.42)'); gl.addColorStop(0.35, 'rgba(255,140,50,0.16)'); gl.addColorStop(1, 'rgba(255,110,30,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(lm.x, lm.y, rr, 0, 6.283); ctx.fill();
      });
      ctx.restore();
    }
    // fireballs and embers shine through the dark
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    S.projs.forEach(function (pr) {
      if (pr.kind !== 'bolt') return; var lp = lerpE(pr), bx2 = sx(lp.x, lp.y), by2 = sy(lp.x, lp.y) - 18 * Z, r = (pr.big ? 20 : 14) * Z;
      var gb = ctx.createRadialGradient(bx2, by2, 0, bx2, by2, r); gb.addColorStop(0, 'rgba(255,230,170,1)'); gb.addColorStop(0.35, 'rgba(255,120,40,0.85)'); gb.addColorStop(1, 'rgba(255,60,10,0)');
      ctx.fillStyle = gb; ctx.beginPath(); ctx.arc(bx2, by2, r, 0, 6.283); ctx.fill();
      if (Math.random() < 0.6) parts.push({ x: lp.x, y: lp.y, h: 18, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, vh: 20, life: 0.4, max: 0.4, c: '#ff8a3a', s: 2, glow: true, grav: -30 });
    });
    ctx.restore();
    drawParts(true);
    if (hurtFlash > 0) {
      var vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
      vg.addColorStop(0, 'rgba(120,0,0,0)'); vg.addColorStop(1, 'rgba(150,0,0,' + (hurtFlash * 1.2) + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, vw, vh);
    }
    // text and labels above the dark
    texts.forEach(function (tx2) {
      var a = Math.min(1, tx2.life / tx2.max * 2), x = sx(tx2.x, tx2.y), y = sy(tx2.x, tx2.y) - tx2.h * Z;
      ctx.globalAlpha = a; ctx.font = (tx2.big ? '700 22px ' : '700 15px ') + "'Alegreya Sans', sans-serif"; ctx.textAlign = 'center';
      ctx.fillStyle = '#000'; ctx.fillText(tx2.txt, x + 1, y + 1); ctx.fillStyle = tx2.c; ctx.fillText(tx2.txt, x, y);
    });
    ctx.globalAlpha = 1;
    drawLabels(pp, vis, psx, psy);
    // names over other players
    ctx.font = "500 12px 'Alegreya Sans', sans-serif"; ctx.textAlign = 'center';
    Object.keys(S.players).forEach(function (id) {
      if (id === PID) return; var q = S.players[id]; if (q.dead || q.x == null) return; var lq = lerpE(q), nx = sx(lq.x, lq.y), ny = sy(lq.x, lq.y) - 46 * Z;
      ctx.fillStyle = '#000'; ctx.fillText(q.name, nx + 1, ny + 1); ctx.fillStyle = '#d9c7f0'; ctx.fillText(q.name, nx, ny);
      var w = 30 * Z; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(nx - w / 2, ny + 4, w, 3); ctx.fillStyle = '#c4232b'; ctx.fillRect(nx - w / 2, ny + 4, w * Math.max(0, q.hp / q.st.maxHp), 3);
    });
    if (mapOpen) drawAutomap(pp);
  }
  function drawParts(glow) {
    if (glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; }
    for (var i = 0; i < parts.length; i++) {
      var q = parts[i]; if (q.glow !== glow) continue;
      var x = sx(q.x, q.y), y = sy(q.x, q.y) - q.h * Z;
      ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.c; ctx.fillRect(x - q.s * Z / 2, y - q.s * Z / 2, q.s * Z, q.s * Z);
    }
    ctx.globalAlpha = 1; if (glow) ctx.restore();
  }
  function drawLabels(pp, vis, psx, psy) {
    var pr = { x: psx - 14 * Z, y: psy - 44 * Z, w: 28 * Z, h: 46 * Z };
    labels = []; ctx.font = "500 13px 'Alegreya Sans', sans-serif"; ctx.textAlign = 'left';
    var items = S.ground.filter(function (g) { return Math.hypot(g.x - pp.x, g.y - pp.y) < vis; });
    if (!S.map.final && explored[Math.floor(S.map.stairs.y) * S.map.W + Math.floor(S.map.stairs.x)] && Math.hypot(S.map.stairs.x - pp.x, S.map.stairs.y - pp.y) < vis + 2) items.push({ stairs: true, x: S.map.stairs.x, y: S.map.stairs.y });
    (S.npcs || []).forEach(function (n) { if (Math.hypot(n.x - pp.x, n.y - pp.y) < vis + 4) items.push({ npc: n, x: n.x, y: n.y, id: n.id }); });
    Object.keys(S.players).forEach(function (id) { var q = S.players[id]; if (id !== PID && q.dead && q.x != null && Math.hypot(q.x - pp.x, q.y - pp.y) < vis + 2) items.push({ fallen: q, x: q.x, y: q.y, id: id }); });
    items.sort(function (a, b) { return (b.x + b.y) - (a.x + a.y); });
    var placed = [];
    items.forEach(function (g) {
      var txt, col;
      if (g.stairs) { txt = S.seal ? 'Stairs down · sealed' : 'Stairs down'; col = S.seal ? '#ff8a6a' : '#e8dfcf'; }
      else if (g.npc) { txt = g.npc.name; col = g.npc.kind === 'keeper' ? '#d8c2ff' : '#ffd98a'; }
      else if (g.fallen) {
        var left = Math.ceil(R.reviveDelay - ((S.time || 0) - (g.fallen.deadAt || 0)));
        txt = left > 0 ? g.fallen.name + ' · ' + left + 's' : 'Resurrect ' + g.fallen.name; col = left > 0 ? '#aab6ff' : '#fff2c0';
      }
      else if (g.kind === 'gold') { txt = g.amount + ' gold'; col = '#d1a85a'; }
      else if (g.kind === 'potion') { txt = g.pot === 'hp' ? 'Healing Potion' : 'Mana Potion'; col = '#cfc5b4'; }
      else { txt = E.itemName(g.item); col = ['#e8dfcf', '#8ea8ff', '#f0d06a', '#c070ff'][g.item.rarity]; }
      var w = ctx.measureText(txt).width + 12, h = 20, x = sx(g.x, g.y) - w / 2, y = sy(g.x, g.y) - (g.stairs ? 34 : g.npc ? 44 : 28) * Z - h;
      for (var k = 0; k < placed.length; k++) { var o = placed[k]; if (x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y) { y = o.y - h - 2; k = -1; } }
      placed.push({ x: x, y: y, w: w, h: h });
      var hov = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h && !mouse.touch;
      var overP = x < pr.x + pr.w && x + w > pr.x && y < pr.y + pr.h && y + h > pr.y;
      ctx.globalAlpha = overP && !hov ? 0.35 : 1;
      ctx.fillStyle = hov ? 'rgba(60,45,30,0.92)' : 'rgba(8,6,5,0.78)'; ctx.fillRect(x, y, w, h);
      if (hov) { ctx.strokeStyle = '#b38f58'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
      ctx.fillStyle = col; ctx.fillText(txt, x + 6, y + 14.5); ctx.globalAlpha = 1;
      labels.push({ x: x, y: y, w: w, h: h, id: g.id, kind: g.stairs ? 'stairs' : g.npc ? 'npc' : g.fallen ? 'revive' : 'item' });
    });
  }
  function drawAutomap(pp) {
    var map = S.map, mw = 5.5, mh = 2.75, cx = vw / 2, cy = vh * 0.42;
    ctx.save(); ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(8,6,5,0.55)'; ctx.fillRect(0, 0, vw, vh);
    function mx(x, y) { return cx + (x - y - (pp.x - pp.y)) * mw; }
    function my(x, y) { return cy + (x + y - (pp.x + pp.y)) * mh; }
    ctx.strokeStyle = 'rgba(179,143,88,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (var ty = 0; ty < map.H; ty++) for (var tx = 0; tx < map.W; tx++) {
      if (!explored[ty * map.W + tx] || map.t[ty * map.W + tx] === 0) continue;
      if (!isFloor(tx, ty - 1)) { ctx.moveTo(mx(tx, ty), my(tx, ty)); ctx.lineTo(mx(tx + 1, ty), my(tx + 1, ty)); }
      if (!isFloor(tx, ty + 1)) { ctx.moveTo(mx(tx, ty + 1), my(tx, ty + 1)); ctx.lineTo(mx(tx + 1, ty + 1), my(tx + 1, ty + 1)); }
      if (!isFloor(tx - 1, ty)) { ctx.moveTo(mx(tx, ty), my(tx, ty)); ctx.lineTo(mx(tx, ty + 1), my(tx, ty + 1)); }
      if (!isFloor(tx + 1, ty)) { ctx.moveTo(mx(tx + 1, ty), my(tx + 1, ty)); ctx.lineTo(mx(tx + 1, ty + 1), my(tx + 1, ty + 1)); }
    }
    ctx.stroke();
    var st = map.stairs;
    if (!map.final && explored[Math.floor(st.y) * map.W + Math.floor(st.x)]) { ctx.fillStyle = '#e14a4a'; ctx.fillRect(mx(st.x, st.y) - 4, my(st.x, st.y) - 4, 8, 8); }
    (S.npcs || []).forEach(function (n) {
      if (!explored[Math.floor(n.y) * map.W + Math.floor(n.x)]) return;
      ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.arc(mx(n.x, n.y), my(n.x, n.y), 4, 0, 6.283); ctx.fill();
    });
    ctx.font = "500 12px 'Alegreya Sans', sans-serif"; ctx.textAlign = 'center';
    Object.keys(S.players).forEach(function (id) {
      var q = S.players[id]; if (id === PID || q.x == null) return;
      var qx = mx(q.x, q.y), qy = my(q.x, q.y);
      if (q.dead) { ctx.strokeStyle = '#e14a4a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(qx - 5, qy - 5); ctx.lineTo(qx + 5, qy + 5); ctx.moveTo(qx + 5, qy - 5); ctx.lineTo(qx - 5, qy + 5); ctx.stroke(); }
      else { ctx.fillStyle = '#9fd0ff'; ctx.beginPath(); ctx.arc(qx, qy, 4.5, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#0c0a09'; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.fillStyle = '#000'; ctx.fillText(q.name, qx + 1, qy - 8); ctx.fillStyle = q.dead ? '#e14a4a' : '#9fd0ff'; ctx.fillText(q.name, qx, qy - 9);
    });
    ctx.fillStyle = '#f0d06a'; ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  function updateFx(dt) {
    gameTime += dt; hurtFlash = Math.max(0, hurtFlash - dt);
    swings = swings.filter(function (w) { w.t += dt; return w.t < 0.18; });
    chains = chains.filter(function (c) { c.t += dt; return c.t < 0.28; });
    for (var i = parts.length - 1; i >= 0; i--) {
      var q = parts[i]; q.life -= dt; if (q.life <= 0) { parts.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vh -= q.grav * dt; q.h += q.vh * dt;
      if (q.h < 0) { q.h = 0; q.vh *= -0.3; q.vx *= 0.5; q.vy *= 0.5; }
    }
    for (var j = texts.length - 1; j >= 0; j--) { var tx = texts[j]; tx.life -= dt; tx.h += dt * (tx.big ? 22 : 40); if (tx.life <= 0) texts.splice(j, 1); }
    if (parts.length > 600) parts.splice(0, parts.length - 600);
    corpses = corpses.filter(function (c) { return gameTime - c.t < 90; });
  }

  // ---------- HUD ----------
  var hudCache = {};
  function setTxt(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function setH(id, f) { var v = Math.round(Math.max(0, Math.min(1, f)) * 1000) / 10 + '%'; if (hudCache[id] !== v) { hudCache[id] = v; $(id).style.height = v; } }
  function setW(id, f) { var v = Math.round(Math.max(0, Math.min(1, f)) * 1000) / 10 + '%'; if (hudCache[id] !== v) { hudCache[id] = v; $(id).style.width = v; } }
  var lastVer = -1, sel = null;
  function updateHud() {
    var p = me(); if (!p) return;
    setH('hpFill', p.hp / p.st.maxHp); setH('mpFill', p.mana / p.st.maxMana);
    setTxt('hpTxt', Math.ceil(p.hp) + '/' + p.st.maxHp); setTxt('mpTxt', Math.floor(p.mana) + '/' + p.st.maxMana);
    setW('xpFill', p.xp / E.xpToNext(p.level));
    setTxt('nHp', String(p.potions.hp)); setTxt('nMp', String(p.potions.mp));
    $('bChar').classList.toggle('badge', p.pts > 0 || E.ascUnspent(p) > 0);
    // resurrection channel
    var ord = p.order, tgt = ord && ord.t === 'revive' ? S.players[ord.id] : null;
    if (tgt && tgt.dead && Math.hypot(tgt.x - p.x, tgt.y - p.y) < R.reviveRange + 0.2) {
      $('chan').hidden = false;
      var wait = Math.ceil(R.reviveDelay - ((S.time || 0) - (tgt.deadAt || 0)));
      if (p.chan) { setTxt('chanTxt', 'Resurrecting ' + tgt.name + '…'); setW('chanBar', p.chan.t / E.reviveChannel(p)); }
      else { setTxt('chanTxt', 'Ready in ' + Math.max(0, wait) + 's. Stay close.'); setW('chanBar', 0); }
    } else $('chan').hidden = true;
    if (p.dead && deadWaiting && !$('dead').hidden) {
      var since = (S.time || 0) - (p.deadAt || 0), rl = Math.ceil(R.reviveDelay - since), auto = Math.max(0, Math.ceil(p.respawn || 0));
      setTxt('deadTxt', (deadLost ? 'You dropped ' + deadLost + ' gold. ' : '') + (rl > 0 ? 'A friend can resurrect you in ' + rl + 's. ' : 'A friend can resurrect you now. ') + 'Otherwise you return to the level start in ' + auto + 's.');
    }
    var sk = DATA.skills[E.skillOf(p)];
    var skKey = sk.name + JSON.stringify(p.ascNodes || {});
    if (hudCache.skill !== skKey) {
      hudCache.skill = skKey; $('skName').textContent = sk.name;
      var cost = E.hasNode(p, 'blood_price') ? '6% of your life' : sk.mana + ' mana';
      var sdesc = E.hasNode(p, 'radiant_volley') ? 'Seven arrows in a fan.' : sk.desc;
      $('bSkill').title = sk.name + ': ' + sdesc + ' ' + cost + '. ' + (drawsBow(p) ? 'Hold right-click or Q to draw, release to fire.' : 'Right-click or Q.');
    }
    var buffs = [];
    if (p.blN && p.blT > (S.time || 0)) buffs.push('Bloodlust ×' + p.blN + ' · ' + Math.ceil(p.blT - S.time) + 's');
    if ((p.zeal || 0) > 0) buffs.push('Zeal · ' + Math.ceil(p.zeal) + 's');
    if (buffs.length) { $('buff').hidden = false; setTxt('buffTxt', buffs.join('   ')); } else $('buff').hidden = true;
    if (p.charge != null && !p.dead) {
      var df = E.drawFrac(S, p);
      $('chan').hidden = false; setTxt('chanTxt', df >= 1 ? 'Full draw. Release to fire' : 'Drawing… ' + Math.round(df * 100) + '%'); setW('chanBar', df);
      $('chan').classList.toggle('full', df >= 1);
    }
    // target
    var hm = monsterAt(mouse.x, mouse.y);
    hoverId = hm && !mouse.touch ? hm.id : null;
    cv.classList.toggle('hover-enemy', !!hoverId || (!mouse.touch && !!npcAt(mouse.x, mouse.y)));
    var tm = hm && !mouse.touch ? hm : (p.order && p.order.t === 'attack' ? S.monsters.filter(function (m) { return m.id === p.order.id; })[0] : null);
    var bossNear = null;
    S.monsters.forEach(function (m) { if (m.boss && Math.hypot(m.x - p.x, m.y - p.y) < p.st.light + 4) bossNear = m; });
    if (bossNear) {
      $('bossBar').hidden = false; $('bossBar').classList.toggle('true', bossNear.boss === 'true' || bossNear.boss === 'trial');
      setTxt('bbName', bossNear.name); setTxt('bbTraits', (bossNear.traits || []).join(' · ')); setW('bbFill', bossNear.hp / bossNear.max);
    } else $('bossBar').hidden = true;
    if (tm && bossNear && tm.id === bossNear.id) tm = null;
    if ((p.slowT || 0) > 0) { $('debuff').hidden = false; setTxt('debuffTxt', 'Withered · ' + Math.ceil(p.slowT) + 's'); if (Math.random() < 0.3) spray(p.x, p.y, 1, { colors: ['#b48cff'], speed: 0.3, up: 60, life: 0.6, glow: true, grav: -20, h: 20 }); }
    else $('debuff').hidden = true;
    if (tm) {
      $('target').hidden = false;
      var nm = (tm.champ ? 'Hardened ' : '') + DATA.monsters[tm.type].name;
      setTxt('tName', nm); $('tName').classList.toggle('champ', tm.champ); setW('tBar', tm.hp / tm.max);
    } else $('target').hidden = true;
    if (p.ver !== lastVer) { lastVer = p.ver; renderPanels(); renderShop(); }
    if (!$('talkPanel').hidden) {
      var tn = (S.npcs || []).filter(function (n) { return n.id === talkId; })[0];
      if (!tn || Math.hypot(tn.x - p.x, tn.y - p.y) > DATA.merchant.talkRange + 1.2) closePanel('talkPanel');
    }
    if (!$('shopPanel').hidden) {
      var sn = (S.npcs || []).filter(function (n) { return n.id === shopId; })[0];
      if (!sn || Math.hypot(sn.x - p.x, sn.y - p.y) > DATA.merchant.talkRange + 1.2) closePanel('shopPanel');
    }
    var now = performance.now();
    if (now - lastSave > 15000) { lastSave = now; writeSave(); }
  }

  // ---------- Panels ----------
  // ---------- Dialog ----------
  var talkId = null;
  function openTalk(id, kind, diff) {
    talkId = id; closePanel('charPanel'); closePanel('shopPanel');
    var K = DATA.keeper;
    $('talkName').textContent = K.name;
    $('talkLine').textContent = '“' + (K.lines[diff] || K.lines.normal) + '”';
    var pp = me(), altar = pp && E.ascPoints(pp) > 0 && (!pp.ascendancy || E.ascUnspent(pp) > 0);
    $('talkMenu').textContent = altar ? 'Approach the altar' : 'Return to main menu';
    $('talkNote').textContent = (altar ? 'The Keeper will lead you to the Ash Altar, where you choose your path. ' : '') + (MODE === 'host' ? 'Returning closes the room for everyone. Your character is saved.' : MODE === 'client' ? 'Returning takes you out of the room. Your character is saved.' : 'Your character is saved.');
    $('talkPanel').hidden = false;
  }
  $('talkMenu').addEventListener('click', function () {
    var p = me(), nm = p ? p.name : 'Your character';
    var msg = S && S.trial && p && p.trial === 'done' ? 'Nightmare is open to ' + nm + '.' : p && p.trial === 'unlocked' ? 'The Trial is open to ' + nm + '.' : '';
    var slot = activeSlot, altar = p && E.ascPoints(p) > 0 && (!p.ascendancy || E.ascUnspent(p) > 0);
    if (MODE === 'host') conns.forEach(function (c) { try { c.send({ t: 'bye' }); } catch (er) { } });
    leaveToTitle(msg, true);
    if (altar && slot >= 0 && loadStore().slots[slot]) openAltar(slot);
  });
  $('talkStay').addEventListener('click', function () { closePanel('talkPanel'); });

  // ---------- Shop ----------
  function openShop(id) { shopId = id; closePanel('charPanel'); $('shopPanel').hidden = false; renderShop(); }
  function renderShop() {
    var p = me(); if (!p || $('shopPanel').hidden) return;
    var M = DATA.merchant;
    $('shopName').textContent = M.name;
    $('shopGold').textContent = p.gold;
    $('shopList').innerHTML = M.stock.filter(function (o) { return o.minDepth <= S.depth; }).map(function (o) {
      var have = p.potions[o.id], full = have != null && have >= R.maxPotions, poor = p.gold < o.price;
      return '<div class="ware"><div class="wi ' + o.id + '"></div><div class="wt"><b>' + o.name + '</b><small>' + o.desc + (have != null ? ' You carry ' + have + '/' + R.maxPotions + '.' : '') + '</small></div>' +
        '<button class="tb" data-buy="' + o.id + '"' + (full || poor ? ' disabled' : '') + '>' + (full ? 'Full' : o.price + ' gold') + '</button></div>';
    }).join('');
  }
  document.addEventListener('click', function (e) {
    var cn = e.target.closest ? e.target.closest('[data-cnode]') : null;
    if (cn && !cn.disabled) { ensureAudio(); cmd({ t: 'node', id: cn.dataset.cnode }); return; }
    var b = e.target.closest ? e.target.closest('[data-buy]') : null; if (!b || b.disabled) return;
    ensureAudio(); cmd({ t: 'buy', item: b.dataset.buy });
  });
  function toggle(id) { var el = $(id); el.hidden = !el.hidden; if (!el.hidden) renderPanels(); if (id === 'invPanel' && el.hidden) { sel = null; hideTip(); } }
  function closePanel(id) { $(id).hidden = true; if (id === 'invPanel') { sel = null; hideTip(); } }
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closePanel(b.getAttribute('data-close')); }); });
  $('bChar').addEventListener('click', function () { toggle('charPanel'); });
  $('bInv').addEventListener('click', function () { toggle('invPanel'); });
  $('bMap').addEventListener('click', function () { mapOpen = !mapOpen; });
  $('bPotHp').addEventListener('click', function () { ensureAudio(); cmd({ t: 'potion', kind: 'hp' }); });
  $('bPotMp').addEventListener('click', function () { ensureAudio(); cmd({ t: 'potion', kind: 'mp' }); });
  $('bSkill').addEventListener('click', function () { ensureAudio(); castSkillAuto(); });
  function sndLabel() { $('bSnd').textContent = muted ? 'Sound off' : 'Sound on'; $('bSnd').setAttribute('aria-pressed', muted ? 'false' : 'true'); }
  $('bSnd').addEventListener('click', function () { muted = !muted; try { localStorage.setItem('ashgrave.mute', muted ? '1' : '0'); } catch (e) { } sndLabel(); ensureAudio(); });
  sndLabel();

  var ICON = {
    weapon: '<path d="M6 2 Q22 12 6 22" fill="none" stroke-width="2.2"/><path d="M6 2 L6 22" stroke-width="0.8" opacity=".7"/>',
    melee: '<path d="M18 3 L21 3 L21 6 L10 17 L7 14 Z"/><path d="M5 12 L12 19 M4 20 L8 16" fill="none" stroke-width="2.2"/>',
    helm: '<path d="M4 16 Q4 4 12 4 Q20 4 20 16 L16 16 L16 12 L8 12 L8 16 Z"/>',
    chest: '<path d="M7 4 L10 6 L14 6 L17 4 L21 8 L18 11 L18 20 L6 20 L6 11 L3 8 Z"/>',
    gloves: '<path d="M8 21 L8 12 L6 9 L7 7 L9 9 L9 4 L11 4 L11 9 L12 3 L14 3 L14 9 L15 4 L17 4 L17 13 L15 21 Z"/>',
    boots: '<path d="M7 3 L13 3 L13 14 L20 16 L20 21 L7 21 Z"/>',
    ring: '<circle cx="12" cy="14" r="6" fill="none" stroke-width="2.4"/><path d="M10 6 L12 3 L14 6 L12 8 Z"/>',
    amulet: '<path d="M5 3 Q12 13 19 3" fill="none" stroke-width="1.3"/><path d="M12 11 L16 16 L12 21 L8 16 Z"/>'
  };
  function icon(it, empty) {
    var sk = !empty && ICON_SPR[itemKind(it)];
    if (sk && SPR && SPR.img[sk]) return '<img src="' + SPR.img[sk] + '" alt="" width="64" height="64" style="width:84%;height:84%;object-fit:contain;image-rendering:auto">';
    var col = empty ? '#3a3029' : ['#cfc5b4', '#8ea8ff', '#f0d06a', '#c070ff'][it.rarity];
    var slot = empty || (it.slot === 'weapon' && E.baseOf(it).wclass === 'melee' ? 'melee' : it.slot);
    if (slot === 'ring2') slot = 'ring';
    return '<svg viewBox="0 0 24 24" width="80%" height="80%" aria-hidden="true" fill="' + col + '" fill-opacity="' + (empty ? 0.6 : 0.35) + '" stroke="' + col + '" stroke-width="1.4" stroke-linejoin="round">' + ICON[slot] + '</svg>';
  }
  var MODF = {
    dmgPct: function (v) { return '+' + v + '% damage'; }, armorPct: function (v) { return '+' + v + '% defense'; },
    leech: function (v) { return v + '% of damage stolen as life'; }, life: function (v) { return '+' + v + ' to life'; }, mana: function (v) { return '+' + v + ' to mana'; },
    str: function (v) { return '+' + v + ' to strength'; }, dex: function (v) { return '+' + v + ' to dexterity'; }, vit: function (v) { return '+' + v + ' to vitality'; }, ene: function (v) { return '+' + v + ' to energy'; },
    ias: function (v) { return '+' + v + '% attack speed'; }, run: function (v) { return '+' + v + '% movement speed'; },
    light: function (v) { return '+' + v + ' to light radius'; }, gold: function (v) { return '+' + v + '% more gold'; }, regen: function (v) { return '+' + v + ' life per second'; }
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function itemHtml(it, cmpWith) {
    var b = E.baseOf(it), h = '<div class="t r' + it.rarity + '">' + esc(E.itemName(it)) + '</div>';
    if (it.rarity >= 2) h += '<div class="b">' + (it.rarity === 3 ? 'Unique ' : '') + b.name + '</div>';
    if (b.wclass) h += '<div class="b">' + (b.wclass === 'bow' ? 'Bow · Archer' : 'Melee weapon · Warrior') + '</div>';
    if (it.dmg) h += '<div>Damage: ' + it.dmg[0] + '–' + it.dmg[1] + '</div><div class="b">' + b.aps.toFixed(2) + ' attacks per second</div>';
    if (it.armor) h += '<div>Defense: ' + it.armor + '</div>';
    var m = it.mods;
    if (m.lightMin) h += '<div class="m">+' + m.lightMin + '–' + m.lightMax + ' light damage</div>';
    if (m.darkMin) h += '<div class="m">+' + m.darkMin + '–' + m.darkMax + ' dark damage over ' + R.darkDuration + 's</div>';
    Object.keys(m).forEach(function (k) { if (MODF[k]) h += '<div class="m">' + MODF[k](m[k]) + '</div>'; });
    var ud = it.rarity === 3 && E.uniqueDef(it.unique);
    if (ud) ud.fx.forEach(function (f) { h += '<div class="m u">' + esc(f) + '</div>'; });
    h += '<div class="b">Item level ' + it.ilvl + '</div>';
    if (cmpWith && it.slot === 'ring' && cmpWith.eq.ring && cmpWith.eq.ring2) h += compareHtml(cmpWith, it, 'ring', 'Instead of left ring: ') + compareHtml(cmpWith, it, 'ring2', 'Instead of right ring: ');
    else if (cmpWith) h += compareHtml(cmpWith, it);
    return h;
  }
  // Average hit (physical + light + dark) times attacks per second. Dark counts in full, though it lands over time.
  function dpsOf(st) { return (st.dmin + st.dmax + st.lmin + st.lmax + st.dkmin + st.dkmax) / 2 * st.aps; }
  function compareHtml(p, it, slotOverride, prefix) {
    var a = p.st, eq = {}; DATA.slots.forEach(function (s) { eq[s] = p.eq[s]; }); eq[slotOverride || E.targetSlot(p, it)] = it;
    if (!E.canWield(p, it)) return '<div class="cmp dn">A ' + E.classOf(p).name.toLowerCase() + " can't use this.</div>";
    var b = E.derive({ base: p.base, level: p.level, eq: eq, cls: p.cls, ascendancy: p.ascendancy, ascNodes: p.ascNodes });
    var rows = [
      ['DPS', dpsOf(a), dpsOf(b), 1],
      ['Damage', (a.dmin + a.dmax + a.lmin + a.lmax + a.dkmin + a.dkmax) / 2, (b.dmin + b.dmax + b.lmin + b.lmax + b.dkmin + b.dkmax) / 2, 1],
      ['Attacks/s', a.aps, b.aps, 2], ['Defense', a.armor, b.armor, 0], ['Life', a.maxHp, b.maxHp, 0], ['Mana', a.maxMana, b.maxMana, 0],
      ['Light radius', a.light, b.light, 0], ['Gold find', a.goldFind, b.goldFind, 0], ['Life steal', a.leech, b.leech, 0], ['Movement', a.speed, b.speed, 1], ['Life regen', a.regen, b.regen, 0]
    ];
    var out = rows.filter(function (r) { return Math.abs(r[2] - r[1]) > 0.004; }).map(function (r) {
      var d = r[2] - r[1], s = (d > 0 ? '+' : '−') + Math.abs(d).toFixed(r[3]);
      return '<span class="' + (d > 0 ? 'up' : 'dn') + '">' + r[0] + ' ' + s + '</span>';
    });
    if (!out.length) return '<div class="cmp b">No change from what you wear.</div>';
    return '<div class="cmp">' + (prefix || 'Compared to now: ') + out.join(' · ') + '</div>';
  }
  function renderPanels() {
    var p = me(); if (!p) return;
    if (!$('charPanel').hidden) {
      var st = p.st, next = E.xpToNext(p.level);
      $('cTitle').textContent = p.name;
      $('cTop').innerHTML = '<dt>Class</dt><dd>' + E.classOf(p).name + '</dd><dt>Level</dt><dd>' + p.level + '</dd><dt>Experience</dt><dd>' + p.xp + ' / ' + next + '</dd><dt>Deepest</dt><dd>Level ' + p.maxDepth + '</dd>' +
        (p.ascendancy ? '<dt>Ascendancy</dt><dd class="asc-' + DATA.ascendancies[p.ascendancy].side + '">' + DATA.ascendancies[p.ascendancy].name + '</dd>' : '');
      var cAsc = $('cAsc');
      if (p.ascendancy) {
        var ca = DATA.ascendancies[p.ascendancy], cun = E.ascUnspent(p);
        cAsc.hidden = false;
        cAsc.innerHTML = '<div class="sub">' + ca.name + ' tree <span class="pts">' + (cun > 0 ? '· ' + cun + (cun === 1 ? ' point' : ' points') + ' left' : '· next point at level ' + nextPointLevel(p)) + '</span></div>' +
          '<div class="gifts compact ' + ca.side + '">' + ca.nodes.map(function (n) { return nodeHtml(p, n, cun, 'data-cnode'); }).join('') + '</div>';
      } else { cAsc.hidden = true; cAsc.innerHTML = ''; }
      $('cPts').textContent = p.pts ? '· ' + p.pts + ' points left' : '';
      var cd = E.classOf(p), DESC = { str: '+1% melee damage per point', dex: '+1% bow damage per point', vit: '+' + cd.life.perVit + ' life per point', ene: '+' + cd.mana.perEne + ' mana per point' };
      var defs = cd.attrs.map(function (k) { return [k, DATA.attrNames[k], DESC[k]]; });
      $('cStats').innerHTML = defs.map(function (d) {
        return '<div class="stat"><div>' + d[1] + '<small>' + d[2] + '</small></div><span class="v">' + st[d[0]] + '</span><button class="plus" data-alloc="' + d[0] + '" ' + (p.pts ? '' : 'disabled') + ' aria-label="Increase ' + d[1] + '">+</button></div>';
      }).join('');
      var dr = Math.round(E.damageReduction(st.armor, S.depth) * 100);
      $('cCombat').innerHTML =
        '<dt>Damage</dt><dd>' + st.dmin + '–' + st.dmax + (st.lmax ? ' <span style="color:#ffe9a0">+' + st.lmin + '–' + st.lmax + ' light</span>' : '') + (st.dkmax ? ' <span style="color:#b48cff">+' + st.dkmin + '–' + st.dkmax + ' dark</span>' : '') + '</dd>' +
        (st.lightMul > 1 ? '<dt>Light path</dt><dd style="color:#ffe9a0">+' + Math.round((st.lightMul - 1) * 100) + '% light damage</dd>' : '') +
        (st.darkMul > 1 ? '<dt>Dark path</dt><dd style="color:#b48cff">+' + Math.round((st.darkMul - 1) * 100) + '% dark damage</dd>' : '') +
        '<dt>DPS</dt><dd class="dps">' + dpsOf(st).toFixed(1) + '</dd>' +
        '<dt>Attacks per second</dt><dd>' + st.aps.toFixed(2) + '</dd>' +
        '<dt>Defense</dt><dd>' + st.armor + '</dd>' +
        '<dt>Damage reduction, level ' + S.depth + '</dt><dd>' + dr + '%</dd>' +
        (E.classOf(p).dr ? '<dt>Hardened (class)</dt><dd>' + Math.round(E.classOf(p).dr * 100) + '% less damage</dd>' : '') +
        '<dt>Life</dt><dd>' + st.maxHp + '</dd><dt>Mana</dt><dd>' + st.maxMana + '</dd>' +
        '<dt>Light radius</dt><dd>' + st.light + '</dd>' +
        (st.leech ? '<dt>Life steal</dt><dd>' + st.leech + '%' + (st.leechRaw > st.leech ? ' (max ' + st.leechCap + '%, ' + st.leechRaw + '% on items)' : '') + '</dd>' : '') +
        (st.regen ? '<dt>Life regen</dt><dd>' + st.regen + '/s</dd>' : '') +
        '<dt>Gold find</dt><dd>+' + st.goldFind + '%</dd>' +
        '<dt>Movement speed</dt><dd>' + Math.round(st.speed / 4.2 * 100) + '%</dd>';
    }
    if (!$('invPanel').hidden) {
      $('eqGrid').innerHTML = DATA.slots.map(function (s) {
        var it = p.eq[s], isSel = sel && sel.from === 'eq' && sel.key === s;
        return '<div class="eqcell"><button class="cell' + (it ? ' r' + it.rarity : '') + (isSel ? ' sel' : '') + '" data-eq="' + s + '" aria-label="' + DATA.slotNames[s] + (it ? ': ' + esc(E.itemName(it)) : ', empty') + '">' +
          (it ? icon(it) : icon(null, s)) + '</button><span class="lbl">' + DATA.slotNames[s] + '</span></div>';
      }).join('');
      $('invGrid').innerHTML = p.inv.map(function (it, i) {
        var isSel = sel && sel.from === 'inv' && sel.key === i;
        return '<button class="cell' + (it ? ' r' + it.rarity : '') + (isSel ? ' sel' : '') + '" data-inv="' + i + '" aria-label="' + (it ? esc(E.itemName(it)) : 'Empty slot') + '">' + (it ? icon(it) : '') + '</button>';
      }).join('');
      $('goldN').textContent = p.gold;
      var it2 = sel ? (sel.from === 'inv' ? p.inv[sel.key] : p.eq[sel.key]) : null;
      if (!it2) sel = null;
      var det = $('detail');
      if (it2) {
        det.hidden = false; $('invHint').hidden = true;
        det.innerHTML = '<div class="tip">' + itemHtml(it2, sel.from === 'inv' ? p : null) + '</div><div class="acts">' +
          (sel.from !== 'inv' ? '<button class="tb" data-act="unequip">Unequip</button>'
            : it2.slot === 'ring' && p.eq.ring && p.eq.ring2 ? '<button class="tb" data-act="equip" data-slot="ring">Replace left ring</button><button class="tb" data-act="equip" data-slot="ring2">Replace right ring</button>'
            : '<button class="tb" data-act="equip">Equip</button>') +
          '<button class="tb" data-act="drop">Drop</button></div>';
      } else { det.hidden = true; $('invHint').hidden = false; }
    }
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-alloc],[data-eq],[data-inv],[data-act]') : null; if (!t) return;
    var p = me(); if (!p) return;
    if (t.dataset.alloc) { cmd({ t: 'alloc', stat: t.dataset.alloc }); return; }
    // Ctrl + click (Cmd + click on Mac) drops the item straight on the ground.
    if ((e.ctrlKey || e.metaKey) && (t.dataset.eq || t.dataset.inv)) {
      var from = t.dataset.eq ? 'eq' : 'inv', key = t.dataset.eq ? t.dataset.eq : +t.dataset.inv;
      if (from === 'eq' ? p.eq[key] : p.inv[key]) { cmd({ t: 'drop', from: from, key: key }); sel = null; hideTip(); }
      return;
    }
    if (t.dataset.eq) { var s = t.dataset.eq; sel = p.eq[s] ? { from: 'eq', key: s } : null; hideTip(); renderPanels(); return; }
    if (t.dataset.inv) { var i = +t.dataset.inv; sel = p.inv[i] ? { from: 'inv', key: i } : null; hideTip(); renderPanels(); return; }
    if (t.dataset.act && sel) {
      if (t.dataset.act === 'equip') cmd({ t: 'equip', index: sel.key, slot: t.dataset.slot });
      else if (t.dataset.act === 'unequip') cmd({ t: 'unequip', slot: sel.key });
      else if (t.dataset.act === 'drop') cmd({ t: 'drop', from: sel.from, key: sel.key });
      sel = null;
    }
  });
  // floating tooltip on desktop
  var tipEl = $('tooltip');
  function hideTip() { tipEl.hidden = true; }
  document.addEventListener('pointerover', function (e) {
    if (e.pointerType === 'touch') return;
    var t = e.target.closest ? e.target.closest('[data-eq],[data-inv]') : null, p = me();
    if (!t || !p) { hideTip(); return; }
    var it = t.dataset.eq ? p.eq[t.dataset.eq] : p.inv[+t.dataset.inv];
    if (!it) { hideTip(); return; }
    tipEl.innerHTML = itemHtml(it, t.dataset.inv ? p : null); tipEl.hidden = false;
    var r = t.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    var x = r.left - tw - 10; if (x < 8) x = Math.min(vw - tw - 8, r.right + 10);
    var y = Math.max(8, Math.min(vh - th - 8, r.top));
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  });

  // ---------- Co-op (host-authoritative, peer to peer) ----------
  // The host runs the engine. Clients send commands and draw snapshots.
  // Transport: PeerJS (WebRTC data channels, free public signaling server).
  // Add ?transport=local to the URL to test with two tabs in one browser.
  var MODE = 'solo', conns = [], pendingEv = [], lastSnap = 0, SNAP_MS = 66, snapAt = 0, peer = null, hostConn = null, roomCode = '', nextPid = 2;
  var LIB = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
  var ICE = { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };
  var LOCAL = /[?&]transport=local/.test(location.search);
  var LITE = ['x', 'y', 'hp', 'mana', 'face', 'moving', 'anim', 'dead', 'respawn', 'cd', 'order', 'ver', 'level', 'xp', 'name', 'deadAt', 'chan', 'slowT', 'blN', 'blT', 'charge', 'zeal'];

  function netStatus(t, bad) { var el = $('netStatus'); el.textContent = t; el.classList.toggle('warn', !!bad); }
  function webrtcOk() { try { return typeof RTCPeerConnection !== 'undefined' && !!new RTCPeerConnection(); } catch (e) { return false; } }
  function loadPeerLib() {
    return new Promise(function (res, rej) {
      if (window.Peer) return res();
      var s = document.createElement('script'); s.src = LIB; s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('Could not load the networking library. Check your internet connection.')); };
      document.head.appendChild(s);
    });
  }
  function makeCode() { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', c = ''; for (var i = 0; i < 5; i++) c += a[Math.floor(Math.random() * a.length)]; return c; }

  // Local transport: same API shape as PeerJS, over BroadcastChannel. Only for testing.
  function LocalPeer(id) {
    var self = this, me = id || ('c' + Math.random().toString(36).slice(2, 8)), bc = new BroadcastChannel('ashgrave-net'), handlers = {}, links = {};
    this.id = me;
    this.on = function (ev, fn) { handlers[ev] = fn; };
    function mkConn(other) {
      var h = {}, c = { peer: other, open: false, on: function (e, f) { h[e] = f; }, send: function (d) { bc.postMessage({ to: other, from: me, k: 'data', d: d }); },
        close: function () { bc.postMessage({ to: other, from: me, k: 'close' }); if (h.close) h.close(); }, _h: h };
      links[other] = c; return c;
    }
    bc.onmessage = function (e) {
      var m = e.data; if (m.to !== me) return;
      if (m.k === 'hello') { var c = mkConn(m.from); if (handlers.connection) handlers.connection(c); bc.postMessage({ to: m.from, from: me, k: 'ack' }); setTimeout(function () { if (c._h.open) c._h.open(); }, 0); }
      else if (m.k === 'ack') { var c2 = links[m.from]; if (c2 && c2._h.open) c2._h.open(); }
      else if (m.k === 'data') { var c3 = links[m.from]; if (c3 && c3._h.data) c3._h.data(JSON.parse(JSON.stringify(m.d))); }
      else if (m.k === 'close') { var c4 = links[m.from]; if (c4 && c4._h.close) c4._h.close(); delete links[m.from]; }
    };
    this.connect = function (other) { var c = mkConn(other); bc.postMessage({ to: other, from: me, k: 'hello' }); return c; };
    this.destroy = function () { Object.keys(links).forEach(function (k) { links[k].close(); }); bc.close(); };
    setTimeout(function () { if (handlers.open) handlers.open(me); }, 0);
  }
  function newPeer(id) { return LOCAL ? new LocalPeer(id) : (id ? new window.Peer(id, ICE) : new window.Peer(ICE)); }
  function prepare() {
    if (LOCAL) return Promise.resolve();
    if (!webrtcOk()) return Promise.reject(new Error('Co-op does not run in this preview. Download the game file and open it in Chrome, Edge or Firefox.'));
    return loadPeerLib();
  }

  function charForNet() { var c = loadStore().slots[selSlot]; return c ? JSON.parse(JSON.stringify(c)) : null; }

  // ----- Host -----
  function myBuild() { return typeof BUILD !== 'undefined' ? BUILD : 'dev'; }
  // On the hosted page, look for a newer build than the one loaded (GitHub Pages caches for a few minutes).
  function checkForUpdate() {
    if (!/^https?:$/.test(location.protocol) || typeof fetch !== 'function') return;
    try {
      fetch(location.pathname + '?v=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
        var mm = /var BUILD = "([^"]+)"/.exec(t || '');
        if (mm && mm[1] > myBuild()) { $('updBar').hidden = false; $('updTxt').textContent = 'A newer version is out (build ' + mm[1] + ').'; }
      }).catch(function () { });
    } catch (e) { }
  }
  checkForUpdate(); setInterval(function () { if (!running) checkForUpdate(); }, 120000);
  $('updGo').addEventListener('click', function () { writeSave(); location.reload(); });
  function cleanRoom(v) { var c = (v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); return c.length >= 3 && c.length <= 12 ? c : ''; }
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { } }
  $('roomIn').value = lsGet('ashgrave.room'); $('codeIn').value = lsGet('ashgrave.lastJoin');
  $('roomIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') hostGame(); e.stopPropagation(); });
  function hostGame() {
    if (selSlot < 0 || !loadStore().slots[selSlot]) { netStatus('Choose a character first.', true); return; }
    if (!E.isUnlocked(store.slots[selSlot], selDiff)) { netStatus(DATA.difficulties[selDiff].lockText, true); return; }
    ensureAudio(); netStatus('Opening a room…');
    prepare().then(function () {
      var chosen = cleanRoom($('roomIn').value);
      if ($('roomIn').value.trim() && !chosen) { netStatus('A room name is 3 to 12 letters or digits.', true); return; }
      lsSet('ashgrave.room', chosen);
      roomCode = chosen || makeCode();
      peer = newPeer('ashgrave-' + roomCode);
      peer.on('open', function () {
        MODE = 'host'; startGame(selSlot, selDiff);
        showRoom();
        addLog('Room ' + roomCode + ' is open. Your friend joins with ' + roomCode + '.', 'gold');
      });
      peer.on('connection', function (conn) {
        conn.on('data', function (m) { onClientMsg(conn, m); });
        conn.on('close', function () { dropConn(conn); });
      });
      peer.on('error', function (err) {
        if (err && err.type === 'unavailable-id') { netStatus('The room name ' + roomCode + ' is in use right now. If you just closed it, wait half a minute and try again; otherwise pick another name.', true); try { peer.destroy(); } catch (e2) { } return; }
        if (MODE === 'host') addLog('Network: ' + (err && err.type || err), 'warn'); else netStatus('Could not open a room: ' + (err && err.type || err), true);
      });
    }).catch(function (e) { netStatus(e.message, true); });
  }
  var ALLOWED = { revive: 1, giveup: 1, talk: 1, buy: 1, move: 1, attack: 1, shoot: 1, skill: 1, charge: 1, node: 1, pickup: 1, stairs: 1, stop: 1, potion: 1, equip: 1, unequip: 1, drop: 1, alloc: 1 };
  function onClientMsg(conn, m) {
    if (!m || !S) return;
    if (m.t === 'hello' && !conn.pid) {
      if (Object.keys(S.players).length >= 4) { conn.send({ t: 'full' }); return; }
      conn.pid = 'p' + (nextPid++); conn.sent = {}; conn.groundKey = '';
      var c = m.char ? E.migrateCharacter(m.char) : E.newCharacter('Archer', 'archer');
      if (!E.isUnlocked(c, S.difficulty)) { conn.send({ t: 'locked', difficulty: S.difficulty }); return; }
      E.addPlayer(S, conn.pid, c);
      conns.push(conn);
      conn.send({ t: 'welcome', pid: conn.pid, room: roomCode, build: myBuild() });
      if (m.build !== myBuild()) addLog('Version mismatch: ' + (c.name || 'your friend') + ' has build ' + (m.build || 'unknown') + ', you have ' + myBuild() + '. Whoever is older should reload with Ctrl+Shift+R.', 'warn');
      addLog(S.players[conn.pid].name + ' joined the game.', 'gold'); showRoom();
    } else if (m.t === 'cmd' && conn.pid && m.c && ALLOWED[m.c.t]) E.command(S, conn.pid, m.c);
  }
  function dropConn(conn) {
    var i = conns.indexOf(conn); if (i < 0) return;
    conns.splice(i, 1);
    if (S && conn.pid && S.players[conn.pid]) { addLog(S.players[conn.pid].name + ' left the game.', 'warn'); E.removePlayer(S, conn.pid); }
    showRoom();
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function snapFor(conn) {
    var me2 = S.players[conn.pid], players = {};
    Object.keys(S.players).forEach(function (id) {
      var p = S.players[id];
      if (conn.sent[id] !== p.ver) { conn.sent[id] = p.ver; var full = {}; Object.keys(p).forEach(function (k) { if (k !== 'path') full[k] = p[k]; }); players[id] = full; }
      else { var lite = { id: id }; LITE.forEach(function (k) { lite[k] = p[k]; }); lite.x = r2(p.x); lite.y = r2(p.y); players[id] = lite; }
    });
    var cx = me2 ? me2.x : S.map.start.x, cy = me2 ? me2.y : S.map.start.y;
    var mons = S.monsters.filter(function (m) { return Math.abs(m.x - cx) < 18 && Math.abs(m.y - cy) < 18; }).map(function (m) {
      var o = { id: m.id, type: m.type, x: r2(m.x), y: r2(m.y), r: m.r, hp: m.hp, max: m.max, champ: m.champ, face: r2(m.face), moving: m.moving, atk: r2(m.atk), hitT: r2(m.hitT) };
      if (m.boss) { o.boss = m.boss; o.name = m.name; o.traits = m.traits; o.scale = m.scale; o.cast = m.cast; o.aura = m.aura; }
      if (m.markT > S.time) o.mark = 1;
      if (m.darkPool > 0) o.dark = 1;
      if (m.rend && m.rend.length) o.rendN = m.rend.length;
      if (m.sunT && S.time - m.sunT < 0.6) o.sun = 1;
      return o;
    });
    var projs = S.projs.map(function (pr) { return { id: pr.id, kind: pr.kind, big: pr.big, x: r2(pr.x), y: r2(pr.y), vx: pr.vx, vy: pr.vy, fire: pr.fire, light: pr.light, dark: pr.dark, owner: pr.owner }; });
    var msg = { t: 'snap', seed: S.seed, depth: S.depth, difficulty: S.difficulty, final: !!S.map.final, time: S.time, seal: S.seal, players: players, monsters: mons, projs: projs, npcs: S.npcs, zones: S.zones || [], ev: pendingEv };
    var gk = S.depth + ':' + S.ground.map(function (g) { return g.id; }).join(',');
    if (gk !== conn.groundKey) { conn.groundKey = gk; msg.ground = S.ground; }
    return msg;
  }
  function hostTick(now) {
    if (MODE !== 'host' || now - lastSnap < SNAP_MS) return;
    lastSnap = now;
    conns.forEach(function (c) { if (c.pid) { try { c.send(snapFor(c)); } catch (e) { } } });
    pendingEv = [];
  }
  function showRoom() {
    var el = $('room'); if (MODE === 'solo') { el.hidden = true; return; }
    el.hidden = false;
    var n = S ? Object.keys(S.players).length : 1;
    $('roomTxt').textContent = MODE === 'host' ? 'Room ' + roomCode + ' · ' + n + (n === 1 ? ' player' : ' players') : 'Connected to room ' + roomCode;
    $('roomCopy').hidden = MODE !== 'host';
  }
  $('roomCopy').addEventListener('click', function () {
    var b = $('roomCopy');
    try { navigator.clipboard.writeText(roomCode).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy name'; }, 1500); }, function () { b.textContent = roomCode; }); }
    catch (e) { b.textContent = roomCode; }
  });

  // ----- Client -----
  function joinGame() {
    ensureAudio();
    if (selSlot < 0 || !loadStore().slots[selSlot]) { netStatus('Choose a character first.', true); return; }
    var code = cleanRoom($('codeIn').value);
    if (!code) { netStatus('Enter the host\'s room name (3 to 12 letters or digits).', true); return; }
    lsSet('ashgrave.lastJoin', code);
    netStatus('Connecting…');
    prepare().then(function () {
      roomCode = code;
      peer = newPeer();
      var timer = setTimeout(function () { if (MODE !== 'client') { netStatus('Could not connect. Check the code, or a firewall may be blocking a direct link.', true); try { peer.destroy(); } catch (e) { } } }, 15000);
      peer.on('open', function () {
        hostConn = peer.connect('ashgrave-' + code, { reliable: true });
        hostConn.on('open', function () { hostConn.send({ t: 'hello', char: charForNet(), build: myBuild() }); });
        hostConn.on('data', function (m) {
          if (m.t === 'welcome') {
            clearTimeout(timer); MODE = 'client'; PID = m.pid; activeSlot = selSlot; enterClient();
            if (m.build && m.build !== myBuild()) addLog('Version mismatch: the host has build ' + m.build + ', you have ' + myBuild() + '. Whoever is older should reload with Ctrl+Shift+R.', 'warn');
          }
          else if (m.t === 'locked') { clearTimeout(timer); netStatus('That game is on ' + DATA.difficulties[m.difficulty].name + ', which ' + loadStore().slots[selSlot].name + ' has not unlocked.', true); try { peer.destroy(); } catch (e) { } }
          else if (m.t === 'full') { clearTimeout(timer); netStatus('That game already has four players.', true); }
          else if (m.t === 'snap' && MODE === 'client') applySnap(m);
          else if (m.t === 'bye' && MODE === 'client') leaveToTitle('The host closed the game. Your character is saved.');
        });
        hostConn.on('close', function () { if (MODE === 'client') leaveToTitle('The host left the game. Your character is saved.'); });
      });
      peer.on('error', function (err) {
        clearTimeout(timer);
        var t = err && err.type === 'peer-unavailable' ? 'No open game with that code.' : 'Network error: ' + (err && err.type || err);
        if (MODE === 'client') leaveToTitle(t); else netStatus(t, true);
      });
    }).catch(function (e) { netStatus(e.message, true); });
  }
  function enterClient() {
    $('title').hidden = true; document.body.classList.remove('at-title'); S = null; running = false; lastVer = -1;
    showRoom(); addLog('Joined room ' + roomCode + '.', 'gold');
  }
  function applySnap(m) {
    if (S) {
      var keep = new Map();
      Object.keys(S.players).forEach(function (id) { var q = S.players[id], l = lerpE(q); keep.set(q.id, [l.x, l.y]); });
      S.monsters.forEach(function (q) { var l = lerpE(q); keep.set(q.id, [l.x, l.y]); });
      S.projs.forEach(function (q) { var l = lerpE(q); keep.set(q.id, [l.x, l.y]); });
      prev = keep;
    }
    if (!S || S.depth !== m.depth || S.seed !== m.seed || S.difficulty !== m.difficulty) {
      var old = S;
      S = { seed: m.seed, depth: m.depth, difficulty: m.difficulty || 'normal', map: E.genLevel(m.seed, m.depth), players: old ? old.players : {}, monsters: [], projs: [], ground: [], npcs: [], events: [], queue: [] };
      if (m.final) E.applyFinal(S.map);
      explored = new Uint8Array(S.map.W * S.map.H); corpses = []; prev = new Map();
      setDepthLabel();
    }
    var np = {};
    Object.keys(m.players).forEach(function (id) {
      var inc = m.players[id];
      np[id] = inc.inv ? inc : Object.assign(S.players[id] || {}, inc);
      np[id].id = id;
    });
    S.time = m.time || 0; S.seal = m.seal || null; S.players = np; S.monsters = m.monsters; S.projs = m.projs; S.npcs = m.npcs || []; S.zones = m.zones || [];
    if (m.ground) S.ground = m.ground;
    snapAt = performance.now(); alpha = 0;
    if (!running && S.players[PID] && S.players[PID].st) running = true;
    handleEvents(m.ev || []);
  }
  function leaveToTitle(msg, good) {
    writeSave();
    try { if (peer) peer.destroy(); } catch (e) { }
    MODE = 'solo'; PID = 'p1'; S = null; running = false; conns = []; hostConn = null; peer = null; paused = false; trialFailing = false;
    $('menu').hidden = true; $('settings').hidden = true;
    $('room').hidden = true; $('dead').hidden = true; closePanel('charPanel'); closePanel('invPanel'); closePanel('shopPanel'); closePanel('talkPanel');
    activeSlot = -1; $('log').innerHTML = ''; document.body.classList.add('at-title');
    renderTitle(); $('title').hidden = false; netStatus(msg || '', !good);
  }
  window.addEventListener('beforeunload', function () {
    if (MODE === 'host') conns.forEach(function (c) { try { c.send({ t: 'bye' }); } catch (e) { } });
    if (MODE === 'client' && hostConn) { try { hostConn.close(); } catch (e) { } }
    writeSave();
  });
  $('giveUp').addEventListener('click', function () { cmd({ t: 'giveup' }); });
  $('bHost').addEventListener('click', hostGame);
  $('bJoin').addEventListener('click', joinGame);
  $('codeIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') joinGame(); e.stopPropagation(); });
  // Keep the host's world running when its tab is in the background (browsers slow this to about once a second).
  setInterval(function () { if (MODE === 'host' && document.hidden && S) { stepSim(0.25); hostTick(performance.now()); } }, 250);

  // ---------- Start ----------
  function setDepthLabel() {
    if (!S) return;
    if (S.trial) {
      var open = (S.map.gates || []).filter(function (g) { return g.open; }).length;
      $('depthN').textContent = DATA.trial.name + ' · ' + (S.trialDone ? 'Complete' : open >= 3 ? 'The sanctum' : 'Chamber ' + (open + 1) + ' of 3');
      return;
    }
    var dn = DATA.difficulties[S.difficulty || 'normal'].name;
    $('depthN').textContent = 'Level ' + S.depth + (S.map && S.map.final ? ' (final)' : '') + ' · ' + dn;
  }
  function startTrial(slot) {
    var c = JSON.parse(JSON.stringify(loadStore().slots[slot]));
    if (!c || (c.trial !== 'unlocked' && c.trial !== 'done')) return;
    activeSlot = slot; store.last = slot; saveStore();
    E.migrateCharacter(c);
    $('title').hidden = true; document.body.classList.remove('at-title');
    MODE = 'solo'; PID = 'p1';
    S = E.createSim((Math.random() * 2147483647) | 0, 10, 'normal', { trial: true });
    E.addPlayer(S, PID, c);
    explored = new Uint8Array(S.map.W * S.map.H); corpses = [];
    processEvents(); setDepthLabel();
    running = true; lastVer = -1; trialFailing = false;
  }
  function startGame(slot, diff) {
    var c = JSON.parse(JSON.stringify(loadStore().slots[slot]));
    if (!c) return;
    activeSlot = slot; store.last = slot; saveStore();
    E.migrateCharacter(c);
    var pr = c.progress[diff];
    c.depth = pr.depth; c.maxDepth = pr.maxDepth;
    $('title').hidden = true; document.body.classList.remove('at-title');
    var seed = (Math.random() * 2147483647) | 0;
    if (MODE !== 'host') { MODE = 'solo'; PID = 'p1'; }
    S = E.createSim(seed, c.depth, diff);
    E.addPlayer(S, PID, c);
    explored = new Uint8Array(S.map.W * S.map.H);
    processEvents();
    setDepthLabel();
    running = true; lastVer = -1; writeSave();
    if (S.depth === 1 && c.level === 1) {
      addLog('Click to move. Click an enemy to attack it.', '');
      addLog('Find the stairs down. Tab shows the map.', '');
    }
  }

  // ---------- Title: character slots ----------
  var selSlot = -1, selDiff = 'normal', creating = -1, newCls = 'archer', armedDel = -1, armedTimer = 0;
  var CLASS_BLURB = { archer: 'Bow and Multishot. Keeps distance.', warrior: 'Sword and Cleave. Takes 15% less damage.' };
  function progressLine(c) {
    var D2 = DATA.difficulties, order = Object.keys(D2), parts = [];
    var cur = 'normal';
    order.forEach(function (k) { if (E.isUnlocked(c, k)) cur = k; });
    var pr = c.progress[cur];
    parts.push(pr.done ? D2[cur].name + ' complete' : D2[cur].name + ' · level ' + pr.maxDepth + ' of ' + D2[cur].finalDepth);
    if (c.trial === 'unlocked') parts.push('Trial unlocked');
    else if (c.trial === 'done') parts.push('Trial complete');
    if (c.ascendancy && DATA.ascendancies[c.ascendancy]) parts.push(DATA.ascendancies[c.ascendancy].name);
    return parts.join(' · ');
  }
  function bestDiff(c) { var best = 'normal'; Object.keys(DATA.difficulties).forEach(function (k) { if (E.isUnlocked(c, k)) best = k; }); return best; }
  function renderTitle() {
    var st = loadStore();
    if (selSlot < 0 || !st.slots[selSlot]) {
      selSlot = st.slots[st.last] ? st.last : st.slots.findIndex(function (c) { return !!c; });
      if (selSlot >= 0) selDiff = bestDiff(st.slots[selSlot]);
    }
    $('slots').innerHTML = st.slots.map(function (c, i) {
      if (creating === i) {
        return '<div class="slot creating" data-slot="' + i + '">' +
          '<label class="sub" for="newName">Name</label><input id="newName" maxlength="16" placeholder="Name your hero" autocomplete="off" spellcheck="false">' +
          '<div class="clsrow">' + ['archer', 'warrior'].map(function (k) {
            return '<button class="cls' + (newCls === k ? ' on' : '') + '" data-cls="' + k + '" aria-pressed="' + (newCls === k) + '"><b>' + DATA.classes[k].name + '</b><small>' + CLASS_BLURB[k] + '</small></button>';
          }).join('') + '</div>' +
          '<div class="slrow"><button class="tb" data-cancel="1">Cancel</button><button class="tb primary" data-make="' + i + '">Create</button></div></div>';
      }
      if (!c) return '<div class="slot empty"><span class="sl-empty">Empty slot</span><button class="tb" data-create="' + i + '">Create character</button></div>';
      var cd = DATA.classes[c.cls] || DATA.classes.archer;
      return '<div class="slot' + (selSlot === i ? ' sel' : '') + '" data-slot="' + i + '" role="button" tabindex="0" aria-pressed="' + (selSlot === i) + '">' +
        '<div class="sl-top"><span class="sl-name">' + esc(c.name) + '</span><span class="sl-cls">Level ' + c.level + ' ' + cd.name + '</span></div>' +
        '<div class="sl-prog">' + esc(progressLine(c)) + '</div>' +
        '<div class="slrow"><button class="lnk" data-export="' + i + '">Export</button><button class="lnk danger" data-del="' + i + '">' + (armedDel === i ? 'Click again to delete' : 'Delete') + '</button></div></div>';
    }).join('');
    var c = st.slots[selSlot];
    $('playBox').hidden = !c;
    if (c) {
      if (!E.isUnlocked(c, selDiff)) selDiff = bestDiff(c);
      $('playWho').textContent = c.name;
      $('trialRow').hidden = c.trial !== 'unlocked' && c.trial !== 'done';
      $('bTrial').textContent = c.trial === 'done' ? 'Run the Trial of Ash again' : 'Enter the Trial of Ash';
      var ap = E.ascPoints(c), un = c.ascendancy ? E.ascUnspent(c) : ap;
      $('altarRow').hidden = ap <= 0;
      $('bAltar').classList.toggle('badge', un > 0);
      $('altarNote').textContent = !c.ascendancy ? 'Choose your path: light or dark.' : DATA.ascendancies[c.ascendancy].name + (un > 0 ? ' · ' + un + (un === 1 ? ' point' : ' points') + ' to spend' : ' · ' + E.ascPoints(c) + ' points');
      $('diffs').innerHTML = Object.keys(DATA.difficulties).map(function (k) {
        var d = DATA.difficulties[k], ok = E.isUnlocked(c, k), pr = c.progress[k];
        var note = !ok ? d.lockText : pr.done ? 'Complete' : 'Level ' + pr.depth + ' of ' + d.finalDepth;
        return '<button class="diff' + (selDiff === k ? ' on' : '') + '" data-diff="' + k + '"' + (ok ? '' : ' disabled') + ' aria-pressed="' + (selDiff === k) + '"><b>' + d.name + '</b><small>' + note + '</small></button>';
      }).join('');
    }
    if (creating >= 0) { var ni = $('newName'); if (ni) setTimeout(function () { try { ni.focus(); } catch (e) { } }, 0); }
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#title')) return;
    var t = e.target.closest('[data-create],[data-cancel],[data-make],[data-cls],[data-export],[data-del],[data-diff],[data-slot]');
    if (!t) return;
    var st = loadStore();
    if (t.dataset.del === undefined && armedDel >= 0) { armedDel = -1; }
    if (t.dataset.create !== undefined) { creating = +t.dataset.create; newCls = 'archer'; renderTitle(); return; }
    if (t.dataset.cancel !== undefined) { creating = -1; renderTitle(); return; }
    if (t.dataset.cls) { var nmKeep = $('newName') ? $('newName').value : ''; newCls = t.dataset.cls; renderTitle(); if ($('newName')) $('newName').value = nmKeep; return; }
    if (t.dataset.make !== undefined) {
      var i = +t.dataset.make, nm = ($('newName').value || '').trim().slice(0, 16) || DATA.classes[newCls].name;
      var c = E.newCharacter(nm, newCls); c.id = newId(); c.created = Date.now();
      st.slots[i] = c; st.last = i; saveStore();
      creating = -1; selSlot = i; selDiff = 'normal'; renderTitle(); netStatus(nm + ' is ready.', false); return;
    }
    if (t.dataset.export !== undefined) { openExport(+t.dataset.export); return; }
    if (t.dataset.del !== undefined) {
      var di = +t.dataset.del;
      if (armedDel !== di) { armedDel = di; clearTimeout(armedTimer); armedTimer = setTimeout(function () { armedDel = -1; renderTitle(); }, 4000); renderTitle(); return; }
      var gone = st.slots[di].name; st.slots[di] = null; saveStore(); armedDel = -1;
      if (selSlot === di) selSlot = -1;
      renderTitle(); netStatus(gone + ' was deleted.', false); return;
    }
    if (t.dataset.diff) { selDiff = t.dataset.diff; renderTitle(); return; }
    if (t.dataset.slot !== undefined && !t.classList.contains('creating')) { selSlot = +t.dataset.slot; if (st.slots[selSlot]) selDiff = bestDiff(st.slots[selSlot]); st.last = selSlot; saveStore(); netStatus('', false); renderTitle(); }
  });
  document.addEventListener('keydown', function (e) {
    var el = document.activeElement;
    if (el && el.id === 'newName') { e.stopPropagation(); if (e.key === 'Enter') { var mk = document.querySelector('[data-make]'); if (mk) mk.click(); } return; }
    if (el && el.classList && el.classList.contains('slot') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
  }, true);
  // ---------- The Ash Altar ----------
  var altarSlot = -1, altarArmed = false, altarPick = null;
  function openAltar(slot) { altarSlot = slot; altarArmed = false; altarPick = null; $('altarStatus').textContent = ''; renderAltar(); $('altar').hidden = false; }
  function closeAltar() { $('altar').hidden = true; altarSlot = -1; renderTitle(); }
  function altarChar() { return altarSlot >= 0 ? loadStore().slots[altarSlot] : null; }
  function nextPointLevel(c) { var L = DATA.ascendancy.levelsPerPoint; return (Math.floor(c.level / L) + 1) * L; }
  function nextPointHint(c) { return 'You get a point every ' + DATA.ascendancy.levelsPerPoint + ' levels. Next at level ' + nextPointLevel(c) + '.'; }
  function nodeName(id) { var out = id; Object.keys(DATA.ascendancies).forEach(function (k) { DATA.ascendancies[k].nodes.forEach(function (n) { if (n.id === id) out = n.name; }); }); return out; }
  function fmtV(v) { return Math.round(v * 10) / 10; }
  // One node: its name, rank pips, what it does now and at the next rank.
  function nodeHtml(c, n, un, attr) {
    var r = E.rank(c, n.id), maxed = r >= n.max, can = !maxed && un > 0;
    var txt = n.max > 1 ? n.desc.replace('{v}', fmtV(Math.max(1, r) * n.per)) : n.desc;
    var pips = ''; for (var i = 0; i < n.max; i++) pips += '<i class="' + (i < r ? 'on' : '') + '"></i>';
    var um = /\{v\}(%|s)/.exec(n.desc), unit = um ? um[1] : '';
    var foot = maxed ? (n.max > 1 ? 'Max rank' : 'Yours') : can ? (r ? 'Rank up to ' + fmtV((r + 1) * n.per) + unit : 'Take it') : 'Needs a point';
    return '<button class="gift' + (r ? ' have' : '') + '" ' + attr + '="' + n.id + '"' + (can ? '' : ' disabled') + '><b>' + n.name + '</b><span class="pips">' + pips + '</span><span>' + txt + '</span><em>' + foot + '</em></button>';
  }
  function renderAltar() {
    var c = altarChar(); if (!c) { $('altar').hidden = true; return; }
    E.migrateCharacter(c);
    var A = DATA.ascendancies, total = E.ascPoints(c);
    $('altarWho').textContent = c.name + ' · Level ' + c.level + ' ' + DATA.classes[c.cls].name;
    if (!c.ascendancy) {
      var paths = Object.keys(A).filter(function (k) { return A[k].cls === c.cls; });
      $('altarIntro').textContent = 'Two paths are open to you. Your path changes your attack and your skill. Points for its tree come every ' + DATA.ascendancy.levelsPerPoint + ' levels; you have ' + total + '.';
      $('altarBody').innerHTML = '<div class="paths">' + paths.map(function (k) {
        var a = A[k];
        return '<div class="path ' + a.side + (altarPick === k ? ' pick' : '') + '"><div class="side">' + (a.side === 'light' ? 'Light' : 'Dark') + '</div><h3>' + a.name + '</h3><p class="lore">' + a.lore + '</p>' +
          '<div class="core"><b>' + a.core.name + '</b><span>' + a.core.desc + ' +' + Math.round(DATA.ascendancy.sideBonus * 100) + '% ' + a.side + ' damage.</span></div>' +
          '<ul class="nodes">' + a.nodes.map(function (n) { return '<li><b>' + n.name + (n.max > 1 ? ' <small>(' + n.max + ' ranks)</small>' : '') + '</b><span>' + n.desc.replace('{v}', fmtV(n.per)) + (n.max > 1 ? ' per rank' : '') + '</span></li>'; }).join('') + '</ul>' +
          '<button class="big' + (a.side === 'dark' ? ' dark' : '') + '" data-path="' + k + '">' + (altarPick === k ? 'Kneel. This is my path' : 'Walk the ' + a.name + ' path') + '</button></div>';
      }).join('') + '</div>';
      return;
    }
    var a = A[c.ascendancy], un = E.ascUnspent(c), cost = E.renounceCost(c);
    $('altarIntro').textContent = un > 0 ? 'You have ' + un + (un === 1 ? ' point' : ' points') + ' to spend. You can also spend them in the character panel during a game.' : nextPointHint(c);
    $('altarBody').innerHTML = '<div class="path solo ' + a.side + '"><div class="side">' + (a.side === 'light' ? 'Light' : 'Dark') + ' · ' + (total - un) + ' of ' + total + ' points spent</div><h3>' + a.name + '</h3><p class="lore">' + a.lore + '</p>' +
      '<div class="core"><b>' + a.core.name + '</b><span>' + a.core.desc + ' +' + Math.round(DATA.ascendancy.sideBonus * 100) + '% ' + a.side + ' damage.</span></div>' +
      '<div class="gifts">' + a.nodes.map(function (n) { return nodeHtml(c, n, un, 'data-node'); }).join('') + '</div>' +
      (un > 0 ? '<p class="hint">' + nextPointHint(c) + '</p>' : '') +
      '<div class="tools"><button class="tb danger" id="altarRenounce">' + (altarArmed ? 'Click again to renounce' + (cost ? ' (' + cost + ' gold)' : '') : 'Renounce this path' + (cost ? ' · ' + cost + ' gold' : ' · free')) + '</button></div></div>';
  }
  $('altar').addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-path],[data-node],#altarRenounce,#altarClose') : null;
    if (!t) return;
    if (t.id === 'altarClose') { closeAltar(); return; }
    var st = loadStore(), c = st.slots[altarSlot]; if (!c) return;
    E.migrateCharacter(c);
    var err = null, msg = '';
    if (t.dataset.path) {
      if (altarPick !== t.dataset.path) { altarPick = t.dataset.path; renderAltar(); return; }
      err = E.chooseAscendancy(c, t.dataset.path); if (!err) { msg = c.name + ' walks the ' + DATA.ascendancies[c.ascendancy].name + ' path.'; altarPick = null; sfx('level'); }
    } else if (t.dataset.node) {
      err = E.takeNode(c, t.dataset.node); if (!err) { msg = nodeName(t.dataset.node) + ' is now rank ' + c.ascNodes[t.dataset.node] + '.'; sfx('level'); }
    } else if (t.id === 'altarRenounce') {
      if (!altarArmed) { altarArmed = true; renderAltar(); return; }
      altarArmed = false; var was = c.ascendancy;
      err = E.renounce(c); if (!err) msg = 'You renounce the ' + DATA.ascendancies[was].name + ' path.';
    }
    if (!err) saveStore();
    $('altarStatus').textContent = err || msg;
    $('altarStatus').classList.toggle('err', !!err);
    renderAltar();
  });
  $('bAltar').addEventListener('click', function () { if (selSlot >= 0 && loadStore().slots[selSlot]) { ensureAudio(); openAltar(selSlot); } });

  $('bTrial').addEventListener('click', function () {
    var c = loadStore().slots[selSlot]; if (!c || (c.trial !== 'unlocked' && c.trial !== 'done')) return;
    ensureAudio(); netStatus('', false); startTrial(selSlot);
  });
  $('bPlay').addEventListener('click', function () {
    var c = loadStore().slots[selSlot]; if (!c) return;
    if (!E.isUnlocked(c, selDiff)) { netStatus(DATA.difficulties[selDiff].lockText, true); return; }
    ensureAudio(); netStatus('', false); startGame(selSlot, selDiff);
  });

  // ---------- Export / import ----------
  function exportText(c) { return JSON.stringify({ game: 'ashgrave', version: E.SAVE_VERSION, exported: new Date().toISOString(), character: c }, null, 1); }
  function fileName(c) { return 'ashgrave-' + (c.name || 'hero').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-lvl' + c.level + '.json'; }
  function openExport(i) {
    var c = loadStore().slots[i]; if (!c) return;
    $('exTitle').textContent = 'Export ' + c.name;
    $('exText').value = exportText(c);
    $('exStatus').textContent = '';
    $('exportBox').hidden = false; $('exportBox').dataset.slot = i;
  }
  $('exDownload').addEventListener('click', function () {
    var c = loadStore().slots[+$('exportBox').dataset.slot]; if (!c) return;
    try {
      var blob = new Blob([exportText(c)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = fileName(c); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      $('exStatus').textContent = 'Saved as ' + fileName(c) + '. If nothing was saved, copy the text instead.';
    } catch (e) { $('exStatus').textContent = 'This page cannot save files. Copy the text instead.'; }
  });
  $('exCopy').addEventListener('click', function () {
    var ta = $('exText');
    try { navigator.clipboard.writeText(ta.value).then(function () { $('exStatus').textContent = 'Copied. Paste it into a text file to keep it.'; }, function () { ta.select(); $('exStatus').textContent = 'Press Ctrl + C to copy the selected text.'; }); }
    catch (e) { ta.select(); $('exStatus').textContent = 'Press Ctrl + C to copy the selected text.'; }
  });
  $('exClose').addEventListener('click', function () { $('exportBox').hidden = true; });
  $('bImport').addEventListener('click', function () { $('imText').value = ''; $('imStatus').textContent = ''; $('imStatus').classList.remove('warn'); $('importBox').hidden = false; });
  $('imClose').addEventListener('click', function () { $('importBox').hidden = true; });
  $('imFile').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { $('imText').value = String(r.result || ''); doImport(); };
    r.onerror = function () { imFail('Could not read that file.'); };
    r.readAsText(f); this.value = '';
  });
  $('imGo').addEventListener('click', doImport);
  function imFail(t) { $('imStatus').textContent = t; $('imStatus').classList.add('warn'); }
  function doImport() {
    var raw = ($('imText').value || '').trim();
    if (!raw) { imFail('Choose a file or paste the exported text.'); return; }
    var data;
    try { data = JSON.parse(raw); } catch (e) { imFail('That is not an Ashgrave save. The text could not be read.'); return; }
    var c = data && data.game === 'ashgrave' ? data.character : (data && data.char) || data;
    if (!c || typeof c !== 'object' || !c.cls || !c.base || !c.eq) { imFail('That is not an Ashgrave character.'); return; }
    if (data.version && data.version > E.SAVE_VERSION) { imFail('This save comes from a newer version of the game. Update the game file first.'); return; }
    var st = loadStore(), free = st.slots.indexOf(null);
    if (free < 0) { imFail('All four slots are taken. Delete a character first.'); return; }
    try { c = E.migrateCharacter(fixOldIds(c)); E.derive(c); } catch (e) { imFail('The save is damaged and could not be loaded.'); return; }
    if (st.slots.some(function (o) { return o && o.id && o.id === c.id; })) c.id = newId();
    if (!c.id) c.id = newId(); if (!c.created) c.created = Date.now();
    st.slots[free] = c; st.last = free; saveStore();
    selSlot = free; selDiff = bestDiff(c);
    $('importBox').hidden = true; renderTitle(); netStatus(c.name + ' was imported into slot ' + (free + 1) + '.', false);
  }

  var acc = 0, last = performance.now();
  function stepSim(dt) {
    acc += dt;
    var n = 0;
    while (acc >= TICK && n++ < 40) {
      prev.clear();
      Object.keys(S.players).forEach(function (id) { var q = S.players[id]; prev.set(q.id, [q.x, q.y]); });
      S.monsters.forEach(function (m) { prev.set(m.id, [m.x, m.y]); });
      S.projs.forEach(function (pr) { prev.set(pr.id, [pr.x, pr.y]); });
      E.step(S, TICK); acc -= TICK; processEvents();
    }
    if (acc > TICK) acc = 0;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (S && running) {
      if (MODE === 'client') { alpha = Math.min(1, (now - snapAt) / SNAP_MS); if (now - snapAt > 8000) leaveToTitle('Lost the connection to the host. Your character is saved.'); }
      else { if (!paused) stepSim(dt); else acc = 0; alpha = paused ? 1 : acc / TICK; hostTick(now); }
      handleHold(now);
    }
    updateFx(dt);
    render();
    if (S && running) updateHud();
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) writeSave(); });

  // Console debugging: __ashgrave.S is the engine state
  window.__ashgrave = { get S() { return S; }, props: function () { return propMap; }, cmd: cmd, pid: function () { return PID; } };

  function boot(data) {
    document.body.classList.add('at-title');
    if (data && data.store) memStore = data.store;
    renderTitle();
    requestAnimationFrame(frame);
  }
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
    try { window.claude.hot.snapshot(function () { writeSave(); return { store: loadStore() }; }); } catch (e) { }
  }
  var hot = window.claude && window.claude.hot;
  if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
})();
