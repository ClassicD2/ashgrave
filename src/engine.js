// ============================================================
// ASHGRAVE — game engine
// Rules: nothing in this file touches canvas, DOM or Math.random.
//  - All randomness goes through S.rng (seeded), so two machines with the
//    same seed and the same commands get the same result.
//  - The client only talks to the engine via Engine.command(S, pid, cmd).
//  - The engine reports what happened through S.events (sound, fx, log).
// That makes it ready for host-authoritative co-op and for a Godot port.
// ============================================================
var Engine = (function () {
  'use strict';
  var D = (typeof DATA !== 'undefined') ? DATA : require('./data.js');
  var R = D.rules;

  // ---------- Seeded random (mulberry32) ----------
  function rnd(r) {
    r.s = (r.s + 0x6D2B79F5) | 0;
    var t = r.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rint(r, a, b) { return a + Math.floor(rnd(r) * (b - a + 1)); }
  function pick(r, arr) { return arr[Math.floor(rnd(r) * arr.length)]; }
  function wpick(r, arr) {
    var tot = 0, i; for (i = 0; i < arr.length; i++) tot += arr[i].w;
    var x = rnd(r) * tot;
    for (i = 0; i < arr.length; i++) { x -= arr[i].w; if (x < 0) return arr[i]; }
    return arr[arr.length - 1];
  }

  var BASES = {}; D.bases.forEach(function (b) { BASES[b.id] = b; });
  function baseOf(item) { return BASES[item.base]; }

  // ---------- Map ----------
  // 0 = wall, 1 = floor, 2 = stairs down
  // Which kind of level a depth gets: crypts near the top, then catacombs, then caves, and the
  // Abbot's monastery at the bottom. Scaled to each difficulty's length.
  function themeFor(depth, finalDepth) {
    finalDepth = finalDepth || 10;
    if (depth >= finalDepth) return 'monastery';
    // The first three levels are open fields above ground; then down through crypts, catacombs and caves.
    if (depth <= 3) return 'forest';
    var f = (depth - 4) / Math.max(1, finalDepth - 4);
    return f < 1 / 3 ? 'crypt' : f < 2 / 3 ? 'catacombs' : 'caves';
  }
  function genLevel(seed, depth, finalDepth) {
    var theme = themeFor(depth, finalDepth);
    var r = { s: (seed * 7919 + depth * 104729) | 0 };
    var W = theme === 'crypt' || theme === 'monastery' ? 60 : theme === 'forest' ? 66 : 64, H = W, t = new Array(W * H).fill(0), rooms = [], i, x, y;
    function free(x, y, w, h, gap) { return !rooms.some(function (o) { return x < o.x + o.w + gap && x + w + gap > o.x && y < o.y + o.h + gap && y + h + gap > o.y; }); }
    function addRoom(x, y, w, h) { var o = { x: x, y: y, w: w, h: h, cx: x + (w >> 1), cy: y + (h >> 1) }; rooms.push(o); return o; }
    function fillRect(o) { for (var yy = o.y; yy < o.y + o.h; yy++) for (var xx = o.x; xx < o.x + o.w; xx++) t[yy * W + xx] = 1; }
    function placeRooms(n, wmin, wmax, hmin, hmax, gap) {
      for (var k = 0; k < 400 && n > 0; k++) {
        var w = rint(r, wmin, wmax), h = rint(r, hmin, hmax), x = rint(r, 2, W - w - 3), y = rint(r, 2, H - h - 3);
        if (free(x, y, w, h, gap)) { addRoom(x, y, w, h); n--; }
      }
    }
    function set(xx, yy) { if (xx >= 1 && yy >= 1 && xx < W - 1 && yy < H - 1) t[yy * W + xx] = 1; }
    var cw = theme === 'catacombs' ? 1 : 2;
    function carve(cx, cy) { for (var dy = 0; dy < cw; dy++) for (var dx = 0; dx < cw; dx++) set(cx + dx, cy + dy); }
    function corridor(a, b) {
      var x0 = a.cx, y0 = a.cy, x1 = b.cx, y1 = b.cy, cx = x0, cy = y0;
      var horizFirst = rnd(r) < 0.5;
      if (horizFirst) { while (cx !== x1) { carve(cx, cy); cx += Math.sign(x1 - cx); } while (cy !== y1) { carve(cx, cy); cy += Math.sign(y1 - cy); } }
      else { while (cy !== y1) { carve(cx, cy); cy += Math.sign(y1 - cy); } while (cx !== x1) { carve(cx, cy); cx += Math.sign(x1 - cx); } }
      carve(cx, cy);
    }
    // A wandering tunnel for the caves: heads for the target but drifts, 2-3 tiles wide.
    function tunnel(a, b) {
      var cx = a.cx, cy = a.cy, guard = 0;
      while ((cx !== b.cx || cy !== b.cy) && guard++ < 600) {
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (dx === 0 || dy === 0 || rnd(r) < 0.5) set(cx + dx, cy + dy);
        var toX = Math.sign(b.cx - cx), toY = Math.sign(b.cy - cy), q = rnd(r);
        if (q < 0.65) { if (toX && (!toY || rnd(r) < 0.5)) cx += toX; else cy += toY; }
        else if (q < 0.85) { if (toX) cy += rnd(r) < 0.5 ? 1 : -1; else cx += rnd(r) < 0.5 ? 1 : -1; }
        else { if (toX) cx += toX; if (toY) cy += toY; }
        cx = Math.max(2, Math.min(W - 3, cx)); cy = Math.max(2, Math.min(H - 3, cy));
      }
    }
    var hall = null;
    if (theme === 'crypt') { placeRooms(13, 5, 10, 5, 10, 2); rooms.forEach(fillRect); }
    else if (theme === 'catacombs') {
      // Two burial halls among many small niches, joined by narrow passages.
      placeRooms(2, 8, 10, 7, 9, 3); placeRooms(22, 3, 6, 3, 5, 2); rooms.forEach(fillRect);
    } else if (theme === 'caves') {
      // Rough open caverns: jagged blobs with winding tunnels between them.
      for (var k = 0; k < 400 && rooms.length < 10; k++) {
        var rx = rint(r, 3, 6), ry = rint(r, 3, 6), ccx = rint(r, rx + 3, W - rx - 4), ccy = rint(r, ry + 3, H - ry - 4);
        if (!free(ccx - rx, ccy - ry, rx * 2 + 1, ry * 2 + 1, 2)) continue;
        var o = addRoom(ccx - rx, ccy - ry, rx * 2 + 1, ry * 2 + 1); o.cx = ccx; o.cy = ccy;
        for (var yy = o.y; yy < o.y + o.h; yy++) for (var xx = o.x; xx < o.x + o.w; xx++) {
          var ex = (xx - ccx) / (rx + 0.5), ey = (yy - ccy) / (ry + 0.5);
          if (ex * ex + ey * ey <= 1 + (rnd(r) - 0.5) * 0.5) set(xx, yy);
        }
        set(ccx, ccy);
      }
    } else if (theme === 'forest') {
      // Open fields: wide, ragged clearings that run into each other, joined by broad trails.
      for (var k2 = 0; k2 < 500 && rooms.length < 8; k2++) {
        var frx = rint(r, 5, 9), fry = rint(r, 5, 9), fcx = rint(r, frx + 3, W - frx - 4), fcy = rint(r, fry + 3, H - fry - 4);
        if (!free(fcx - frx, fcy - fry, frx * 2 + 1, fry * 2 + 1, -3)) continue;
        var fo = addRoom(fcx - frx, fcy - fry, frx * 2 + 1, fry * 2 + 1); fo.cx = fcx; fo.cy = fcy;
        for (var fy2 = fo.y; fy2 < fo.y + fo.h; fy2++) for (var fx2 = fo.x; fx2 < fo.x + fo.w; fx2++) {
          var fex = (fx2 - fcx) / (frx + 0.5), fey = (fy2 - fcy) / (fry + 0.5);
          if (fex * fex + fey * fey <= 1 + (rnd(r) - 0.5) * 0.6) set(fx2, fy2);
        }
      }
    } else {
      // The monastery: a pillared nave far from the entrance chapel, side chapels around it.
      addRoom(4, H - 12, 7, 7);
      hall = addRoom(W - 24, 4, 19, 15);
      placeRooms(8, 5, 8, 5, 8, 2); rooms.forEach(fillRect);
    }
    // Prim's minimum spanning tree + a few extra loops
    var inTree = [0], edges = [];
    while (inTree.length < rooms.length) {
      var best = null, bd = 1e9;
      for (i = 0; i < inTree.length; i++) for (var j = 0; j < rooms.length; j++) {
        if (inTree.indexOf(j) >= 0) continue;
        var a = rooms[inTree[i]], b = rooms[j], d = Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
        if (d < bd) { bd = d; best = [inTree[i], j]; }
      }
      inTree.push(best[1]); edges.push(best);
    }
    var loops = theme === 'catacombs' ? 5 : theme === 'caves' ? 3 : 2;
    for (i = 0; i < loops && rooms.length > 3; i++) edges.push([rint(r, 0, rooms.length - 1), rint(r, 0, rooms.length - 1)]);
    function trail(a, b) {   // a broad, wandering path between clearings
      var cx = a.cx, cy = a.cy, guard = 0;
      while ((Math.abs(cx - b.cx) > 1 || Math.abs(cy - b.cy) > 1) && guard++ < 600) {
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 2 || rnd(r) < 0.3) set(cx + dx, cy + dy);
        var toX = Math.sign(b.cx - cx), toY = Math.sign(b.cy - cy), q = rnd(r);
        if (q < 0.7) { if (toX && (!toY || rnd(r) < 0.5)) cx += toX; else cy += toY; }
        else if (q < 0.9) { if (toX) cy += rnd(r) < 0.5 ? 1 : -1; else cx += rnd(r) < 0.5 ? 1 : -1; }
        else { if (toX) cx += toX; if (toY) cy += toY; }
        cx = Math.max(3, Math.min(W - 4, cx)); cy = Math.max(3, Math.min(H - 4, cy));
      }
    }
    edges.forEach(function (e) { if (e[0] !== e[1]) (theme === 'caves' ? tunnel : theme === 'forest' ? trail : corridor)(rooms[e[0]], rooms[e[1]]); });
    if (theme === 'forest') {
      // Soften the edges, then drop small thickets and broken walls into the open ground for cover.
      for (var fp = 0; fp < 3; fp++) {
        var fadd = [];
        for (y = 2; y < H - 2; y++) for (x = 2; x < W - 2; x++) {
          if (t[y * W + x]) continue;
          var fnb = 0; for (var foy = -1; foy <= 1; foy++) for (var fox = -1; fox <= 1; fox++) if (t[(y + foy) * W + x + fox]) fnb++;
          if (fnb >= 5) fadd.push(y * W + x);
        }
        fadd.forEach(function (q) { t[q] = 1; });
      }
      var clumps = 0;
      for (var fk = 0; fk < 600 && clumps < 26; fk++) {
        var qx = rint(r, 4, W - 5), qy = rint(r, 4, H - 5), open = true;
        for (var oy2 = -2; oy2 <= 2 && open; oy2++) for (var ox2 = -2; ox2 <= 2; ox2++) if (!t[(qy + oy2) * W + qx + ox2]) { open = false; break; }
        if (!open || rooms.some(function (o) { return Math.abs(o.cx - qx) <= 2 && Math.abs(o.cy - qy) <= 2; })) continue;
        var sz = rint(r, 1, 4), ccx2 = qx, ccy2 = qy;
        for (var si = 0; si < sz; si++) { t[ccy2 * W + ccx2] = 0; if (rnd(r) < 0.5) ccx2 += rnd(r) < 0.5 ? 1 : -1; else ccy2 += rnd(r) < 0.5 ? 1 : -1; }
        clumps++;
      }
    }
    if (theme === 'caves') {
      // Smooth the rock: walls mostly surrounded by floor fall away. Only adds floor, so nothing gets cut off.
      for (var pass = 0; pass < 2; pass++) {
        var add = [];
        for (y = 2; y < H - 2; y++) for (x = 2; x < W - 2; x++) {
          if (t[y * W + x]) continue;
          var nb = 0; for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) if (t[(y + oy) * W + x + ox]) nb++;
          if (nb >= 5) add.push(y * W + x);
        }
        add.forEach(function (q) { t[q] = 1; });
      }
    }
    if (hall) {
      // Columns down the nave, clear around its middle where the Abbot waits.
      for (y = hall.y + 2; y < hall.y + hall.h - 2; y += 3) for (x = hall.x + 2; x < hall.x + hall.w - 2; x += 4)
        if (Math.abs(x - hall.cx) > 2 || Math.abs(y - hall.cy) > 2) t[y * W + x] = 0;
    }
    // Drop any pocket of floor that cannot be reached from the start (rough cave edges can leave some).
    var reach = new Uint8Array(W * H), stack = [rooms[0].cy * W + rooms[0].cx]; reach[stack[0]] = 1;
    while (stack.length) {
      var c0 = stack.pop(), c0x = c0 % W, c0y = (c0 / W) | 0;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) { var nq = (c0y + dd[1]) * W + c0x + dd[0]; if (t[nq] && !reach[nq]) { reach[nq] = 1; stack.push(nq); } });
    }
    for (i = 0; i < W * H; i++) if (t[i] && !reach[i]) t[i] = 0;
    if (theme === 'monastery') {
      // The Burning Deep: pools of lava eat into the rock around the halls (only into rock, so no path is cut).
      var lakes = 0;
      for (var lk = 0; lk < 400 && lakes < 14; lk++) {
        var lx = rint(r, 3, W - 4), ly = rint(r, 3, H - 4);
        if (t[ly * W + lx] !== 0) continue;
        var touches = false;
        for (var oy3 = -1; oy3 <= 1; oy3++) for (var ox3 = -1; ox3 <= 1; ox3++) if (t[(ly + oy3) * W + lx + ox3] === 1) touches = true;
        if (!touches) continue;
        var lr = rint(r, 2, 4);
        for (var yy3 = ly - lr; yy3 <= ly + lr; yy3++) for (var xx3 = lx - lr; xx3 <= lx + lr; xx3++) {
          if (xx3 < 2 || yy3 < 2 || xx3 >= W - 2 || yy3 >= H - 2 || t[yy3 * W + xx3] !== 0) continue;
          var e3 = Math.hypot(xx3 - lx, (yy3 - ly) * 1.1) / (lr + 0.5);
          if (e3 <= 1 + (rnd(r) - 0.5) * 0.4) t[yy3 * W + xx3] = 3;
        }
        lakes++;
      }
      if (hall) {
        // a lava channel across the far end of the nave, behind the Abbot
        for (x = hall.x + 1; x < hall.x + hall.w - 1; x++) t[hall.y * W + x] = 3;
      }
    }
    var start = rooms[0], far = rooms[0], fd = -1;
    rooms.forEach(function (o) { if (!reach[o.cy * W + o.cx]) return; var d = Math.hypot(o.cx - start.cx, o.cy - start.cy); if (d > fd) { fd = d; far = o; } });
    if (hall) far = hall;
    t[far.cy * W + far.cx] = 2;
    return {
      W: W, H: H, t: t, rooms: rooms, depth: depth, theme: theme,
      start: { x: start.cx + 0.5, y: start.cy + 0.5 },
      stairs: { x: far.cx + 0.5, y: far.cy + 0.5 },
      startRoom: 0, stairsRoom: rooms.indexOf(far)
    };
  }

  function tileAt(map, x, y) {
    var tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= map.W || ty >= map.H) return 0;
    return map.t[ty * map.W + tx];
  }
  // Tiles: 0 rock, 1 floor, 2 stairs, 3 lava. Lava cannot be walked on, but you can see and shoot across it.
  function walkable(map, x, y) { var v = tileAt(map, x, y); return v !== 0 && v !== 3; }
  function sightable(map, x, y) { return tileAt(map, x, y) !== 0; }
  function canStand(map, x, y, r) {
    return walkable(map, x - r, y - r) && walkable(map, x + r, y - r) && walkable(map, x - r, y + r) && walkable(map, x + r, y + r);
  }
  function clearLine(map, x0, y0, x1, y1, r) {
    var d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 0.25));
    for (var i = 1; i <= n; i++) {
      var f = i / n, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
      if (r ? !canStand(map, x, y, r) : !sightable(map, x, y)) return false;
    }
    return true;
  }
  function los(map, a, b) { return clearLine(map, a.x, a.y, b.x, b.y, 0); }

  // ---------- A* ----------
  function nearestWalkable(map, x, y, rad) {
    var tx = Math.floor(x), ty = Math.floor(y), best = null, bd = 1e9;
    for (var dy = -rad; dy <= rad; dy++) for (var dx = -rad; dx <= rad; dx++) {
      var xx = tx + dx, yy = ty + dy;
      if (!walkable(map, xx + 0.5, yy + 0.5)) continue;
      var d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { x: xx + 0.5, y: yy + 0.5 }; }
    }
    return best;
  }
  function findPath(map, sx, sy, gx, gy, maxNodes, radius) {
    var W = map.W, H = map.H;
    if (!walkable(map, gx, gy)) { var nw = nearestWalkable(map, gx, gy, 2); if (!nw) return null; gx = nw.x; gy = nw.y; }
    var s = Math.floor(sy) * W + Math.floor(sx), g = Math.floor(gy) * W + Math.floor(gx);
    if (s === g) return [[gx, gy]];
    var N = W * H, gs = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    var heap = [], hf = [];
    function push(n, f) {
      heap.push(n); hf.push(f); var i = heap.length - 1;
      while (i > 0) { var p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; swap(i, p); i = p; }
    }
    function swap(a, b) { var t = heap[a]; heap[a] = heap[b]; heap[b] = t; t = hf[a]; hf[a] = hf[b]; hf[b] = t; }
    function pop() {
      var top = heap[0], lastN = heap.pop(), lastF = hf.pop();
      if (heap.length) {
        heap[0] = lastN; hf[0] = lastF; var i = 0;
        for (;;) { var l = 2 * i + 1, rr = l + 1, m = i;
          if (l < heap.length && hf[l] < hf[m]) m = l;
          if (rr < heap.length && hf[rr] < hf[m]) m = rr;
          if (m === i) break; swap(i, m); i = m; }
      }
      return top;
    }
    var gxI = g % W, gyI = (g / W) | 0;
    function hfun(n) { var dx = Math.abs(n % W - gxI), dy = Math.abs(((n / W) | 0) - gyI); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); }
    gs[s] = 0; push(s, hfun(s));
    var expanded = 0, found = false;
    var DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.length) {
      var cur = pop();
      if (closed[cur]) continue;
      if (cur === g) { found = true; break; }
      closed[cur] = 1;
      if (++expanded > maxNodes) break;
      var cx = cur % W, cy = (cur / W) | 0;
      for (var k = 0; k < 8; k++) {
        var dx = DIRS[k][0], dy = DIRS[k][1], nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var ni = ny * W + nx;
        if (map.t[ni] === 0 || map.t[ni] === 3 || closed[ni]) continue;
        if (dx && dy && (map.t[cy * W + nx] === 0 || map.t[ny * W + cx] === 0 || map.t[cy * W + nx] === 3 || map.t[ny * W + cx] === 3)) continue;
        var ng = gs[cur] + DIRS[k][2];
        if (ng < gs[ni]) { gs[ni] = ng; came[ni] = cur; push(ni, ng + hfun(ni)); }
      }
    }
    if (!found) return null;
    var path = [], n = g;
    while (n !== s && n !== -1) { path.push([n % W + 0.5, ((n / W) | 0) + 0.5]); n = came[n]; }
    path.reverse();
    if (path.length && canStand(map, gx, gy, radius || 0.25)) path[path.length - 1] = [gx, gy];
    return path;
  }

  // ---------- Items ----------
  function genItem(S, ilvl, forceSlot, minRarity) {
    var r = S.rng;
    var slotPool = ['weapon', 'weapon', 'chest', 'helm', 'gloves', 'boots', 'ring', 'amulet'];
    var slot = forceSlot || pick(r, slotPool);
    var wclass = null;
    if (slot === 'weapon') {
      // Lean drops toward the weapons the party can use, but keep some of the other kind.
      var inParty = Object.keys(S.players).map(function (id) { return D.classes[S.players[id].cls || 'archer'].weapon; });
      wclass = inParty.length && rnd(r) < 0.7 ? pick(r, inParty) : pick(r, ['bow', 'melee', 'staff']);
    }
    var cands = D.bases.filter(function (b) { return b.slot === slot && b.ilvl <= ilvl && (!wclass || b.wclass === wclass); });
    cands.sort(function (a, b) { return a.ilvl - b.ilvl; });
    var base = pick(r, cands.slice(-3));
    var x = rnd(r), rarity = x < 0.07 + ilvl * 0.004 ? 2 : (x < 0.36 ? 1 : 0);
    if ((slot === 'ring' || slot === 'amulet') && rarity === 0) rarity = 1;
    if (minRarity && rarity < minRarity) rarity = minRarity;
    var item = { uid: S.nextId++, base: base.id, slot: slot, ilvl: ilvl, rarity: rarity, mods: {}, affixes: [] };
    if (base.dmg) item.dmg = [base.dmg[0], base.dmg[1]];
    if (base.armor) item.armor = rint(r, base.armor[0], base.armor[1]);

    var nPre = 0, nSuf = 0;
    if (rarity === 1) { var c = rnd(r); if (c < 0.4) nPre = 1; else if (c < 0.75) nSuf = 1; else { nPre = 1; nSuf = 1; } }
    if (rarity === 2) { var tot = rint(r, 3, 5); nPre = Math.min(3, rint(r, 1, tot - 1)); nSuf = Math.min(3, tot - nPre); }
    var used = {};
    function roll(kind, n) {
      for (var i = 0; i < n; i++) {
        var pool = D.affixes.filter(function (a) { return a.kind === kind && !used[a.id] && a.slots.indexOf(slot) >= 0 && a.tiers[0].ilvl <= ilvl; });
        if (!pool.length) return;
        var a = pick(r, pool); used[a.id] = 1;
        var tiers = a.tiers.filter(function (t) { return t.ilvl <= ilvl; });
        var ti = tiers.length > 1 && rnd(r) < 0.55 ? tiers.length - 1 : rint(r, 0, tiers.length - 1);
        var tier = tiers[ti];
        Object.keys(tier.mods).forEach(function (k) {
          item.mods[k] = (item.mods[k] || 0) + rint(r, tier.mods[k][0], tier.mods[k][1]);
        });
        item.affixes.push({ id: a.id, kind: kind, tier: a.tiers.indexOf(tier) });
      }
    }
    roll('prefix', nPre); roll('suffix', nSuf);
    // Some slots have no prefixes (amulets) or few suffixes. Fill up from the other kind so a
    // magic item always has at least one affix and a rare at least three.
    var need = rarity === 2 ? 3 : rarity === 1 ? 1 : 0, guard = 0;
    while (item.affixes.length < need && guard++ < 6) {
      var nP = item.affixes.filter(function (a) { return a.kind === 'prefix'; }).length, before = item.affixes.length;
      roll(nP < 3 && rnd(r) < 0.5 ? 'prefix' : 'suffix', 1);
      if (item.affixes.length === before) roll(nP < 3 ? 'prefix' : 'suffix', 1);
      if (item.affixes.length === before) roll('suffix', 1);
      if (item.affixes.length === before) break;
    }
    if (rarity >= 1 && !item.affixes.length) { rarity = 0; item.rarity = 0; }
    if (rarity === 2 && item.affixes.length < 3) { item.rarity = 1; rarity = 1; }
    if (item.mods.lightMin && item.mods.lightMin > item.mods.lightMax) item.mods.lightMax = item.mods.lightMin;
    if (item.mods.darkMin && item.mods.darkMin > item.mods.darkMax) item.mods.darkMax = item.mods.darkMin;
    if (rarity === 2) item.rareName = pick(r, D.rareA) + pick(r, D.rareB);
    return item;
  }

  function uniqueDef(id) { for (var i = 0; i < D.uniques.length; i++) if (D.uniques[i].id === id) return D.uniques[i]; return null; }
  // A unique item: fixed name and base, stats rolled inside its ranges.
  function genUnique(S, ilvl, id) {
    var r = S.rng, u = id ? uniqueDef(id) : pick(r, D.uniques);
    var b = BASES[u.base], it = { uid: S.nextId++, base: b.id, slot: b.slot, ilvl: Math.max(ilvl, D.uniqueRules.minIlvl), rarity: 3, unique: u.id, mods: {}, affixes: [] };
    if (b.dmg) it.dmg = [b.dmg[0], b.dmg[1]];
    if (b.armor) it.armor = rint(r, b.armor[0], b.armor[1]);
    Object.keys(u.mods).forEach(function (k) { var v = u.mods[k]; it.mods[k] = Array.isArray(v) ? rint(r, v[0], v[1]) : v; });
    return it;
  }
  // Every item roll can turn into a unique once item level is high enough.
  function maybeUnique(S, ilvl, chance) { return ilvl >= D.uniqueRules.minIlvl && rnd(S.rng) < chance ? genUnique(S, ilvl) : null; }

  function itemName(item) {
    var b = baseOf(item);
    if (item.rarity === 3) { var ud = uniqueDef(item.unique); return ud ? ud.name : b.name; }
    if (item.rarity === 2) return item.rareName;
    if (item.rarity === 0) return b.name;
    var pre = '', suf = '';
    item.affixes.forEach(function (af) {
      var def = D.affixes.filter(function (a) { return a.id === af.id; })[0], t = def.tiers[af.tier];
      if (af.kind === 'prefix') pre = t.name;
      else suf = t.name;
    });
    return (pre ? pre + ' ' : '') + b.name + (suf ? ' ' + suf : '');
  }

  // ---------- Players ----------
  function newCharacter(name, cls) {
    cls = D.classes[cls] ? cls : 'archer';
    var cd = D.classes[cls];
    var c = {
      version: SAVE_VERSION, progress: freshProgress(), trial: 'locked', ascendancy: null, ascNodes: {}, ascTree: D.ascendancy.treeVersion,
      name: name || cd.name, cls: cls, level: 1, xp: 0, pts: 0,
      base: JSON.parse(JSON.stringify(cd.base)), gold: 0, potions: { hp: 3, mp: 1 },
      inv: new Array(R.invSize).fill(null),
      eq: { weapon: null, helm: null, chest: null, gloves: null, boots: null, ring: null, ring2: null, amulet: null },
      depth: 1, maxDepth: 1, uidSeed: 1
    };
    var uid = -1;
    Object.keys(cd.start).forEach(function (slot) {
      var b = BASES[cd.start[slot]], it = { uid: uid--, base: b.id, slot: slot, ilvl: 1, rarity: 0, mods: {}, affixes: [] };
      if (b.dmg) it.dmg = [b.dmg[0], b.dmg[1]];
      if (b.armor) it.armor = Math.round((b.armor[0] + b.armor[1]) / 2);
      c.eq[slot] = it;
    });
    return c;
  }
  function classOf(p) { return D.classes[p.cls] || D.classes.archer; }
  function canWield(p, item) { var b = baseOf(item); return !b.wclass || b.wclass === classOf(p).weapon; }
  // ---------- Save format ----------
  // Bump SAVE_VERSION when the character format changes, and teach migrateCharacter the step.
  var SAVE_VERSION = 2;
  var PERSIST = ['id', 'created', 'version', 'name', 'cls', 'level', 'xp', 'pts', 'base', 'gold', 'potions', 'inv', 'eq',
    'depth', 'maxDepth', 'progress', 'trial', 'ascendancy', 'ascNodes', 'ascTree'];
  function characterOf(p) {
    var c = {}; PERSIST.forEach(function (k) { if (p[k] !== undefined) c[k] = JSON.parse(JSON.stringify(p[k])); }); return c;
  }
  function freshProgress() {
    var pr = {};
    Object.keys(D.difficulties).forEach(function (k) { pr[k] = { depth: 1, maxDepth: 1, done: false }; });
    return pr;
  }
  // Brings any older character up to the current format. Safe to run more than once.
  function migrateCharacter(c) {
    if (!c.eq) c.eq = {};
    D.slots.forEach(function (s) { if (c.eq[s] === undefined) c.eq[s] = null; });
    if (!c.inv) c.inv = new Array(R.invSize).fill(null);
    while (c.inv.length < R.invSize) c.inv.push(null);
    if (!c.potions) c.potions = { hp: 3, mp: 1 };
    if (!c.progress) {
      c.progress = freshProgress();
      var n = D.difficulties.normal.finalDepth;
      c.progress.normal.depth = Math.min(c.depth || 1, n);
      c.progress.normal.maxDepth = Math.min(Math.max(c.maxDepth || 1, c.depth || 1), n);
    }
    Object.keys(D.difficulties).forEach(function (k) { if (!c.progress[k]) c.progress[k] = { depth: 1, maxDepth: 1, done: false }; });
    if (!c.trial) c.trial = 'locked';
    // Fire damage became light damage (same numbers, so old items keep their value).
    var fixItem = function (it) {
      if (!it || !it.mods) return;
      if (it.mods.fireMin !== undefined || it.mods.fireMax !== undefined) {
        it.mods.lightMin = (it.mods.lightMin || 0) + (it.mods.fireMin || 0); it.mods.lightMax = (it.mods.lightMax || 0) + (it.mods.fireMax || 0);
        delete it.mods.fireMin; delete it.mods.fireMax;
      }
      (it.affixes || []).forEach(function (af) { if (af.id === 'fire') af.id = 'light'; });
    };
    c.inv.forEach(fixItem); D.slots.forEach(function (s) { fixItem(c.eq[s]); });
    if (c.ascendancy === undefined || (c.ascendancy && !D.ascendancies[c.ascendancy])) c.ascendancy = null;
    // The tree changed from one-time gifts (a list) to ranked nodes (id -> rank); old gifts are refunded.
    if (!c.ascNodes || Array.isArray(c.ascNodes)) c.ascNodes = {};
    // Ranks were reworked (tree version 2): spent points are refunded so the tree can be rebuilt for free.
    if ((c.ascTree || 1) < D.ascendancy.treeVersion) { c.ascNodes = {}; c.ascTree = D.ascendancy.treeVersion; }
    c.version = SAVE_VERSION;
    return c;
  }
  function isUnlocked(c, diff) {
    var d = D.difficulties[diff]; if (!d) return false;
    if (!d.requires) return true;
    if (d.requires === 'trial') return c.trial === 'done';
    return !!(c.progress && c.progress[d.requires] && c.progress[d.requires].done);
  }
  // ---------- Ascendancy ----------
  function ascOf(c) { return c && c.ascendancy ? D.ascendancies[c.ascendancy] || null : null; }
  function rank(p, id) {
    var r = (p && p.ascNodes && p.ascNodes[id]) || 0;
    if (p && p.eq && p.ascendancy) {
      var a = D.ascendancies[p.ascendancy];
      if (a && a.nodes.some(function (n) { return n.id === id; }))
        D.slots.forEach(function (s) { var it = p.eq[s]; if (it && it.mods['node_' + id]) r += it.mods['node_' + id]; });
    }
    return r;
  }
  function hasNode(p, id) { return rank(p, id) > 0; }
  function nodeDef(id) {
    var out = null;
    Object.keys(D.ascendancies).forEach(function (k) { D.ascendancies[k].nodes.forEach(function (n) { if (n.id === id) out = n; }); });
    return out;
  }
  // rank x per: the node's current total (percent, seconds or stacks, as its text says)
  function nodeVal(p, id) { var n = nodeDef(id); return n ? rank(p, id) * n.per : 0; }
  function coreOf(p) { var a = ascOf(p); return a ? a.core : {}; }
  function skillOf(p) { var a = ascOf(p); return a && a.skill ? a.skill : classOf(p).skill; }
  function spentPoints(c) { var n = 0, t = c.ascNodes || {}; for (var k in t) n += t[k]; return n; }
  // One point per level from firstLevel on (level 10 = 1 point), but only once the Trial is passed.
  function ascPoints(c) { return c.trial === 'done' ? Math.max(0, (c.level || 1) - D.ascendancy.firstLevel + 1) : 0; }
  function ascUnspent(c) { return c.ascendancy ? ascPoints(c) - spentPoints(c) : 0; }
  // These work on a saved character at the altar, and on a player in a game (the 'node' command).
  function chooseAscendancy(c, id) {
    var a = D.ascendancies[id];
    if (!a) return 'No such path.';
    if (c.trial !== 'done') return 'Only those who passed the Trial of Ash may kneel here.';
    if (c.ascendancy) return 'You have already chosen a path.';
    if (a.cls !== c.cls) return 'That path is not for your kind.';
    c.ascendancy = id; c.ascNodes = {};
    return null;
  }
  function takeNode(c, nid) {
    var a = ascOf(c);
    if (!a) return 'Choose a path first.';
    var n = a.nodes.filter(function (x) { return x.id === nid; })[0];
    if (!n) return 'That is not part of your path.';
    if (!c.ascNodes || Array.isArray(c.ascNodes)) c.ascNodes = {};
    var r = c.ascNodes[nid] || 0;
    if (r >= n.max) return n.name + ' is already at its highest rank.';
    if (n.req && spentPoints(c) < n.req) return n.name + ' needs ' + n.req + ' points spent in ' + a.name + ' first (you have ' + spentPoints(c) + ').';
    if (ascUnspent(c) <= 0) return 'No points left. You get one each level.';
    c.ascNodes[nid] = r + 1;
    return null;
  }
  function renounceCost(c) { return spentPoints(c) ? D.ascendancy.renounceCost : 0; }
  function renounce(c) {
    if (!c.ascendancy) return 'You have no path to renounce.';
    var cost = renounceCost(c);
    if ((c.gold || 0) < cost) return 'Renouncing costs ' + cost + ' gold.';
    c.gold -= cost; c.ascendancy = null; c.ascNodes = {};
    return null;
  }

  function xpToNext(l) { return Math.floor(80 * Math.pow(l, 1.55)); }

  function derive(p) {
    var m = {};
    D.slots.forEach(function (s) {
      var it = p.eq[s]; if (!it) return;
      Object.keys(it.mods).forEach(function (k) { m[k] = (m[k] || 0) + it.mods[k]; });
    });
    var cd = classOf(p);
    var str = (p.base.str || 0) + (m.str || 0), dex = (p.base.dex || 0) + (m.dex || 0), vit = p.base.vit + (m.vit || 0), ene = p.base.ene + (m.ene || 0);
    var w = p.eq.weapon, wb = w ? baseOf(w) : null;
    if (wb && wb.wclass !== cd.weapon) { w = null; wb = null; }
    var primary = cd.primary === 'str' ? str : cd.primary === 'ene' ? ene : dex;
    var mult = 1 + (m.dmgPct || 0) / 100 + primary / 100;
    var armor = 0;
    D.slots.forEach(function (s) { var it = p.eq[s]; if (it && it.armor) armor += it.armor; });
    var asc = ascOf(p), core = asc ? asc.core : {};
    var lightMul = asc && asc.side === 'light' ? 1 + D.ascendancy.sideBonus : 1, darkMul = asc && asc.side === 'dark' ? 1 + D.ascendancy.sideBonus : 1;
    armor = Math.round(armor * (1 + ((m.armorPct || 0) + nodeVal(p, 'hallowed_plate')) / 100));
    return {
      asc: p.ascendancy || null,
      str: str, dex: dex, vit: vit, ene: ene, melee: cd.weapon === 'melee', caster: cd.weapon === 'staff',
      dmin: Math.max(1, Math.round((w ? w.dmg[0] : 1) * mult)),
      dmax: Math.max(2, Math.round((w ? w.dmg[1] : 2) * mult)),
      lmin: Math.round((m.lightMin || 0) * lightMul), lmax: Math.round((m.lightMax || 0) * lightMul),
      dkmin: Math.round((m.darkMin || 0) * darkMul), dkmax: Math.round((m.darkMax || 0) * darkMul),
      lightMul: lightMul, darkMul: darkMul,
      aps: (wb ? wb.aps : 1.1) * (1 + (m.ias || 0) / 100),
      armor: armor,
      maxHp: Math.round(cd.life.base + vit * cd.life.perVit + p.level * cd.life.perLevel + (m.life || 0)),
      maxMana: Math.round(cd.mana.base + ene * cd.mana.perEne + p.level * cd.mana.perLevel + (m.mana || 0)),
      leech: Math.min(R.leechCap, m.leech || 0),
      leechCap: R.leechCap,
      block: (nodeVal(p, 'bulwark') + (m.block || 0)) / 100,
      dodge: (nodeVal(p, 'sun_evasion') + nodeVal(p, 'night_evasion') + (m.dodge || 0)) / 100,
      dr: (m.dr || 0) / 100, pierce: m.pierce || 0, multiArrows: m.multiArrows || 0, rainDur: m.rainDur || 0,
      zealDur: m.zealDur || 0, ripPct: m.ripPct || 0, chainPct: m.chainPct || 0, cleaveArea: m.cleaveArea || 0, rendMax: m.rendMax || 0,
      darkDur: m.darkFast ? 2 : R.darkDuration, darkKillMana: m.darkKillMana || 0, hitHeal: (m.hitHeal || 0) / 100, noSlow: !!m.noSlow,
      leechRaw: m.leech || 0,
      speed: 4.2 * (1 + (m.run || 0) / 100),
      light: 6 + (m.light || 0) + (core.light || 0),
      aggro: (core.aggro || 1) * (1 - (m.stealth || 0) / 100),
      goldFind: m.gold || 0,
      regen: m.regen || 0,
      manaRegen: cd.manaRegen ? Math.round(cd.mana.base + ene * cd.mana.perEne + p.level * cd.mana.perLevel + (m.mana || 0)) * (cd.manaRegen.pct + ene * cd.manaRegen.perEne) : 0.8 + ene * 0.06,
      range: cd.weapon === 'melee' ? (cd.reach || 0.75) : cd.weapon === 'staff' ? R.staffRange : R.bowRange
    };
  }
  function refresh(p) {
    var hpF = p.st ? p.hp / p.st.maxHp : 1, mpF = p.st ? p.mana / p.st.maxMana : 1;
    p.st = derive(p);
    p.hp = Math.min(p.st.maxHp, Math.max(1, Math.round(p.st.maxHp * hpF)));
    p.mana = Math.min(p.st.maxMana, p.st.maxMana * mpF);
    p.ver++;
  }
  function damageReduction(armor, mlvl) { return Math.min(0.8, armor / (armor + 20 + 10 * mlvl)); }

  // ---------- Simulation ----------
  function createSim(seed, depth, difficulty, opts) {
    opts = opts || {};
    difficulty = D.difficulties[difficulty] ? difficulty : 'normal';
    depth = Math.max(1, Math.min(depth || 1, D.difficulties[difficulty].finalDepth));
    var S = {
      difficulty: difficulty,
      seed: seed, depth: depth, rng: { s: seed ^ 0x5bd1e995 }, tick: 0, time: 0, nextId: 1000,
      players: {}, monsters: [], projs: [], ground: [], npcs: [], events: [], queue: [], map: null, merchantNext: null, bossNext: null, seal: null
    };
    if (opts.trial) { S.trial = true; loadTrial(S); } else loadLevel(S, depth);
    return S;
  }

  // ---------- The Trial ----------
  // A straight run of rooms: antechamber, three chambers, the sanctum. A gate (two wall tiles
  // across the corridor) closes each chamber's exit until its mini boss falls.
  function genTrial(seed) {
    var r = { s: (seed * 31337 + 777) | 0 };
    var widths = [7, 11, 11, 11, 15], heights = [7, 11, 11, 11, 15], gap = 5;
    var W = 2 + widths.reduce(function (a, b) { return a + b; }, 0) + gap * (widths.length - 1) + 2, H = 22, CY = 11;
    var t = new Array(W * H).fill(0), rooms = [], x = 2, i, yy, xx;
    for (i = 0; i < widths.length; i++) {
      var w = widths[i], h = heights[i], ry = CY - (h >> 1);
      rooms.push({ x: x, y: ry, w: w, h: h, cx: x + (w >> 1), cy: CY });
      for (yy = ry; yy < ry + h; yy++) for (xx = x; xx < x + w; xx++) t[yy * W + xx] = 1;
      x += w + gap;
    }
    var gates = [];
    for (i = 0; i < rooms.length - 1; i++) {
      var a = rooms[i], gx0 = a.x + a.w, gx1 = rooms[i + 1].x;
      for (xx = gx0; xx < gx1; xx++) for (yy = CY - 1; yy <= CY; yy++) t[yy * W + xx] = 1;
      if (i >= 1) {
        // Chambers 1-3 lock their exit; the antechamber stays open.
        var gx = gx0 + (gap >> 1);
        gates.push({ tiles: [(CY - 1) * W + gx, CY * W + gx], open: false, room: i });
      }
    }
    // A few pillars break up the bigger rooms.
    for (i = 1; i < rooms.length; i++) {
      var o = rooms[i];
      [[-3, -3], [3, -3], [-3, 3], [3, 3]].forEach(function (d) {
        if (rnd(r) < (i === rooms.length - 1 ? 1 : 0.6)) { var px = o.cx + d[0], py = o.cy + d[1]; t[py * W + px] = 0; }
      });
    }
    var map = { W: W, H: H, t: t, rooms: rooms, depth: 0, trial: true, gates: gates,
      start: { x: rooms[0].cx + 0.5, y: rooms[0].cy + 0.5 }, stairs: { x: rooms[4].cx + 0.5, y: rooms[4].cy + 0.5 },
      startRoom: 0, stairsRoom: 4, final: true };
    applyGates(map);
    return map;
  }
  function applyGates(map) {
    (map.gates || []).forEach(function (g) { g.tiles.forEach(function (i) { map.t[i] = g.open ? 1 : 0; }); });
  }
  function loadTrial(S) {
    var T = D.trial, r = S.rng;
    S.map = genTrial(S.seed);
    S.monsters = []; S.projs = []; S.ground = []; S.npcs = []; S.hazards = []; S.zones = []; S.seal = null; S.gateBoss = {};
    var types = T.chamberTypes.slice();
    for (var sh = types.length - 1; sh > 0; sh--) { var sj = Math.floor(rnd(r) * (sh + 1)), tmp = types[sh]; types[sh] = types[sj]; types[sj] = tmp; }
    T.chambers.forEach(function (ch, i) {
      var room = S.map.rooms[i + 1], keep = S.depth;
      S.depth = ch.depth;
      var boss = makeMini(S, room.cx + 0.5 + (rnd(r) - 0.5) * 2, room.cy + 0.5 + (rnd(r) - 0.5) * 2, ch.traits, ch.minions, types[i % types.length]);
      S.depth = keep;
      S.gateBoss[boss.id] = i;
    });
    var sr = S.map.rooms[4], keep2 = S.depth;
    S.depth = T.judgeDepth;
    var j = addMonster(S, 'judge', sr.cx + 0.5, sr.cy + 0.5, false);
    S.depth = keep2;
    j.boss = 'trial'; j.name = D.monsters.judge.name; j.traits = D.monsters.judge.abilities.slice(); j.scale = T.judge.scale;
    j.judgement = 3; j.step = 5; j.cast = null; j.state = 'idle'; j.noLeech = true;
    S.map.depth = S.depth;
    var i = 0; Object.keys(S.players).forEach(function (id) { placeAtStart(S, S.players[id], i++); });
    emit(S, { t: 'trialStart', name: T.name });
  }
  function openGate(S, gi) {
    var g = S.map.gates[gi]; if (!g || g.open) return;
    g.open = true; applyGates(S.map);
    var gh = D.trial.gateHeal || 0;
    if (gh) for (var id in S.players) { var q = S.players[id]; if (!q.dead) { q.hp = Math.min(q.st.maxHp, q.hp + q.st.maxHp * gh); q.mana = Math.min(q.st.maxMana, q.mana + q.st.maxMana * gh); } }
    emit(S, { t: 'gateOpen', index: gi, x: (g.tiles[0] % S.map.W) + 0.5, y: Math.floor(g.tiles[1] / S.map.W) });
  }
  function judgeAI(S, m, p, d, dt) {
    var J = D.trial.judge, def = D.monsters.judge, seen = los(S.map, m, p);
    m.judgement -= dt; m.step -= dt;
    if (m.atk > 0) {
      m.atk -= dt; m.face = Math.atan2(p.y - m.y, p.x - m.x);
      if (m.atk > 0) return;
      if (m.cast === 'judgement') {
        var J2 = J.judgement;
        for (var i = 0; i < J2.count; i++) {
          var hx = p.x, hy = p.y;
          if (i > 0) { var a = rnd(S.rng) * 6.283, rr = 0.9 + rnd(S.rng) * (J2.spread - 0.9); hx += Math.cos(a) * rr; hy += Math.sin(a) * rr; }
          if (!walkable(S.map, hx, hy)) { hx = p.x; hy = p.y; }
          S.hazards.push({ id: S.nextId++, x: hx, y: hy, r: J2.radius, t: J2.fuse, fuse: J2.fuse, dmg: rint(S.rng, J2.dmg[0], J2.dmg[1]) * m.dmgMul, lvl: m.lvl });
        }
      } else if (m.cast === 'step') {
        // Reappear right beside the player and strike at once.
        for (var k = 0; k < 10; k++) {
          var a2 = rnd(S.rng) * 6.283, tx = p.x + Math.cos(a2) * 1.15, ty = p.y + Math.sin(a2) * 1.15;
          if (canStand(S.map, tx, ty, m.r)) { emit(S, { t: 'blink', x: m.x, y: m.y, x2: tx, y2: ty }); m.x = tx; m.y = ty; break; }
        }
        m.cast = 'melee'; m.atk = def.atkTime; m.cd = def.atkCd; m.path = null;
        return;
      } else if (d <= def.range + m.r + p.r + 0.3) hurtPlayer(S, p, rint(S.rng, def.dmg[0], def.dmg[1]) * m.dmgMul, m.lvl, m);
      m.cast = null;
      return;
    }
    if (m.judgement <= 0 && seen && d < 11) { m.cast = 'judgement'; m.atk = J.judgement.cast; m.judgement = J.judgement.every; emit(S, { t: 'bossCast', id: m.id, name: 'Judgement', x: m.x, y: m.y }); return; }
    if (m.step <= 0 && d > 2.2 && d < 12) { m.cast = 'step'; m.atk = J.step.cast; m.step = J.step.every; emit(S, { t: 'bossCast', id: m.id, name: 'Shadow Step', x: m.x, y: m.y }); return; }
    if (d <= def.range + m.r + p.r && m.cd <= 0) { m.cast = 'melee'; m.atk = def.atkTime; m.cd = def.atkCd; return; }
    if (d > def.range + m.r + p.r - 0.05) chase(S, m, p, dt, seen);
  }
  function updateHazards(S, dt) {
    if (!S.hazards || !S.hazards.length) return;
    for (var i = S.hazards.length - 1; i >= 0; i--) {
      var h = S.hazards[i]; h.t -= dt;
      if (h.t > 0) continue;
      for (var id in S.players) { var p = S.players[id]; if (!p.dead && Math.hypot(p.x - h.x, p.y - h.y) < h.r + p.r * 0.5) hurtPlayer(S, p, h.dmg, h.lvl, null); }
      emit(S, { t: 'hazardBoom', x: h.x, y: h.y, r: h.r, kind: h.kind });
      S.hazards.splice(i, 1);
    }
  }
  function completeTrial(S, x, y) {
    S.trialDone = true;
    for (var id in S.players) {
      var q = S.players[id];
      q.trial = 'done';
      if (q.trialBelt) { q.potions = q.trialBelt; q.trialBelt = null; }
      q.ver++;
    }
    S.hazards = [];
    var kx = x, ky = y;
    for (var k = 0; k < 12; k++) { var a = k * 0.52, tx = x + Math.cos(a) * 1.4, ty = y + Math.sin(a) * 1.4; if (canStand(S.map, tx, ty, 0.4)) { kx = tx; ky = ty; break; } }
    S.npcs.push({ id: S.nextId++, kind: 'keeper', name: D.keeper.name, x: kx, y: ky, face: Math.atan2(y - ky, x - kx) });
    emit(S, { t: 'trialDone', name: D.trial.name, x: x, y: y });
  }
  function emit(S, e) { S.events.push(e); }

  function loadLevel(S, depth) {
    S.depth = depth;
    S.map = genLevel(S.seed, depth, D.difficulties[S.difficulty].finalDepth);
    var DF = D.difficulties[S.difficulty];
    if (depth >= DF.finalDepth) applyFinal(S.map);
    S.monsters = []; S.projs = []; S.ground = []; S.npcs = []; S.zones = []; S.hazards = [];
    spawnMonsters(S);
    S.seal = null;
    var B = D.bosses;
    if (S.bossNext === null) S.bossNext = depth + rint(S.rng, B.gap[0] - 1, B.gap[1] - 1);
    if (depth === DF.finalDepth) { placeBoss(S, true); S.bossNext = depth + rint(S.rng, B.gap[0], B.gap[1]); }
    else if (depth >= S.bossNext) { placeBoss(S, false); S.bossNext = depth + rint(S.rng, B.gap[0], B.gap[1]); }
    if (S.merchantNext === null || depth >= S.merchantNext) placeMerchant(S);
    S.ossuary = null;
    if (depth === D.bosses.warden.depth && depth < DF.finalDepth) placeWarden(S);
    var i = 0;
    Object.keys(S.players).forEach(function (id) {
      var q = S.players[id];
      if (q.dead) { q.dead = false; q.respawn = 0; q.hp = q.st.maxHp; q.mana = q.st.maxMana; emit(S, { t: 'respawn', pid: id }); }
      q.chan = null; placeAtStart(S, q, i++);
    });
    emit(S, { t: 'level', depth: depth });
  }
  // ---------- Bosses ----------
  // The boss takes over the stairs room and seals the stairs until it dies.
  function placeBoss(S, isTrue) {
    var map = S.map, r = S.rng, B = D.bosses, room = map.rooms[map.stairsRoom];
    S.monsters = S.monsters.filter(function (m) { return !(m.x > room.x - 1 && m.x < room.x + room.w + 1 && m.y > room.y - 1 && m.y < room.y + room.h + 1); });
    function spotNear(cx, cy, rad) {
      for (var k = 0; k < 20; k++) { var x = cx + (rnd(r) - 0.5) * 2 * rad, y = cy + (rnd(r) - 0.5) * 2 * rad; if (canStand(map, x, y, 0.45)) return [x, y]; }
      return [cx, cy];
    }
    var c = spotNear(map.stairs.x, map.stairs.y, 1.6), boss;
    if (isTrue) {
      boss = addMonster(S, 'abbot', c[0], c[1], false);
      boss.boss = 'true'; boss.name = D.monsters.abbot.name; boss.traits = D.monsters.abbot.abilities.slice();
      boss.scale = B.abbot.scale; boss.volley = 2; boss.curse = 6; boss.cast = null;
      B.abbot.escorts.forEach(function (e) { for (var i = 0; i < e[1]; i++) { var q = spotNear(c[0], c[1], 2.5); addMonster(S, e[0], q[0], q[1], false); } });
    } else boss = makeMini(S, c[0], c[1], S.depth >= B.mini.thirdTraitDepth ? 3 : 2, null);
    S.seal = boss.id;
    emit(S, { t: 'bossAppear', name: boss.name, isTrue: isTrue, traits: boss.traits });
  }
  // The Gravewarden takes the largest room that is neither start nor stairs, as far from the start as possible.
  function placeWarden(S) {
    var map = S.map, W = D.bosses.warden, best = -1, bs = -1;
    map.rooms.forEach(function (rm, i) {
      if (i === map.startRoom || i === map.stairsRoom) return;
      var cx = rm.x + rm.w / 2, cy = rm.y + rm.h / 2, sc = rm.w * rm.h + Math.hypot(cx - map.start.x, cy - map.start.y) * 2;
      if (rm.w >= 5 && rm.h >= 5 && sc > bs) { bs = sc; best = i; }
    });
    if (best < 0) return;
    var rm = map.rooms[best], cx = rm.x + rm.w / 2, cy = rm.y + rm.h / 2;
    S.monsters = S.monsters.filter(function (m) { return !(m.x > rm.x - 1 && m.x < rm.x + rm.w + 1 && m.y > rm.y - 1 && m.y < rm.y + rm.h + 1); });
    S.npcs = S.npcs.filter(function (n) { return !(n.x > rm.x - 1 && n.x < rm.x + rm.w + 1 && n.y > rm.y - 1 && n.y < rm.y + rm.h + 1); });
    var b = addMonster(S, 'gravewarden', cx, cy, false);
    b.boss = 'warden'; b.name = D.monsters.gravewarden.name; b.traits = D.monsters.gravewarden.abilities.slice();
    b.scale = W.scale; b.spikes = 3; b.raised = 0; b.cast = null; b.home = { x: cx, y: cy };
    S.ossuary = { x: rm.x, y: rm.y, w: rm.w, h: rm.h, cx: cx, cy: cy, boss: b.id };
    emit(S, { t: 'ossuary', name: b.name });
  }
  function wardenAI(S, m, p, d, dt) {
    var W = D.bosses.warden, def = D.monsters.gravewarden, seen = los(S.map, m, p);
    m.spikes -= dt;
    // Raise the Dead at each life threshold, once each.
    if (m.raised < W.raise.at.length && m.hp < m.max * W.raise.at[m.raised]) {
      m.raised++;
      emit(S, { t: 'bossCast', id: m.id, name: 'Raise the Dead', x: m.x, y: m.y });
      for (var k = 0, n = 0; k < 30 && n < W.raise.count; k++) {
        var a = rnd(S.rng) * 6.283, rr = 1.2 + rnd(S.rng) * 1.3, x = m.x + Math.cos(a) * rr, y = m.y + Math.sin(a) * rr;
        if (!canStand(S.map, x, y, 0.35)) continue;
        var s = addMonster(S, 'bonewalker', x, y, false); s.state = 'hunt'; s.xp = 0; n++;
        emit(S, { t: 'raise', x: x, y: y });
      }
    }
    if (m.atk > 0) {
      m.atk -= dt; m.face = Math.atan2(p.y - m.y, p.x - m.x);
      if (m.atk > 0) return;
      if (m.cast === 'spikes') {
        var SP = W.spikes, a0 = Math.atan2(p.y - m.y, p.x - m.x);
        for (var i = 0; i < SP.count; i++) {
          var hx = m.x + Math.cos(a0) * SP.step * (i + 1), hy = m.y + Math.sin(a0) * SP.step * (i + 1);
          if (!walkable(S.map, hx, hy)) break;
          S.hazards.push({ id: S.nextId++, kind: 'bone', x: hx, y: hy, r: SP.radius, t: SP.fuse + i * SP.stagger, fuse: SP.fuse + i * SP.stagger, dmg: rint(S.rng, SP.dmg[0], SP.dmg[1]) * m.dmgMul, lvl: m.lvl });
        }
      } else if (d <= def.range + m.r + p.r + 0.3) hurtPlayer(S, p, rint(S.rng, def.dmg[0], def.dmg[1]) * m.dmgMul, m.lvl, m);
      m.cast = null;
      return;
    }
    if (m.spikes <= 0 && seen && d < 6) { m.cast = 'spikes'; m.atk = W.spikes.cast; m.spikes = W.spikes.every; emit(S, { t: 'bossCast', id: m.id, name: 'Bone Spikes', x: m.x, y: m.y }); return; }
    if (d <= def.range + m.r + p.r && m.cd <= 0) { m.cast = 'melee'; m.atk = def.atkTime; m.cd = def.atkCd; return; }
    if (d > def.range + m.r + p.r - 0.05) chase(S, m, p, dt, seen);
  }
  function makeMini(S, cx, cy, nTraits, nMinions, forceType) {
    var r = S.rng, M = D.bosses.mini, map = S.map, type = forceType || pick(r, ['gnawer', 'bonewalker', 'ashpriest']);
    function spotNear(x0, y0, rad) {
      for (var k = 0; k < 20; k++) { var x = x0 + (rnd(r) - 0.5) * 2 * rad, y = y0 + (rnd(r) - 0.5) * 2 * rad; if (canStand(map, x, y, 0.45)) return [x, y]; }
      return [x0, y0];
    }
    var c = spotNear(cx, cy, 0.5), boss = addMonster(S, type, c[0], c[1], false);
    boss.boss = 'mini'; boss.name = pick(r, M.names[type]); boss.scale = M.scale;
    // Same life for every mini boss type: scale from a shared base, not the monster's own.
    boss.hp = boss.max = Math.round(boss.max / D.monsters[type].hp * M.baseHp * M.hpMul * (S.trial ? D.trial.miniHp : 1)); boss.dmgMul *= M.dmgMul; boss.xp = Math.round(boss.xp * M.xpMul);
    boss.r = Math.min(0.45, boss.r * 1.4); boss.lvl += 3;
    var pool = M.traits.slice(); boss.traits = [];
    for (var t = 0; t < nTraits && pool.length; t++) { var tr = pool.splice(Math.floor(rnd(r) * pool.length), 1)[0]; boss.traits.push(tr); }
    boss.traits.forEach(function (tr) {
      if (tr === 'Swift') { boss.speed *= 1.35; boss.cdMul = 0.75; }
      else if (tr === 'Stoneskin') boss.dr = 0.35;
      else if (tr === 'Burning Aura') boss.aura = 2 + S.depth;
      else if (tr === 'Vampiric') boss.vamp = 0.5;
      else if (tr === 'Bloodless') boss.noLeech = true;
      else if (tr === 'Frenzied') boss.frenzy = true;
    });
    var n = nMinions != null ? nMinions : rint(r, M.minions[0], M.minions[1]);
    for (var i = 0; i < n; i++) { var q = spotNear(c[0], c[1], 2.5); addMonster(S, type, q[0], q[1], false); }
    return boss;
  }
  function abbotAI(S, m, p, d, dt) {
    var A = D.bosses.abbot, def = D.monsters.abbot, seen = los(S.map, m, p);
    m.volley -= dt; m.curse -= dt;
    if (m.atk > 0) {
      m.atk -= dt; m.face = Math.atan2(p.y - m.y, p.x - m.x);
      if (m.atk > 0) return;
      if (m.cast === 'volley') {
        var a0 = Math.atan2(p.y - m.y, p.x - m.x), half = (A.volley.bolts - 1) / 2;
        for (var i = 0; i < A.volley.bolts; i++) {
          var a = a0 + (i - half) * A.volley.spread;
          S.projs.push({ id: S.nextId++, kind: 'bolt', big: true, from: 'm', owner: m.id, x: m.x + Math.cos(a) * 0.5, y: m.y + Math.sin(a) * 0.5,
            vx: Math.cos(a) * def.boltSpeed, vy: Math.sin(a) * def.boltSpeed, life: 2.6, dmg: rint(S.rng, A.volley.dmg[0], A.volley.dmg[1]) * m.dmgMul, lvl: m.lvl });
        }
        emit(S, { t: 'cast', x: m.x, y: m.y });
      } else if (m.cast === 'curse') {
        for (var id in S.players) {
          var q = S.players[id];
          if (q.dead || Math.hypot(q.x - m.x, q.y - m.y) > A.curse.range || !los(S.map, m, q)) continue;
          if (!q.st.noSlow) { q.slowT = A.curse.duration; q.ver++; }
          emit(S, { t: 'curse', pid: id, x: q.x, y: q.y, dur: A.curse.duration });
        }
      } else if (d <= def.range + m.r + p.r + 0.3) hurtPlayer(S, p, rint(S.rng, def.dmg[0], def.dmg[1]) * m.dmgMul, m.lvl, m);
      m.cast = null;
      return;
    }
    if (m.curse <= 0 && seen && d < A.curse.range) { m.cast = 'curse'; m.atk = A.curse.cast; m.curse = A.curse.every; emit(S, { t: 'bossCast', id: m.id, name: 'Withering Curse', x: m.x, y: m.y }); return; }
    if (m.volley <= 0 && seen && d < 10) { m.cast = 'volley'; m.atk = A.volley.cast; m.volley = A.volley.every; emit(S, { t: 'bossCast', id: m.id, name: 'Fireball Volley', x: m.x, y: m.y }); return; }
    if (d <= def.range + m.r + p.r && m.cd <= 0) { m.cast = 'melee'; m.atk = def.atkTime; m.cd = def.atkCd; return; }
    if (d > def.range + m.r + p.r - 0.05) chase(S, m, p, dt, seen);
  }
  function atkCd(p) {
    var aps = p.st.aps * ((p.slowT || 0) > 0 ? 1 - D.bosses.abbot.curse.slow : 1);
    if (hasNode(p, 'rage') && p.hp < p.st.maxHp * 0.5) aps *= 1 + nodeVal(p, 'rage') / 100;
    if ((p.zeal || 0) > 0) aps *= 1 + (coreOf(p).zeal ? coreOf(p).zeal.ias : 0) + nodeVal(p, 'fervor') / 100;
    return 1 / aps;
  }

  // The peddler camps in a random room (not start, not stairs) and clears it of monsters.
  function placeMerchant(S) {
    var map = S.map, r = S.rng, M = D.merchant;
    var rooms = map.rooms.map(function (o, i) { return i; }).filter(function (i) { return i !== map.startRoom && i !== map.stairsRoom; });
    if (!rooms.length) return;
    var room = map.rooms[pick(r, rooms)];
    var x = room.x + 1.5 + rnd(r) * Math.max(0.1, room.w - 3), y = room.y + 1.5 + rnd(r) * Math.max(0.1, room.h - 3);
    if (!canStand(map, x, y, 0.35)) { x = room.cx + 0.5; y = room.cy + 0.5; }
    S.monsters = S.monsters.filter(function (m) { return !(m.x > room.x - 1 && m.x < room.x + room.w + 1 && m.y > room.y - 1 && m.y < room.y + room.h + 1); });
    S.npcs.push({ id: S.nextId++, kind: 'merchant', name: M.name, x: x, y: y, face: rnd(r) * 6.28 });
    S.merchantNext = S.depth + rint(r, M.gap[0], M.gap[1]);
    emit(S, { t: 'merchant', name: M.name });
  }
  function findNpc(S, id) { for (var i = 0; i < S.npcs.length; i++) if (S.npcs[i].id === id) return S.npcs[i]; return null; }
  function nearMerchant(S, p) {
    for (var i = 0; i < S.npcs.length; i++) { var n = S.npcs[i]; if (n.kind === 'merchant' && Math.hypot(n.x - p.x, n.y - p.y) < D.merchant.talkRange + 1.4) return n; }
    return null;
  }
  function buy(S, p, itemId) {
    var M = D.merchant, offer = M.stock.filter(function (o) { return o.id === itemId && o.minDepth <= S.depth; })[0];
    if (!offer || !nearMerchant(S, p)) return;
    if (p.gold < offer.price) { emit(S, { t: 'msg', pid: p.id, text: 'Not enough gold.' }); return; }
    if ((itemId === 'hp' || itemId === 'mp') && p.potions[itemId] >= R.maxPotions) { emit(S, { t: 'msg', pid: p.id, text: 'You cannot carry more of those.' }); return; }
    p.gold -= offer.price;
    if (itemId === 'hp' || itemId === 'mp') p.potions[itemId]++;
    p.ver++;
    emit(S, { t: 'buy', pid: p.id, name: offer.name, price: offer.price });
  }
  function placeAtStart(S, p, i) {
    var off = [[0, 0], [1, 0], [0, 1], [1, 1]][i % 4];
    p.x = S.map.start.x + off[0]; p.y = S.map.start.y + off[1];
    if (!canStand(S.map, p.x, p.y, R.playerRadius)) { p.x = S.map.start.x; p.y = S.map.start.y; }
    p.path = null; p.order = null;
  }

  function spawnMonsters(S) {
    var r = S.rng, map = S.map, d = S.depth;
    var packs = D.packs.filter(function (pk) { return pk.minDepth <= d; });
    var cc = D.championChance, champChance = cc[Math.min(d, cc.length - 1)];
    var s0 = map.rooms[map.startRoom], nearest = -1, nd = 1e9;
    map.rooms.forEach(function (o, ri) {
      if (ri === map.startRoom) return;
      var dd = Math.hypot(o.cx - s0.cx, o.cy - s0.cy); if (dd < nd) { nd = dd; nearest = ri; }
    });
    map.rooms.forEach(function (room, ri) {
      if (ri === map.startRoom) return;
      var groups = rint(r, 1, 2) + (d > 3 && rnd(r) < 0.3 ? 1 : 0) + (map.theme === 'caves' ? 1 : 0);
      if (map.theme === 'catacombs' && room.w * room.h < 20 && rnd(r) < 0.5) groups = 0; // many niches stand empty
      for (var g = 0; g < groups; g++) {
        var pk = wpick(r, packs), champ = rnd(r) < champChance && ri !== nearest;
        var gx = room.x + 1 + rnd(r) * (room.w - 2), gy = room.y + 1 + rnd(r) * (room.h - 2);
        pk.units.forEach(function (u) {
          var n = rint(r, u[1], u[2]);
          for (var k = 0; k < n; k++) {
            var x = gx + (rnd(r) - 0.5) * 2.4, y = gy + (rnd(r) - 0.5) * 2.4;
            x = Math.min(room.x + room.w - 0.6, Math.max(room.x + 0.6, x));
            y = Math.min(room.y + room.h - 0.6, Math.max(room.y + 0.6, y));
            if (!canStand(map, x, y, 0.3)) { var nw = nearestWalkable(map, x, y, 3); if (!nw || !canStand(map, nw.x, nw.y, 0.3)) continue; x = nw.x; y = nw.y; }
            addMonster(S, u[0], x, y, champ);
          }
        });
      }
    });
  }
  function addMonster(S, type, x, y, champ) {
    var def = D.monsters[type], d = S.depth;
    var n = Object.keys(S.players).length, DF = D.difficulties[S.difficulty];
    var hpMul = depthMul(S, 'hp', d) * (champ ? 2.6 : 1) * partyMul(n);
    var hp = Math.round(def.hp * hpMul);
    var m = {
      id: S.nextId++, type: type, x: x, y: y, r: def.r, hp: hp, max: hp, lvl: d + DF.mlvl + (champ ? 2 : 0), champ: champ,
      dmgMul: depthMul(S, 'dmg', d) * (champ ? 1.5 : 1) * partyDmg(n), xp: Math.round(def.xp * depthMul(S, 'xp', d) * (champ ? 3 : 1)),
      speed: def.speed * (champ ? 1.12 : 1),
      state: 'idle', cd: rnd(S.rng) * def.atkCd, atk: 0, path: null, repath: rnd(S.rng) * 0.7, face: rnd(S.rng) * 6.28,
      wander: 1 + rnd(S.rng) * 3, wx: null, wy: null, hitT: 0, moving: false, stuck: 0
    };
    S.monsters.push(m);
    return m;
  }

  function addPlayer(S, id, char) {
    var p = migrateCharacter(JSON.parse(JSON.stringify(char)));
    p.depth = S.depth; p.maxDepth = Math.max(p.progress[S.difficulty].maxDepth, S.depth);
    if (S.trial) { p.trialBelt = p.potions; p.potions = { hp: D.trial.potions.hp, mp: D.trial.potions.mp }; }
    p.id = id; p.ver = 0; p.st = null; p.hp = 1; p.mana = 0;
    p.order = null; p.path = null; p.cd = 0; p.anim = 0; p.face = 0.8; p.dead = false; p.respawn = 0;
    p.moving = false; p.stuck = 0; p.repath = 0; p.r = R.playerRadius;
    p.st = derive(p); p.hp = p.st.maxHp; p.mana = p.st.maxMana;
    var before = Object.keys(S.players).length;
    S.players[id] = p;
    placeAtStart(S, p, before);
    rescaleParty(S, before, before + 1);
    return p;
  }
  function removePlayer(S, id) {
    if (!S.players[id]) return;
    var before = Object.keys(S.players).length;
    delete S.players[id];
    S.projs = S.projs.filter(function (pr) { return pr.owner !== id; });
    rescaleParty(S, before, before - 1);
  }
  // Monster life grows with party size: +60% per extra player, like D2's player count.
  function scale(c, d) { return (1 + c.linear * (d - 1)) * Math.pow(c.growth, d - 1); }
  // Normal follows the depth curve; Nightmare and Hell start high and climb gently.
  function depthMul(S, key, d) {
    var DF = D.difficulties[S.difficulty];
    if (!DF.start) return scale(D.scaling[key], d);
    return DF.start[key] * (1 + DF.curve[key] * (d - 1));
  }
  function applyFinal(map) {
    // The last level of a difficulty has no way further down.
    var i = Math.floor(map.stairs.y) * map.W + Math.floor(map.stairs.x);
    if (map.t[i] === 2) map.t[i] = 1;
    map.final = true;
  }
  function partyMul(n) { return 1 + D.scaling.party.hp * Math.max(0, n - 1); }
  function partyDmg(n) { return 1 + D.scaling.party.dmg * Math.max(0, n - 1); }
  function rescaleParty(S, from, to) {
    if (from < 1 || to < 1 || from === to) return;
    var k = partyMul(to) / partyMul(from);
    var kd = partyDmg(to) / partyDmg(from);
    S.monsters.forEach(function (m) { m.max = Math.max(1, Math.round(m.max * k)); m.hp = Math.max(1, Math.round(m.hp * k)); m.dmgMul *= kd; });
  }

  // The only way into the engine
  function command(S, pid, cmd) { S.queue.push({ pid: pid, cmd: cmd }); }

  function findMonster(S, id) { for (var i = 0; i < S.monsters.length; i++) if (S.monsters[i].id === id) return S.monsters[i]; return null; }
  function findGround(S, id) { for (var i = 0; i < S.ground.length; i++) if (S.ground[i].id === id) return S.ground[i]; return null; }

  function handle(S, pid, c) {
    var p = S.players[pid]; if (!p) return;
    if (p.dead && c.t === 'giveup') { if (S.time - p.deadAt >= 1) respawnAtStart(S, p); return; }
    if (p.dead && c.t !== 'alloc') return;
    switch (c.t) {
      case 'move':
        p.charge = null;
        p.order = { t: 'move' }; p.path = findPath(S.map, p.x, p.y, c.x, c.y, 4000, p.r); p.stuck = 0;
        if (!p.path) p.order = null;
        break;
      case 'attack': p.order = { t: 'attack', id: c.id }; p.path = null; p.repath = 0; break;
      case 'shoot': p.order = { t: 'shoot', x: c.x, y: c.y }; p.path = null; break;
      // A skill pressed mid-swing waits for the swing to finish instead of being dropped.
      case 'skill': {
        var draw = drawFrac(S, p); if (p.charge != null) { p.charge = null; p.ver++; }
        if (p.cd > 0) p.queued = { x: c.x, y: c.y, until: S.time + 0.8, draw: draw }; else castSkill(S, p, c.x, c.y, draw);
        break;
      }
      // Sunwarden: start drawing Multishot; the 'skill' command lets it go.
      case 'charge': if (coreOf(p).charge && p.mana >= D.skills.multishot.mana) { p.charge = S.time; p.order = null; p.path = null; p.ver++; } break;
      case 'node': {
        var nerr = takeNode(p, c.id);
        if (nerr) emit(S, { t: 'msg', pid: p.id, text: nerr });
        else { refresh(p); emit(S, { t: 'nodeTaken', pid: p.id, id: c.id, rank: p.ascNodes[c.id] }); }
        break;
      }
      case 'pickup': p.order = { t: 'pickup', id: c.id }; p.path = null; p.repath = 0; break;
      case 'stairs': if (S.map.final) { emit(S, { t: 'msg', pid: p.id, text: 'There is no way further down.' }); break; } p.order = { t: 'stairs' }; p.path = findPath(S.map, p.x, p.y, S.map.stairs.x, S.map.stairs.y, 4000, p.r); break;
      case 'stop': p.order = null; p.path = null; break;
      case 'revive': p.order = { t: 'revive', id: c.id }; p.path = null; p.repath = 0; break;
      case 'talk': p.order = { t: 'talk', id: c.id }; p.path = null; p.repath = 0; break;
      case 'buy': buy(S, p, c.item); break;
      case 'potion': drinkPotion(S, p, c.kind); break;
      case 'equip': equipFromInv(S, p, c.index, c.slot); break;
      case 'unequip': unequip(S, p, c.slot); break;
      case 'drop': dropItem(S, p, c.from, c.key); break;
      case 'alloc':
        if (p.pts > 0 && classOf(p).attrs.indexOf(c.stat) >= 0) { p.base[c.stat] = (p.base[c.stat] || 0) + 1; p.pts--; refresh(p); }
        break;
    }
  }

  function drinkPotion(S, p, kind) {
    if (!p.potions[kind]) { emit(S, { t: 'msg', pid: p.id, text: kind === 'hp' ? 'No healing potions left.' : 'No mana potions left.' }); return; }
    if (kind === 'hp') { if (p.hp >= p.st.maxHp) return; p.hp = Math.min(p.st.maxHp, p.hp + Math.ceil(p.st.maxHp * 0.45)); }
    else { if (p.mana >= p.st.maxMana) return; p.mana = Math.min(p.st.maxMana, p.mana + p.st.maxMana * 0.6); }
    p.potions[kind]--; p.ver++;
    emit(S, { t: 'potion', pid: p.id, kind: kind, x: p.x, y: p.y });
  }
  // Where an item goes when equipped. A ring fills an empty ring place first, otherwise the one asked for.
  function targetSlot(p, it, want) {
    if (it.slot !== 'ring') return it.slot;
    if (want === 'ring' || want === 'ring2') return want;
    if (!p.eq.ring) return 'ring';
    if (!p.eq.ring2) return 'ring2';
    return 'ring';
  }
  function equipFromInv(S, p, idx, want) {
    var it = p.inv[idx]; if (!it) return;
    if (!canWield(p, it)) { emit(S, { t: 'msg', pid: p.id, text: 'A ' + classOf(p).name.toLowerCase() + " can't use that weapon." }); return; }
    var slot = targetSlot(p, it, want);
    var old = p.eq[slot]; p.eq[slot] = it; p.inv[idx] = old || null;
    refresh(p); emit(S, { t: 'equip', pid: p.id });
  }
  function unequip(S, p, slot) {
    var it = p.eq[slot]; if (!it) return;
    var free = p.inv.indexOf(null);
    if (free < 0) { emit(S, { t: 'msg', pid: p.id, text: 'Your pack is full.' }); return; }
    p.inv[free] = it; p.eq[slot] = null; refresh(p); emit(S, { t: 'equip', pid: p.id });
  }
  function dropItem(S, p, from, key) {
    var it = from === 'inv' ? p.inv[key] : p.eq[key]; if (!it) return;
    if (from === 'inv') p.inv[key] = null; else p.eq[key] = null;
    refresh(p);
    S.ground.push({ id: S.nextId++, x: p.x, y: p.y, kind: 'item', item: it });
    emit(S, { t: 'drop', x: p.x, y: p.y });
  }

  // ---------- Melee ----------
  function rollHit(S, p, mult) {
    var st = p.st, r = S.rng;
    return { dmg: rint(r, st.dmin, st.dmax) * (mult || 1), light: st.lmax ? rint(r, st.lmin, st.lmax) * (mult || 1) : 0, dark: st.dkmax ? rint(r, st.dkmin, st.dkmax) * (mult || 1) : 0 };
  }
  function swing(S, p, m) {
    if (p.cd > 0) return false;
    var h = rollHit(S, p, 1 + nodeVal(p, 'executioner') / 100);
    p.cd = atkCd(p); p.anim = 0.25;
    emit(S, { t: 'swing', pid: p.id, x: p.x, y: p.y, face: p.face, arc: 0.9 });
    var mx = m.x, my = m.y;
    var total = hurtMonster(S, m, h.dmg, h.light, p, 'melee', h.dark);
    if (hasNode(p, 'bloodied')) p.hp = Math.min(p.st.maxHp, p.hp + p.st.maxHp * nodeVal(p, 'bloodied') / 100);
    if (p.ascendancy === 'templar') chainLight(S, p, mx, my, m.id, h);
    if (p.ascendancy === 'reaver' && !m.dead) addRend(S, m, p, total);
    return true;
  }
  // Reaver: each hit leaves a Rend stack that bleeds dark damage; Cleave rips them open.
  function addRend(S, m, p, total) {
    var C = coreOf(p).rend, max = C.max + nodeVal(p, 'deep_wounds') + (p.st.rendMax || 0);
    m.rend = m.rend || [];
    m.rend.push({ pool: total * C.pct * p.st.darkMul, end: S.time + C.dur, by: p.id });
    while (m.rend.length > max) m.rend.shift();
  }
  function rendTick(S, m, dt) {
    m.rendT = (m.rendT || 0) + dt;
    if (m.rendT < 0.5) return;
    var step = m.rendT, sum = 0, by = null; m.rendT = 0;
    m.rend = m.rend.filter(function (r) {
      var left = Math.max(step, r.end - S.time + step), part = r.pool * Math.min(1, step / left);
      r.pool -= part; sum += part; by = r.by;
      if (r.pool < 0.5 || S.time >= r.end) { sum += r.pool; return false; }
      return true;
    });
    if (sum > 0) dealRaw(S, m, sum, S.players[by] || null, 'dark');
  }
  function ripOpen(S, m, p) {
    var sum = 0; (m.rend || []).forEach(function (r) { sum += r.pool; }); m.rend = [];
    if (sum <= 0) return;
    emit(S, { t: 'rip', id: m.id, x: m.x, y: m.y });
    var ex = hasNode(p, 'exsanguinate') ? nodeDef('exsanguinate') : null;
    var ripped = sum * (ex ? ex.rip : coreOf(p).rip) * (1 + (p.st.ripPct || 0) / 100);
    dealRaw(S, m, ripped, p, 'rip');
    if (ex && !p.dead) { var hl = ripped * ex.heal; p.hp = Math.min(p.st.maxHp, p.hp + hl); p.ver++; }
  }
  // Templar's Chain of Light: the blow leaps on to the nearest enemies it has not touched yet.
  function chainLight(S, p, x, y, firstId, h) {
    var C = coreOf(p).chain, pct = C.pct + (nodeVal(p, 'bright_leap') + (p.st.chainPct || 0)) / 100, hit = [firstId];
    var nb = C.bounces + (hasNode(p, 'radiant_chain') ? nodeDef('radiant_chain').bounces : 0);
    for (var i = 0; i < nb; i++) {
      var best = null, bd = C.range;
      S.monsters.forEach(function (o) {
        if (hit.indexOf(o.id) >= 0 || o.hp <= 0) return;
        var d = Math.hypot(o.x - x, o.y - y);
        if (d < bd && clearLine(S.map, x, y, o.x, o.y, 0.05)) { bd = d; best = o; }
      });
      if (!best) return;
      hit.push(best.id);
      emit(S, { t: 'chain', x: x, y: y, x2: best.x, y2: best.y });
      x = best.x; y = best.y;
      hurtMonster(S, best, h.dmg * pct, h.light * pct, p, 'chain', h.dark * pct);
    }
  }
  // Shift-click: hit the closest enemy in front, or swing at the air.
  function swingAt(S, p, tx, ty) {
    var a = Math.atan2(ty - p.y, tx - p.x), best = null, bd = 1e9;
    p.face = a;
    S.monsters.forEach(function (m) {
      var d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d > p.st.range + p.r + m.r + 0.2) return;
      var da = Math.abs(((Math.atan2(m.y - p.y, m.x - p.x) - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < 0.8 && d < bd) { bd = d; best = m; }
    });
    if (best) return swing(S, p, best);
    p.cd = atkCd(p); p.anim = 0.25;
    emit(S, { t: 'swing', pid: p.id, x: p.x, y: p.y, face: a, arc: 0.9, miss: true });
    return true;
  }
  function castSkill(S, p, tx, ty, draw) {
    p.queued = null;
    var sk = skillOf(p);
    if (sk === 'cleave') castCleave(S, p, tx, ty); else if (sk === 'rain') castRain(S, p, tx, ty); else if (sk === 'nova') castNova(S, p, tx, ty); else castMultishot(S, p, tx, ty, draw || 0);
  }
  // Sunwarden: how far the bow is drawn, 0 (a tap) to 1 (full draw).
  function drawFrac(S, p) {
    if (p.charge == null) return 0;
    var C = coreOf(p).charge; if (!C) return 0;
    var full = Math.max(C.min + 0.2, C.full - nodeVal(p, 'quick_draw')), t = S.time - p.charge;
    return Math.max(0, Math.min(1, (t - C.min) / (full - C.min)));
  }
  // Skills keep an attack order going, so you go back to hitting your target afterwards.
  function skillOrder(p) { p.path = null; if (p.order && p.order.t !== 'attack') p.order = null; }
  function castCleave(S, p, tx, ty) {
    var sk = D.skills.cleave, bp = hasNode(p, 'blood_price') ? nodeDef('blood_price') : null, mult = sk.mult;
    // Reaping Arc: same arc, longer reach, so the area grows by the node's factor.
    var reach = sk.reach * Math.sqrt(1 + (nodeVal(p, 'reaping_arc') + (p.st.cleaveArea || 0)) / 100);
    if (bp) {
      var cost = Math.ceil(p.st.maxHp * bp.pct);
      if (p.cd > 0) return;
      if (p.hp <= cost + 1) { emit(S, { t: 'msg', pid: p.id, text: 'Not enough blood.', quiet: true }); return; }
      p.hp -= cost; mult *= bp.mult;
    } else {
      if (p.cd > 0 || p.mana < sk.mana) { if (p.mana < sk.mana) emit(S, { t: 'msg', pid: p.id, text: 'Not enough mana.', quiet: true }); return; }
      p.mana -= sk.mana;
    }
    skillOrder(p);
    var a = Math.atan2(ty - p.y, tx - p.x); p.face = a;
    if (hasNode(p, 'consecrate')) {
      var cz = nodeDef('consecrate'), zx = p.x + Math.cos(a) * 0.9, zy = p.y + Math.sin(a) * 0.9;
      if (!walkable(S.map, zx, zy)) { zx = p.x; zy = p.y; }
      S.zones.push({ id: S.nextId++, kind: 'holy', x: zx, y: zy, r: cz.radius, end: S.time + cz.dur, dur: cz.dur, owner: p.id });
    }
    p.cd = atkCd(p); p.anim = 0.3;
    if (p.ascendancy === 'templar') { p.zeal = coreOf(p).zeal.dur + nodeVal(p, 'long_vigil') + (p.st.zealDur || 0); p.ver++; }
    emit(S, { t: 'swing', pid: p.id, x: p.x, y: p.y, face: a, arc: sk.arc / 2, big: true, reach: reach });
    S.monsters.slice().forEach(function (m) {
      var d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d > reach + m.r) return;
      var da = Math.abs(((Math.atan2(m.y - p.y, m.x - p.x) - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da > sk.arc / 2 && d > p.r + m.r + 0.1) return;
      var h = rollHit(S, p, mult);
      hurtMonster(S, m, h.dmg, h.light, p, 'melee', h.dark);
      if (p.ascendancy === 'reaver' && !m.dead && m.rend && m.rend.length) ripOpen(S, m, p);
    });
  }

  function castMultishot(S, p, tx, ty, draw) {
    var ms = D.skills.multishot;
    if (p.cd > 0 || p.mana < ms.mana) { if (p.mana < ms.mana) emit(S, { t: 'msg', pid: p.id, text: 'Not enough mana.', quiet: true }); return; }
    p.mana -= ms.mana; skillOrder(p);
    var C = coreOf(p).charge, mult = ms.mult, extra = 0;
    if (C && draw > 0) { mult *= 1 + draw * (C.dmg + nodeVal(p, 'focused_draw') / 100); extra = Math.round(draw * C.pierce); }
    var n = (hasNode(p, 'radiant_volley') ? nodeDef('radiant_volley').arrows : ms.arrows) + (p.st.multiArrows || 0), half = (n - 1) / 2;
    for (var i = 0; i < n; i++) fireArrow(S, p, tx, ty, (i - half) * ms.spread, mult, extra);
    p.cd = atkCd(p); p.anim = 0.25; p.face = Math.atan2(ty - p.y, tx - p.x);
    emit(S, { t: 'shoot', pid: p.id, multi: true, draw: draw || 0 });
  }
  // Bosses of every kind (mini bosses, the Gravewarden, the Judge, the Abbot) ignore crowd control:
  // no knockback, pull, stun or loss of target. Champions (blue) are not bosses and are affected.
  function ccImmune(m) { return !!m.boss; }
  // Mage: Nova. Lightbinder shields allies (and with Blink jumps first); Voidcaller pulls enemies in and rots them.
  function castNova(S, p, tx, ty) {
    var sk = D.skills.nova, cost = p.st.maxMana * Math.max(0.02, sk.manaPct - nodeVal(p, 'clear_mind') / 100);
    if (p.cd > 0 || p.mana < cost) { if (p.mana < cost) emit(S, { t: 'msg', pid: p.id, text: 'Not enough mana.', quiet: true }); return; }
    p.mana -= cost; skillOrder(p);
    var core = coreOf(p);
    if (hasNode(p, 'blink')) {
      var B = nodeDef('blink'), dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1, go = Math.min(d, B.range), bx = p.x, by = p.y;
      for (var i = 1; i <= Math.ceil(go / 0.2); i++) {
        var f = Math.min(go, i * 0.2), x = p.x + dx / d * f, y = p.y + dy / d * f;
        if (!sightable(S.map, x, y)) break;   // Blink crosses lava but not rock
        if (canStand(S.map, x, y, p.r)) { bx = x; by = y; }
      }
      emit(S, { t: 'blink', pid: p.id, x0: p.x, y0: p.y, x: bx, y: by });
      p.x = bx; p.y = by; p.path = null;
    }
    var rad = sk.radius * (1 + (nodeVal(p, 'wide_nova') + nodeVal(p, 'event_horizon')) / 100), pull = !!core.pull;
    p.novaN = (p.novaN || 0) + 1;
    var crush = hasNode(p, 'collapse') && p.novaN % 2 === 0, struck = [];
    S.monsters.slice().forEach(function (m) {
      var mdx = m.x - p.x, mdy = m.y - p.y, md = Math.hypot(mdx, mdy);
      if (md > rad + m.r || !los(S.map, p, m)) return;
      var h = rollHit(S, p, sk.mult);
      hurtMonster(S, m, h.dmg, h.light, p, 'nova', h.dark);
      if (m.dead) return;
      var ux = md > 0.01 ? mdx / md : 1, uy = md > 0.01 ? mdy / md : 0, heavy = 1;
      if (ccImmune(m)) { /* bosses are never pushed, pulled, stunned or blinded */ }
      else if (pull) {
        var to = Math.max(0, md - (p.r + m.r + 0.15)) * heavy;
        for (var k = 0; k < 8; k++) moveEntity(S, m, -ux * to / 8, -uy * to / 8);
      } else {
        for (var k2 = 0; k2 < 8; k2++) moveEntity(S, m, ux * sk.push * heavy / 8, uy * sk.push * heavy / 8);
      }
      if (hasNode(p, 'dazzle') && !ccImmune(m)) { m.state = 'idle'; m.path = null; m.atk = 0; m.wx = null; m.blindUntil = S.time + nodeVal(p, 'dazzle'); }
      if (core.stun && pull && !ccImmune(m)) { m.stunUntil = S.time + core.stun; m.atk = 0; }
      if (core.decay) applyDecay(S, m, p);
      struck.push(m);
    });
    if (crush) {
      var C = nodeDef('collapse');
      struck.forEach(function (m) { if (!m.dead) { var h2 = rollHit(S, p, C.mult); hurtMonster(S, m, h2.dmg, h2.light, p, 'nova', h2.dark); } });
    }
    if (core.shield) {
      var amt = Math.round(p.st.maxHp * core.shield.pct * (1 + nodeVal(p, 'radiant_shield') / 100));
      for (var id in S.players) {
        var q = S.players[id];
        if (q.dead || Math.hypot(q.x - p.x, q.y - p.y) > rad || S.time < (q.shieldNext || 0)) continue;
        q.shield = amt; q.shieldEnd = S.time + core.shield.dur; q.shieldNext = S.time + core.shield.cooldown; q.ver++;
      }
    }
    if (hasNode(p, 'sanctuary')) {
      var SN = nodeDef('sanctuary');
      S.zones.push({ id: S.nextId++, kind: 'holy', x: p.x, y: p.y, r: SN.radius, end: S.time + SN.dur, dur: SN.dur, owner: p.id, pct: SN.pct });
    }
    p.cd = atkCd(p); p.anim = 0.3; p.animK = 'cast';
    emit(S, { t: 'nova', pid: p.id, x: p.x, y: p.y, r: rad, pull: pull || undefined, crush: crush || undefined, side: ascOf(p) ? ascOf(p).side : null });
  }
  // Voidcaller's Decay: dark damage over time that moves on when its host dies.
  function applyDecay(S, m, p, fresh) {
    var core = coreOf(p); if (!core.decay) return;
    var st = p.st, hit = (st.dmin + st.dmax + st.lmin + st.lmax) / 2 + (st.dkmin + st.dkmax) / 2;
    var dur = core.decay.dur + nodeVal(p, 'lingering'), total = hit * core.decay.pct * (1 + nodeVal(p, 'virulence') / 100) * st.darkMul;
    m.decay = { dps: total / dur, end: S.time + dur, by: p.id, t: 0 };
  }
  function updateDecay(S, dt) {
    S.monsters.slice().forEach(function (m) {
      var dc = m.decay; if (!dc) return;
      if (S.time >= dc.end) { m.decay = null; return; }
      var p = S.players[dc.by] || null;
      if (p && hasNode(p, 'withering')) { m.slowUntil = S.time + 0.2; m.slowPct = Math.max(m.slowPct && m.slowUntil > S.time ? m.slowPct : 0, nodeVal(p, 'withering') / 100); }
      dc.t += dt; if (dc.t < 0.5) return;
      var step = dc.t; dc.t = 0;
      dealRaw(S, m, dc.dps * step, p, 'dark');
    });
  }
  function spreadDecay(S, m) {
    var dc = m.decay; if (!dc || S.time >= dc.end) return;
    var p = S.players[dc.by]; if (!p || !coreOf(p).decay) return;
    var n = hasNode(p, 'contagion') ? 2 : 1, range = coreOf(p).decay.spread;
    var near = S.monsters.filter(function (o) { return o !== m && !o.dead && Math.hypot(o.x - m.x, o.y - m.y) <= range && !(o.decay && o.decay.end > S.time); })
      .sort(function (a, b) { return Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y); }).slice(0, n);
    near.forEach(function (o) {
      if (n === 2) applyDecay(S, o, p);
      else o.decay = { dps: dc.dps, end: dc.end, by: dc.by, t: 0 };
      emit(S, { t: 'decaySpread', x0: m.x, y0: m.y, x: o.x, y: o.y });
    });
  }
  // Nightstalker: a patch of falling arrows that deals dark damage to everything under it.
  function castRain(S, p, tx, ty) {
    var sk = D.skills.rain;
    if (p.cd > 0 || p.mana < sk.mana) { if (p.mana < sk.mana) emit(S, { t: 'msg', pid: p.id, text: 'Not enough mana.', quiet: true }); return; }
    if ((p.rainCd || 0) > 0) { emit(S, { t: 'msg', pid: p.id, text: 'Rain of Arrows is not ready.', quiet: true }); return; }
    var dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > p.st.range) { tx = p.x + dx / d * p.st.range; ty = p.y + dy / d * p.st.range; d = p.st.range; }
    // Only where you can see: behind a wall the rain lands at the last open spot along the line.
    if (!clearLine(S.map, p.x, p.y, tx, ty, 0)) {
      var n = Math.ceil(d / 0.25), lx = p.x, ly = p.y;
      for (var i = 1; i <= n; i++) { var f = i / n, x = p.x + dx / Math.hypot(dx, dy) * d * f, y = p.y + dy / Math.hypot(dx, dy) * d * f; if (!walkable(S.map, x, y)) break; lx = x; ly = y; }
      tx = lx; ty = ly;
    }
    p.rainCd = sk.cooldown || 0;
    p.mana -= sk.mana; skillOrder(p);
    var st = p.st, hit = (st.dmin + st.dmax + st.lmin + st.lmax) / 2 + (st.dkmin + st.dkmax) / 2;
    var dur = sk.dur + nodeVal(p, 'long_night') + (p.st.rainDur || 0);
    S.zones.push({ id: S.nextId++, kind: 'rain', x: tx, y: ty, r: sk.radius * (1 + nodeVal(p, 'wide_rain') / 100), end: S.time + dur, dur: dur,
      owner: p.id, dmg: hit * sk.pct * st.darkMul, slow: nodeVal(p, 'grasping_dark') / 100, tickT: 0 });
    p.cd = atkCd(p); p.anim = 0.25; p.face = Math.atan2(ty - p.y, tx - p.x);
    emit(S, { t: 'shoot', pid: p.id, multi: true, rain: true });
  }
  function fireArrow(S, p, tx, ty, off, mult, extraPierce) {
    var st = p.st, a = Math.atan2(ty - p.y, tx - p.x) + (off || 0), r = S.rng;
    var h = rollHit(S, p, mult);
    S.projs.push({ id: S.nextId++, kind: 'arrow', from: 'p', owner: p.id, x: p.x + Math.cos(a) * 0.35, y: p.y + Math.sin(a) * 0.35,
      vx: Math.cos(a) * R.arrowSpeed, vy: Math.sin(a) * R.arrowSpeed, life: st.range / R.arrowSpeed + 0.1, dmg: h.dmg, light: h.light, dark: h.dark,
      pierce: (coreOf(p).pierce || 0) + (extraPierce || 0) + (st.pierce || 0), keep: (coreOf(p).pierceKeep || 0.5) + nodeVal(p, 'piercing_light') / 100, hitIds: [] });
  }
  // Mage: a bolt of force that bends a little toward the nearest enemy in its path.
  function fireSpark(S, p, tx, ty) {
    var a = Math.atan2(ty - p.y, tx - p.x), h = rollHit(S, p, 1);
    S.projs.push({ id: S.nextId++, kind: 'spark', from: 'p', owner: p.id, x: p.x + Math.cos(a) * 0.35, y: p.y + Math.sin(a) * 0.35,
      vx: Math.cos(a) * R.sparkSpeed, vy: Math.sin(a) * R.sparkSpeed, life: p.st.range / R.sparkSpeed + 0.1, dmg: h.dmg, light: h.light, dark: h.dark,
      pierce: 0, keep: 0, hitIds: [], home: true, prism: hasNode(p, 'prism') });
  }
  function shoot(S, p, tx, ty) {
    if (p.cd > 0) return false;
    if (p.st.caster) fireSpark(S, p, tx, ty); else fireArrow(S, p, tx, ty, 0, 1);
    p.cd = atkCd(p); p.anim = 0.25; p.animK = 'attack'; p.face = Math.atan2(ty - p.y, tx - p.x);
    emit(S, { t: 'shoot', pid: p.id, spark: p.st.caster || undefined });
    return true;
  }

  function moveEntity(S, e, dx, dy) {
    var ox = e.x, oy = e.y;
    if (canStand(S.map, e.x + dx, e.y, e.r)) e.x += dx;
    if (canStand(S.map, e.x, e.y + dy, e.r)) e.y += dy;
    return Math.hypot(e.x - ox, e.y - oy);
  }
  function followPath(S, e, speed, dt) {
    if (!e.path || !e.path.length) { e.moving = false; return false; }
    if (e.path.length > 1 && clearLine(S.map, e.x, e.y, e.path[1][0], e.path[1][1], e.r * 0.9)) e.path.shift();
    var tx = e.path[0][0], ty = e.path[0][1], dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy), step = speed * dt, moved;
    if (d <= step) { moved = moveEntity(S, e, dx, dy); e.path.shift(); }
    else moved = moveEntity(S, e, dx / d * step, dy / d * step);
    if (d > 0.01) e.face = Math.atan2(dy, dx);
    e.moving = true;
    if (moved < step * 0.2 && d > step) { e.stuck += dt; if (e.stuck > 0.35) { e.path = null; e.stuck = 0; e.moving = false; } }
    else e.stuck = 0;
    if (e.path && !e.path.length) e.path = null;
    return true;
  }
  function pathTo(S, e, x, y, dt, maxNodes) {
    e.repath -= dt;
    if (!e.path || e.repath <= 0) {
      e.repath = 0.4 + (S.tick % 7) * 0.03;
      e.path = findPath(S.map, e.x, e.y, x, y, maxNodes, e.r);
    }
  }

  function reviveChannel(p) { return hasNode(p, 'aegis') ? nodeDef('aegis').channel : R.reviveChannel; }
  // Sunwarden light: scorch enemies in it, and mend allies standing in it.
  function ascTick(S, p, dt) {
    var aura = hasNode(p, 'dawn_aura'), beacon = hasNode(p, 'beacon');
    if (!aura && !beacon) return;
    var A = nodeDef('dawn_aura');
    p.ascT = (p.ascT || 0) + dt;
    if (p.ascT < A.tick) return;
    var step = p.ascT; p.ascT = 0;
    var rad = p.st.light;
    if (aura) {
      var amt = (p.st.dmin + p.st.dmax) / 2 * A.pct * (step / A.tick);
      S.monsters.slice().forEach(function (m) {
        if (m.hp <= 0 || Math.hypot(m.x - p.x, m.y - p.y) > rad || !los(S.map, p, m)) return;
        m.sunT = S.time;
        dealRaw(S, m, amt, p);
      });
    }
    if (beacon) {
      var B = nodeDef('beacon');
      for (var id in S.players) {
        var q = S.players[id];
        if (q.dead || Math.hypot(q.x - p.x, q.y - p.y) > rad) continue;
        q.hp = Math.min(q.st.maxHp, q.hp + q.st.maxHp * B.pct * step);
      }
    }
  }
  // Damage with no hit roll: auras and bleeding. No leech, no ambush, no number popping up.
  function dealRaw(S, m, amt, by, kind) {
    m.hpFrac = (m.hpFrac || 0) + amt * (1 - (m.dr || 0));
    var whole = Math.floor(m.hpFrac); if (whole <= 0) return;
    m.hpFrac -= whole; m.hp -= whole; m.lastKind = kind; wake(S, m);
    if (kind === 'dark' || kind === 'rip') emit(S, { t: 'dot', id: m.id, v: whole, x: m.x, y: m.y, big: kind === 'rip' || undefined });
    if (m.hp <= 0) killMonster(S, m, by);
  }

  function updatePlayer(S, p, dt) {
    if (p.dead) {
      // With a living friend around you wait to be resurrected; if everyone is down, the normal respawn runs.
      if (!anyoneAlive(S) && p.respawn > R.respawnTime) p.respawn = R.respawnTime;
      p.respawn -= dt;
      if (p.respawn <= 0) respawnAtStart(S, p);
      return;
    }
    var st = p.st;
    p.hp = Math.min(st.maxHp, p.hp + st.regen * dt);
    p.mana = Math.min(st.maxMana, p.mana + st.manaRegen * dt);
    if (p.shield && S.time >= (p.shieldEnd || 0)) { p.shield = 0; p.ver++; }
    p.cd = Math.max(0, p.cd - dt); if (p.rainCd) p.rainCd = Math.max(0, p.rainCd - dt); p.anim = Math.max(0, p.anim - dt); p.slowT = Math.max(0, (p.slowT || 0) - dt);
    if (p.ascendancy) ascTick(S, p, dt);
    p.zeal = Math.max(0, (p.zeal || 0) - dt);
    if (p.charge != null && S.time - p.charge > 6) { p.charge = null; p.ver++; }
    if (p.queued && p.cd <= 0) { var qd = p.queued; if (S.time <= qd.until) castSkill(S, p, qd.x, qd.y, qd.draw); else p.queued = null; }
    p.moving = false;
    var o = p.order;
    if (!o || o.t !== 'revive') p.chan = null;
    if (o) {
      if (o.t === 'move') { if (!followPath(S, p, st.speed, dt)) p.order = null; }
      else if (o.t === 'attack') {
        var m = findMonster(S, o.id);
        if (!m || m.hp <= 0) { p.order = null; p.path = null; }
        else {
          var d = Math.hypot(m.x - p.x, m.y - p.y);
          if (st.melee) {
            if (d <= st.range + p.r + m.r) { p.path = null; p.face = Math.atan2(m.y - p.y, m.x - p.x); swing(S, p, m); }
            else { pathTo(S, p, m.x, m.y, dt, 3000); p.repath = Math.min(p.repath, 0.15); followPath(S, p, st.speed, dt); }
          } else if (d <= st.range && los(S.map, p, m)) { p.path = null; p.face = Math.atan2(m.y - p.y, m.x - p.x); shoot(S, p, m.x, m.y); }
          else { pathTo(S, p, m.x, m.y, dt, 3000); followPath(S, p, st.speed, dt); }
        }
      }
      else if (o.t === 'shoot') {
        p.face = Math.atan2(o.y - p.y, o.x - p.x);
        if (st.melee) { if (p.cd <= 0) { swingAt(S, p, o.x, o.y); p.order = null; } }
        else if (shoot(S, p, o.x, o.y)) p.order = null;
      }
      else if (o.t === 'pickup') {
        var g = findGround(S, o.id);
        if (!g) p.order = null;
        else if (Math.hypot(g.x - p.x, g.y - p.y) < 1.1) { pickUp(S, p, g); p.order = null; p.path = null; }
        else { pathTo(S, p, g.x, g.y, dt, 3000); if (!followPath(S, p, st.speed, dt) && !p.path) p.order = null; }
      }
      else if (o.t === 'revive') {
        var q = S.players[o.id];
        if (!q || !q.dead || q === p) { p.order = null; p.chan = null; }
        else if (Math.hypot(q.x - p.x, q.y - p.y) < R.reviveRange) {
          p.path = null; p.face = Math.atan2(q.y - p.y, q.x - p.x);
          if (S.time - q.deadAt < R.reviveDelay) p.chan = null;
          else {
            if (!p.chan || p.chan.id !== q.id) { p.chan = { id: q.id, t: 0 }; emit(S, { t: 'reviveStart', pid: p.id, target: q.id, x: q.x, y: q.y }); }
            p.chan.t += dt;
            if (p.chan.t >= reviveChannel(p)) { revive(S, q, p); p.chan = null; p.order = null; }
          }
        }
        else { p.chan = null; pathTo(S, p, q.x, q.y, dt, 3000); if (!followPath(S, p, st.speed, dt) && !p.path) p.order = null; }
      }
      else if (o.t === 'talk') {
        var npc = findNpc(S, o.id);
        if (!npc) p.order = null;
        else if (Math.hypot(npc.x - p.x, npc.y - p.y) < D.merchant.talkRange) { p.order = null; p.path = null; p.face = Math.atan2(npc.y - p.y, npc.x - p.x); emit(S, npc.kind === 'merchant' ? { t: 'shop', pid: p.id, id: npc.id } : { t: 'dialog', pid: p.id, id: npc.id, kind: npc.kind, difficulty: S.trial ? 'trial' : S.difficulty }); }
        else { pathTo(S, p, npc.x, npc.y, dt, 3000); if (!followPath(S, p, st.speed, dt) && !p.path) p.order = null; }
      }
      else if (o.t === 'stairs') {
        if (Math.hypot(S.map.stairs.x - p.x, S.map.stairs.y - p.y) < 1.0) {
          p.order = null; p.path = null;
          if (S.seal) { var sb = findMonster(S, S.seal); emit(S, { t: 'msg', pid: p.id, text: 'A dark seal holds the stairs. Defeat ' + (sb ? sb.name : 'the guardian') + ' first.' }); return; }
          descend(S, p); return;
        }
        if (!followPath(S, p, st.speed, dt)) p.order = null;
      }
    }
    // Gold and potions are picked up automatically
    for (var i = S.ground.length - 1; i >= 0; i--) {
      var gi = S.ground[i];
      if (gi.kind !== 'item' && Math.hypot(gi.x - p.x, gi.y - p.y) < 0.7) pickUp(S, p, gi);
    }
  }

  function pickUp(S, p, g) {
    var idx = S.ground.indexOf(g); if (idx < 0) return;
    if (g.kind === 'gold') {
      // Gold is shared evenly by everyone in the game. The picker's gold find applies; the picker keeps any odd coin.
      var amt = Math.round(g.amount * (1 + p.st.goldFind / 100));
      var ids = Object.keys(S.players), share = Math.floor(amt / ids.length), rest = amt - share * ids.length;
      ids.forEach(function (id) {
        var q = S.players[id], got = share + (id === p.id ? rest : 0);
        if (!got) return;
        q.gold += got; q.ver++;
        emit(S, { t: 'pickup', pid: id, kind: 'gold', text: '+' + got + ' gold', x: g.x, y: g.y, shared: ids.length > 1, by: p.name });
      });
    } else if (g.kind === 'potion') {
      if (p.potions[g.pot] >= R.maxPotions) return;
      p.potions[g.pot]++; emit(S, { t: 'pickup', pid: p.id, kind: 'potion', text: g.pot === 'hp' ? 'Healing Potion' : 'Mana Potion', x: g.x, y: g.y });
    } else {
      var free = p.inv.indexOf(null);
      if (free < 0) { emit(S, { t: 'msg', pid: p.id, text: 'Your pack is full.' }); return; }
      p.inv[free] = g.item; emit(S, { t: 'pickup', pid: p.id, kind: 'item', rarity: g.item.rarity, text: itemName(g.item), x: g.x, y: g.y });
    }
    S.ground.splice(idx, 1); p.ver++;
  }

  function descend(S, p) {
    var nd = S.depth + 1;
    Object.keys(S.players).forEach(function (id) {
      var q = S.players[id]; q.depth = nd; q.maxDepth = Math.max(q.maxDepth, nd);
      var pr = q.progress[S.difficulty]; pr.depth = nd; pr.maxDepth = Math.max(pr.maxDepth, nd); q.ver++;
    });
    loadLevel(S, nd);
  }

  function nearestPlayer(S, m) {
    var best = null, bd = 1e9;
    for (var id in S.players) {
      var p = S.players[id]; if (p.dead) continue;
      var d = Math.hypot(p.x - m.x, p.y - m.y); if (d < bd) { bd = d; best = p; }
    }
    return best ? { p: best, d: bd } : null;
  }

  // Can a sleeping monster see someone? Nightstalkers are noticed later; Fade blinds for a moment.
  function notices(S, m, def) {
    if (m.blindUntil && m.blindUntil > S.time) return false;
    for (var id in S.players) {
      var p = S.players[id]; if (p.dead) continue;
      if (Math.hypot(p.x - m.x, p.y - m.y) < def.aggro * (p.st.aggro || 1) && los(S.map, m, p)) return true;
    }
    return false;
  }
  function darkTick(S, m, dt) {
    if (!m.darkPool) return;
    m.darkT = (m.darkT || 0) + dt;
    if (m.darkT < 0.5) return;
    var left = Math.max(0.5, m.darkEnd - S.time + m.darkT), part = m.darkPool * Math.min(1, m.darkT / left);
    m.darkT = 0; m.darkPool -= part;
    if (m.darkPool < 0.5 || S.time >= m.darkEnd) { part += m.darkPool; m.darkPool = 0; }
    dealRaw(S, m, part, S.players[m.darkBy] || null, 'dark');
  }

  function updateMonster(S, m, dt) {
    var def = D.monsters[m.type];
    m.cd -= dt; m.hitT = Math.max(0, m.hitT - dt); m.moving = false;
    if (m.darkPool) { darkTick(S, m, dt); if (m.hp <= 0) return; }
    if (m.rend && m.rend.length) { rendTick(S, m, dt); if (m.hp <= 0) return; }
    if (m.stunUntil > S.time) { m.atk = 0; return; }   // Voidcaller's pull
    var np = nearestPlayer(S, m);
    if (m.state === 'idle') {
      if (notices(S, m, def)) { wake(S, m); }
      else {
        m.wander -= dt;
        if (m.wander <= 0) { m.wander = 2 + rnd(S.rng) * 3; m.wx = m.x + (rnd(S.rng) - 0.5) * 3; m.wy = m.y + (rnd(S.rng) - 0.5) * 3; }
        if (m.wx !== null) {
          var dx = m.wx - m.x, dy = m.wy - m.y, dd = Math.hypot(dx, dy);
          if (dd < 0.1) m.wx = null;
          else { var st = def.speed * 0.35 * dt, mv = moveEntity(S, m, dx / dd * st, dy / dd * st); m.face = Math.atan2(dy, dx); m.moving = true; if (mv < st * 0.3) m.wx = null; }
        }
        return;
      }
    }
    if (!np) { m.state = 'idle'; return; }
    var p = np.p, d = np.d;
    if (d > 22 && !m.boss) { m.state = 'idle'; m.path = null; return; }
    if (m.frenzy && !m.frenzied && m.hp < m.max * 0.5) {
      m.frenzied = true; m.speed *= 1.4; m.cdMul = (m.cdMul || 1) * 0.65;
      emit(S, { t: 'frenzy', id: m.id, x: m.x, y: m.y });
    }
    if (m.aura) {
      m.auraT = (m.auraT || 0) + dt;
      if (m.auraT >= 0.5) { m.auraT = 0; for (var aid in S.players) { var ap = S.players[aid]; if (!ap.dead && Math.hypot(ap.x - m.x, ap.y - m.y) < 1.8) hurtPlayer(S, ap, m.aura * 0.5, m.lvl, null); } }
    }
    if (def.ai === 'abbot') { abbotAI(S, m, p, d, dt); return; }
    if (def.ai === 'judge') { judgeAI(S, m, p, d, dt); return; }
    if (def.ai === 'warden') { wardenAI(S, m, p, d, dt); return; }
    if (m.atk > 0) {
      m.atk -= dt;
      if (m.atk <= 0) {
        if (def.ai === 'caster') {
          var a = Math.atan2(p.y - m.y, p.x - m.x);
          S.projs.push({ id: S.nextId++, kind: 'bolt', from: 'm', owner: m.id, x: m.x + Math.cos(a) * 0.3, y: m.y + Math.sin(a) * 0.3,
            vx: Math.cos(a) * def.boltSpeed, vy: Math.sin(a) * def.boltSpeed, life: 2.2,
            dmg: rint(S.rng, def.dmg[0], def.dmg[1]) * m.dmgMul, lvl: m.lvl });
          emit(S, { t: 'cast', x: m.x, y: m.y });
        } else if (d <= def.range + m.r + p.r + 0.25) {
          hurtPlayer(S, p, rint(S.rng, def.dmg[0], def.dmg[1]) * m.dmgMul, m.lvl, m);
        } else emit(S, { t: 'miss', x: m.x, y: m.y });
      }
      return;
    }
    var seen = los(S.map, m, p);
    if (def.ai === 'caster') {
      if (d < 3.5 && seen) {
        var fx = m.x - p.x, fy = m.y - p.y, fl = Math.hypot(fx, fy) || 1, s1 = m.speed * dt;
        var mv2 = moveEntity(S, m, fx / fl * s1, fy / fl * s1); m.moving = mv2 > 0.001; m.face = Math.atan2(p.y - m.y, p.x - m.x);
        if (mv2 < s1 * 0.2 && m.cd <= 0) { m.atk = def.atkTime; m.cd = def.atkCd * (m.cdMul || 1); }
      } else if (d <= def.range && seen) {
        m.face = Math.atan2(p.y - m.y, p.x - m.x); m.path = null;
        if (m.cd <= 0) { m.atk = def.atkTime; m.cd = def.atkCd * (m.cdMul || 1); }
      } else chase(S, m, p, dt, seen);
    } else {
      if (d <= def.range + m.r + p.r && m.cd <= 0) { m.atk = def.atkTime; m.cd = def.atkCd * (m.cdMul || 1); m.face = Math.atan2(p.y - m.y, p.x - m.x); m.path = null; }
      else if (d > def.range + m.r + p.r - 0.05) chase(S, m, p, dt, seen);
      else m.face = Math.atan2(p.y - m.y, p.x - m.x);
    }
  }
  function chase(S, m, p, dt, seen) {
    if (seen && clearLine(S.map, m.x, m.y, p.x, p.y, m.r * 0.9)) {
      m.path = null;
      var dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1, s = mSpeed(S, m) * dt;
      moveEntity(S, m, dx / d * s, dy / d * s); m.face = Math.atan2(dy, dx); m.moving = true;
    } else { pathTo(S, m, p.x, p.y, dt, 700); followPath(S, m, mSpeed(S, m), dt); }
  }
  function mSpeed(S, m) { return m.speed * (m.slowUntil > S.time ? 1 - (m.slowPct || 0) : 1); }
  function wake(S, m) {
    if (m.state === 'hunt') return;
    m.state = 'hunt';
    S.monsters.forEach(function (o) {
      if (o.state === 'idle' && !(o.blindUntil > S.time) && Math.hypot(o.x - m.x, o.y - m.y) < 5 && los(S.map, o, m)) o.state = 'hunt';
    });
  }

  function anyoneAlive(S, except) {
    for (var id in S.players) { var q = S.players[id]; if (q !== except && !q.dead) return true; }
    return false;
  }
  function respawnAtStart(S, p) {
    p.dead = false; p.hp = p.st.maxHp; p.mana = p.st.maxMana; p.respawn = 0; p.chan = null;
    placeAtStart(S, p, 0); emit(S, { t: 'respawn', pid: p.id });
  }
  function revive(S, q, by) {
    q.dead = false; q.respawn = 0; q.order = null; q.path = null;
    var life = hasNode(by, 'aegis') ? nodeDef('aegis').life : R.reviveLife;
    q.hp = Math.ceil(q.st.maxHp * life); q.mana = q.st.maxMana * life; q.ver++;
    emit(S, { t: 'revived', pid: q.id, name: q.name, by: by.name, byId: by.id, x: q.x, y: q.y });
  }
  function hurtPlayer(S, p, raw, mlvl, src) {
    if (p.dead || S.testGod) return; // TEST MODE: invulnerable
    if (p.st.block && rnd(S.rng) < p.st.block) { emit(S, { t: 'block', pid: p.id, x: p.x, y: p.y }); return; }
    if (p.st.dodge && rnd(S.rng) < p.st.dodge) { emit(S, { t: 'dodge', pid: p.id, x: p.x, y: p.y }); return; }
    if (src && src.decay && src.decay.end > S.time) { var wk = S.players[src.decay.by]; if (wk && coreOf(wk).decay) raw *= 1 - (coreOf(wk).decay.weaken || 0); }
    var armor = p.st.armor;
    var dmg = Math.max(1, Math.round(raw * (1 - damageReduction(armor, mlvl)) * (1 - (classOf(p).dr || 0)) * (1 - (p.st.dr || 0))));
    if (p.shield > 0) { var ab = Math.min(p.shield, dmg); p.shield -= ab; dmg -= ab; if (p.shield <= 0) p.shield = 0; p.ver++; if (dmg <= 0) { emit(S, { t: 'absorb', pid: p.id, x: p.x, y: p.y }); return; } }
    var ward = classOf(p).ward;
    if (ward && p.mana > 0) { var wm = Math.min(p.mana, dmg * ward); p.mana -= wm; dmg = Math.max(1, Math.round(dmg - wm)); }
    p.hp -= dmg;
    if (src && src.vamp && src.hp > 0) src.hp = Math.min(src.max, src.hp + dmg * src.vamp);
    emit(S, { t: 'phit', pid: p.id, v: dmg, x: p.x, y: p.y });
    if (p.hp <= 0) {
      var waiting = !S.trial && anyoneAlive(S, p);
      p.hp = 0; p.dead = true; p.deadAt = S.time; p.respawn = S.trial ? 1e9 : waiting ? R.reviveTimeout : R.respawnTime;
      p.order = null; p.path = null; p.chan = null;
      var lost = S.trial ? 0 : Math.floor(p.gold * R.deathGoldLoss); p.gold -= lost; p.ver++;
      emit(S, { t: 'pdeath', pid: p.id, lost: lost, x: p.x, y: p.y, waiting: waiting, trial: !!S.trial });
    }
  }
  // Physical and light land at once. Dark goes into a pool that drains over rules.darkDuration seconds.
  function hurtMonster(S, m, dmg, light, p, kind, dark) {
    var mult = 1, ambush = false;
    if (p) {
      if (m.state === 'idle' && hasNode(p, 'from_the_dark')) { mult *= nodeDef('from_the_dark').mult; ambush = true; }
      if (p.blN && p.blT > S.time) mult *= 1 + p.blN * nodeDef('bloodlust').pct;
      if (m.markT > S.time && m.markBy !== p.id) mult *= 1 + nodeDef('mark_for_death').pct;
    }
    var total = Math.max(1, Math.round((dmg + light) * mult * (1 - (m.dr || 0))));
    m.hp -= total; m.hitT = 0.14; m.blindUntil = 0; m.lastKind = kind; wake(S, m);
    emit(S, { t: 'hit', id: m.id, v: total, light: light > 0, dark: dark > 0, x: m.x, y: m.y, mtype: m.type, ambush: ambush || undefined });
    if (p) {
      if (p.st.leech && !m.noLeech) p.hp = Math.min(p.st.maxHp, p.hp + total * p.st.leech / 100);
      if (hasNode(p, 'mark_for_death')) { m.markT = S.time + nodeDef('mark_for_death').dur; m.markBy = p.id; }
      var dk = (dark || 0) * mult;
      if (kind === 'arrow' && coreOf(p).blackPct) dk += total * coreOf(p).blackPct * p.st.darkMul;
      if (dk > 0 && m.hp > 0) { m.darkPool = (m.darkPool || 0) + dk; m.darkEnd = S.time + (p.st.darkDur || R.darkDuration); m.darkBy = p.id; }
      if (p.st.hitHeal) p.hp = Math.min(p.st.maxHp, p.hp + p.st.maxHp * p.st.hitHeal);
    }
    if (m.hp <= 0) killMonster(S, m, p);
    return total;
  }
  // What a kill gives the one who made it.
  function onKill(S, m, p) {
    if (!p || p.dead) return;
    if (p.st.darkKillMana && m.lastKind === 'dark') p.mana = Math.min(p.st.maxMana, p.mana + p.st.darkKillMana);
    if (hasNode(p, 'bloodlust')) {
      var BL = nodeDef('bloodlust');
      p.blN = Math.min(BL.stacks, (p.blT > S.time ? p.blN : 0) + 1); p.blT = S.time + BL.dur; p.ver++;
    }
    if (hasNode(p, 'fade')) {
      var F = nodeDef('fade'), n = 0;
      S.monsters.forEach(function (o) {
        if (o.boss || Math.hypot(o.x - m.x, o.y - m.y) > F.range) return;
        if (ccImmune(o)) return;
        o.state = 'idle'; o.path = null; o.atk = 0; o.wx = null; o.blindUntil = S.time + F.dur; n++;
      });
      if (n) emit(S, { t: 'fade', pid: p.id, x: p.x, y: p.y });
    }
  }
  function killMonster(S, m, by) {
    if (m.dead) return;
    m.dead = true;
    var idx = S.monsters.indexOf(m); if (idx >= 0) S.monsters.splice(idx, 1);
    emit(S, { t: 'death', x: m.x, y: m.y, mtype: m.type, champ: m.champ, face: m.face, boss: m.boss || null });
    if (m.decay) spreadDecay(S, m);
    onKill(S, m, by);
    if (m.boss) {
      emit(S, { t: 'bossDeath', name: m.name, isTrue: m.boss === 'true', x: m.x, y: m.y });
      if (S.seal === m.id) { S.seal = null; if (!S.map.final) emit(S, { t: 'sealBroken' }); }
      if (m.boss === 'true' && S.map.final && !S.trial) completeDifficulty(S, m.x, m.y);
      if (S.trial && S.gateBoss && S.gateBoss[m.id] !== undefined) openGate(S, S.gateBoss[m.id]);
      if (m.boss === 'trial') completeTrial(S, m.x, m.y);
    }
    if (S.trial) {
      for (var tid in S.players) gainXp(S, S.players[tid], m.xp);
      if (m.boss === 'trial') {
        var RW = D.trial.reward, rr = S.rng;
        for (var g3 = 0; g3 < 3; g3++) S.ground.push({ id: S.nextId++, x: m.x + (rnd(rr) - 0.5) * 1.6, y: m.y + (rnd(rr) - 0.5) * 1.6, kind: 'gold', amount: rint(rr, RW.gold[0], RW.gold[1]) });
        for (var k3 = 0; k3 < RW.items; k3++) {
          var it3 = (k3 === 0 && maybeUnique(S, RW.ilvl, D.uniqueRules.trial)) || genItem(S, RW.ilvl, null, RW.rarity);
          S.ground.push({ id: S.nextId++, x: m.x + (rnd(rr) - 0.5) * 1.6, y: m.y + (rnd(rr) - 0.5) * 1.6, kind: 'item', item: it3 });
          emit(S, { t: 'itemdrop', rarity: it3.rarity, x: m.x, y: m.y });
        }
      }
      return;
    }
    for (var id in S.players) gainXp(S, S.players[id], m.xp);
    var r = S.rng;
    function spot() {
      for (var k = 0; k < 8; k++) {
        var x = m.x + (rnd(r) - 0.5) * 1.4, y = m.y + (rnd(r) - 0.5) * 1.4;
        if (canStand(S.map, x, y, 0.15)) return [x, y];
      }
      return [m.x, m.y];
    }
    var s;
    if (rnd(r) < 0.45) { s = spot(); S.ground.push({ id: S.nextId++, x: s[0], y: s[1], kind: 'gold', amount: rint(r, 2, 7) * S.depth * (m.champ ? 3 : 1) }); }
    if (rnd(r) < 0.13) { s = spot(); S.ground.push({ id: S.nextId++, x: s[0], y: s[1], kind: 'potion', pot: rnd(r) < 0.68 ? 'hp' : 'mp' }); }
    var n = rnd(r) < (m.champ ? 0.9 : 0.15) ? 1 : 0, minR = 0, ib = m.champ ? 2 : 0;
    if (m.champ && rnd(r) < 0.45) n++;
    if (m.boss === 'mini') { n = 2; minR = 1; ib = 3; }
    if (m.boss === 'warden') {
      var WR = D.bosses.warden.reward; n = WR.items; minR = WR.minRarity; ib = WR.ilvlBonus;
      if (S.ossuary) S.ossuary.done = true;
      emit(S, { t: 'wardenDown', name: m.name });
      var ilw = S.depth + D.difficulties[S.difficulty].ilvl + ib;
      if (rnd(r) < WR.unique) { n--; s = spot(); var uw = genUnique(S, ilw); S.ground.push({ id: S.nextId++, x: s[0], y: s[1], kind: 'item', item: uw }); emit(S, { t: 'itemdrop', rarity: 3, x: s[0], y: s[1] }); }
      for (var gw = 0; gw < 3; gw++) { s = spot(); S.ground.push({ id: S.nextId++, x: s[0], y: s[1], kind: 'gold', amount: rint(r, WR.gold[0], WR.gold[1]) * S.depth }); }
    }
    if (m.boss === 'true') { n = 4; minR = 2; ib = 4; }
    if (m.boss) for (var g2 = 0; g2 < (m.boss === 'true' ? 4 : 2); g2++) { s = spot(); S.ground.push({ id: S.nextId++, x: s[0], y: s[1], kind: 'gold', amount: rint(r, 10, 20) * S.depth }); }
    for (var i = 0; i < n; i++) {
      var il = S.depth + D.difficulties[S.difficulty].ilvl + ib, UR = D.uniqueRules;
      var it = maybeUnique(S, il, m.boss === 'warden' ? 0 : m.boss === 'true' ? UR.boss : m.boss ? UR.mini : UR.chance) || genItem(S, il, null, minR);
      s = spot(); S.ground.push({ id: S.nextId++, x: s[0], y: s[1], kind: 'item', item: it });
      emit(S, { t: 'itemdrop', rarity: it.rarity, x: s[0], y: s[1] });
    }
  }
  // The Abbot on the last level ends the difficulty for everyone in the game.
  function completeDifficulty(S, x, y) {
    for (var id in S.players) {
      var q = S.players[id], pr = q.progress[S.difficulty];
      pr.done = true;
      if (S.difficulty === 'normal' && q.trial === 'locked') q.trial = 'unlocked';
      q.ver++;
    }
    var kx = x, ky = y;
    for (var k = 0; k < 12; k++) {
      var a = k * 0.52, tx = x + Math.cos(a) * 1.4, ty = y + Math.sin(a) * 1.4;
      if (canStand(S.map, tx, ty, 0.4)) { kx = tx; ky = ty; break; }
    }
    S.npcs.push({ id: S.nextId++, kind: 'keeper', name: D.keeper.name, x: kx, y: ky, face: Math.atan2(y - ky, x - kx) });
    emit(S, { t: 'difficultyDone', difficulty: S.difficulty, name: D.difficulties[S.difficulty].name, x: kx, y: ky });
  }
  function gainXp(S, p, xp) {
    if (p.dead) return;
    p.xp += xp;
    while (p.xp >= xpToNext(p.level)) {
      p.xp -= xpToNext(p.level); p.level++; p.pts += 5;
      refresh(p); p.hp = p.st.maxHp; p.mana = p.st.maxMana;
      emit(S, { t: 'levelup', pid: p.id, level: p.level, x: p.x, y: p.y });
    }
    p.ver++;
  }

  function updateProjectiles(S, dt) {
    for (var i = S.projs.length - 1; i >= 0; i--) {
      var pr = S.projs[i], sp = Math.hypot(pr.vx, pr.vy), n = Math.max(1, Math.ceil(sp * dt / 0.25)), dead = false;
      for (var k = 0; k < n && !dead; k++) {
        if (pr.home) steerSpark(S, pr, dt / n);
        pr.x += pr.vx * dt / n; pr.y += pr.vy * dt / n;
        if (!sightable(S.map, pr.x, pr.y)) { dead = true; emit(S, { t: 'wall', kind: pr.kind, x: pr.x - pr.vx * dt / n, y: pr.y - pr.vy * dt / n }); break; }
        if (pr.from === 'p') {
          for (var j = 0; j < S.monsters.length; j++) {
            var m = S.monsters[j];
            if (pr.hitIds && pr.hitIds.indexOf(m.id) >= 0) continue;
            if (Math.hypot(m.x - pr.x, m.y - pr.y) < m.r + 0.15) {
              hurtMonster(S, m, pr.dmg, pr.light || 0, S.players[pr.owner], pr.kind, pr.dark || 0);
              if (pr.kind === 'spark') sparkHit(S, pr, m);
              if (pr.pierce > 0) { pr.pierce--; pr.hitIds.push(m.id); pr.dmg *= pr.keep; pr.light *= pr.keep; pr.dark *= pr.keep; } else dead = true;
              break;
            }
          }
        } else {
          for (var id in S.players) {
            var p = S.players[id];
            if (!p.dead && Math.hypot(p.x - pr.x, p.y - pr.y) < p.r + 0.18) { hurtPlayer(S, p, pr.dmg, pr.lvl); dead = true; break; }
          }
        }
      }
      pr.life -= dt;
      if (dead || pr.life <= 0) S.projs.splice(i, 1);
    }
  }

  function steerSpark(S, pr, dt) {
    var sp = Math.hypot(pr.vx, pr.vy), ux = pr.vx / sp, uy = pr.vy / sp, best = null, bd = 2.6;
    for (var j = 0; j < S.monsters.length; j++) {
      var m = S.monsters[j]; if (pr.hitIds.indexOf(m.id) >= 0) continue;
      var dx = m.x - pr.x, dy = m.y - pr.y, d = Math.hypot(dx, dy);
      if (d < bd && (dx * ux + dy * uy) > d * 0.5) { bd = d; best = m; }
    }
    if (!best) return;
    var want = Math.atan2(best.y - pr.y, best.x - pr.x), cur = Math.atan2(pr.vy, pr.vx);
    var diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI, turn = Math.max(-5 * dt, Math.min(5 * dt, diff));
    pr.vx = Math.cos(cur + turn) * sp; pr.vy = Math.sin(cur + turn) * sp;
  }
  function sparkHit(S, pr, m) {
    var p = S.players[pr.owner]; if (!p) return;
    if (hasNode(p, 'siphon')) p.mana = Math.min(p.st.maxMana, p.mana + nodeDef('siphon').mana);
    if (pr.prism) {
      var a = Math.atan2(pr.vy, pr.vx), sp = Math.hypot(pr.vx, pr.vy), k = nodeDef('prism').pct;
      [-0.6, 0.6].forEach(function (o) {
        S.projs.push({ id: S.nextId++, kind: 'spark', from: 'p', owner: pr.owner, x: m.x, y: m.y, vx: Math.cos(a + o) * sp, vy: Math.sin(a + o) * sp,
          life: 0.45, dmg: pr.dmg * k, light: (pr.light || 0) * k, dark: (pr.dark || 0) * k, pierce: 0, keep: 0, hitIds: [m.id], home: true, prism: false, small: true });
      });
    }
  }
  function separate(S) {
    var ms = S.monsters;
    for (var i = 0; i < ms.length; i++) for (var j = i + 1; j < ms.length; j++) {
      var a = ms[i], b = ms[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d < min && d > 0.0001) {
        var push = (min - d) / 2 * 0.5, ux = dx / d, uy = dy / d;
        moveEntity(S, a, -ux * push, -uy * push); moveEntity(S, b, ux * push, uy * push);
      }
    }
    for (var id in S.players) {
      var p = S.players[id]; if (p.dead) continue;
      for (var k = 0; k < ms.length; k++) {
        var m = ms[k], ddx = p.x - m.x, ddy = p.y - m.y, dd = Math.hypot(ddx, ddy), mm = p.r + m.r;
        if (dd < mm && dd > 0.0001) moveEntity(S, m, -ddx / dd * (mm - dd), -ddy / dd * (mm - dd));
      }
    }
  }

  function step(S, dt) {
    S.tick++; S.time += dt;
    var q = S.queue; S.queue = [];
    for (var i = 0; i < q.length; i++) handle(S, q[i].pid, q[i].cmd);
    var depth = S.depth;
    for (var id in S.players) { updatePlayer(S, S.players[id], dt); if (S.depth !== depth) return; }
    for (var j = S.monsters.length - 1; j >= 0; j--) updateMonster(S, S.monsters[j], dt);
    separate(S);
    updateProjectiles(S, dt);
    updateHazards(S, dt);
    updateZones(S, dt);
    updateDecay(S, dt);
  }
  // Holy ground from Consecrate: heals everyone standing on it.
  function updateZones(S, dt) {
    if (!S.zones || !S.zones.length) return;
    var pct = nodeDef('consecrate').pct, RN = D.skills.rain;
    for (var i = S.zones.length - 1; i >= 0; i--) {
      var z = S.zones[i];
      if (S.time >= z.end) { S.zones.splice(i, 1); continue; }
      if (z.kind === 'rain') {
        z.tickT += dt; if (z.tickT < RN.tick) continue; z.tickT -= RN.tick;
        var owner = S.players[z.owner] || null;
        S.monsters.slice().forEach(function (m) {
          if (m.dead || Math.hypot(m.x - z.x, m.y - z.y) > z.r + m.r * 0.5) return;
          if (z.slow) { m.slowUntil = S.time + RN.tick + 0.15; m.slowPct = z.slow; }
          dealRaw(S, m, z.dmg, owner, 'dark');
        });
        continue;
      }
      for (var id in S.players) {
        var p = S.players[id];
        if (!p.dead && Math.hypot(p.x - z.x, p.y - z.y) < z.r) p.hp = Math.min(p.st.maxHp, p.hp + p.st.maxHp * (z.pct || pct) * dt);
      }
    }
  }

  return {
    classOf: classOf, canWield: canWield, targetSlot: targetSlot,
    genUnique: genUnique, uniqueDef: uniqueDef, ascPoints: ascPoints, ascUnspent: ascUnspent, rank: rank, nodeVal: nodeVal, skillOf: skillOf, drawFrac: drawFrac, reviveChannel: reviveChannel, chooseAscendancy: chooseAscendancy, takeNode: takeNode, renounce: renounce, renounceCost: renounceCost, hasNode: hasNode,
    SAVE_VERSION: SAVE_VERSION, genTrial: genTrial, applyGates: applyGates, migrateCharacter: migrateCharacter, isUnlocked: isUnlocked, refresh: refresh, applyFinal: applyFinal, themeFor: themeFor,
    createSim: createSim, addPlayer: addPlayer, removePlayer: removePlayer, command: command, step: step, genLevel: genLevel,
    newCharacter: newCharacter, characterOf: characterOf, derive: derive, xpToNext: xpToNext,
    itemName: itemName, baseOf: baseOf, genItem: genItem, findPath: findPath,
    walkable: walkable, sightable: sightable, tileAt: tileAt, damageReduction: damageReduction
  };
})();

if (typeof module !== 'undefined') module.exports = Engine;
