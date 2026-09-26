/* Memory Matrix — the section background as an address space.
   Usage: <canvas class="memory-matrix" data-memory-matrix></canvas> inside a section.

   Every cell is fixed on a grid and never moves; only its state changes.
   State is shown with six shades of one khaki/olive hue:
     0 empty · 1 idle · 2 cached · 3 allocated · 4 read · 5 write
   Activity has structure rather than random noise:
     - working sets: dense regions that drift slowly, cells inside churn read/write
     - row scans: a contiguous run of cells read left → right
     - block alloc/free: a rectangle fills in address order, holds, then frees
     - cursor: a soft lens — nearby cells swell and bulge outward, state untouched */
(function () {
  var SHADES = ['#cfcbb0', '#bdb994', '#a9a67a', '#949364', '#7d8246', '#5e7c14'];
  var ALPHA  = [0.13,      0.32,      0.46,      0.6,       0.74,      0.88];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  function mount(canvas) {
    if (canvas.__mm) return;
    canvas.__mm = true;
    var ctx = canvas.getContext('2d');
    var scope = canvas.parentElement;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var W, H, DPR, PITCH, TILE, cols, rows, ox, oy;
    var level, hold;                 // Float32Array per cell
    var regions = [], scans = [], blocks = [];
    var nextScan = 0, nextBlock = 0, t0 = performance.now(), last = t0, visible = true;
    var cur = { x: 0, y: 0, lx: 0, ly: 0, on: 0, active: false };

    // ---- grid ----------------------------------------------------------------------
    function build() {
      var r = canvas.getBoundingClientRect();
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      PITCH = W < 768 ? 20 : 22; TILE = W < 768 ? 7 : 8;
      cols = Math.floor(W / PITCH); rows = Math.floor(H / PITCH);
      ox = (W - (cols - 1) * PITCH) / 2; oy = (H - (rows - 1) * PITCH) / 2;
      level = new Float32Array(cols * rows);
      hold = new Float32Array(cols * rows);
      scans = []; blocks = [];
      var n = W < 900 ? 1 : 2;
      regions = [];
      for (var k = 0; k < n; k++) {
        regions.push({ ph: k * 2.4 + Math.random(), sp: 0.035 + Math.random() * 0.02, r: Math.min(W, H) * (W < 900 ? 0.2 : 0.16) });
      }
    }
    function idx(i, j) { return (i < 0 || j < 0 || i >= cols || j >= rows) ? -1 : j * cols + i; }
    function set(k, v) { if (k >= 0 && v > level[k]) level[k] = v; }

    // ---- activity sources -------------------------------------------------------------
    function regionCenter(g, e) {
      // slow Lissajous drift, kept inside the viewport
      return {
        x: W * (0.5 + 0.36 * Math.sin(e * g.sp * 2 + g.ph)),
        y: H * (0.5 + 0.32 * Math.sin(e * g.sp * 3 + g.ph * 1.7))
      };
    }
    function workingSets(e, dt) {
      regions.forEach(function (g) {
        var c = regionCenter(g, e);
        var n = Math.round(dt * 150);                         // churn rate (cells/sec)
        for (var q = 0; q < n; q++) {
          var x = c.x + gauss() * g.r * 0.5, y = c.y + gauss() * g.r * 0.42;
          var k = idx(Math.round((x - ox) / PITCH), Math.round((y - oy) / PITCH));
          if (k >= 0 && hold[k] <= 0) level[k] = 1.5 + Math.random() * 3.6;   // state swap: cached/read/write
        }
      });
    }
    function rowScans(e, dt) {
      if (e > nextScan) {
        var len = 10 + Math.floor(Math.random() * 26);
        scans.push({ j: Math.floor(Math.random() * rows), i0: Math.floor(Math.random() * Math.max(1, cols - len)), len: len, t: 0, sp: 26 + Math.random() * 18 });
        nextScan = e + 4 + Math.random() * 4;
      }
      for (var s = scans.length - 1; s >= 0; s--) {
        var sc = scans[s], before = Math.floor(sc.t);
        sc.t += dt * sc.sp;
        for (var i = before; i <= Math.min(sc.len - 1, Math.floor(sc.t)); i++) set(idx(sc.i0 + i, sc.j), 4.3);
        if (sc.t >= sc.len) scans.splice(s, 1);
      }
    }
    function blockAlloc(e, dt) {
      if (e > nextBlock) {
        var bw = 3 + Math.floor(Math.random() * 5), bh = 2 + Math.floor(Math.random() * 3);
        blocks.push({ i0: Math.floor(Math.random() * (cols - bw)), j0: Math.floor(Math.random() * (rows - bh)),
                      w: bw, h: bh, t: 0, holdFor: 1.6 + Math.random() * 2.4, phase: 0 });
        nextBlock = e + 4.6 + Math.random() * 5.4;
      }
      for (var b = blocks.length - 1; b >= 0; b--) {
        var bl = blocks[b], n = bl.w * bl.h;
        bl.t += dt;
        if (bl.phase === 0) {                                  // fill in address order
          var f = Math.min(n, Math.floor(bl.t * 28));
          for (var m = 0; m < f; m++) { var k = idx(bl.i0 + m % bl.w, bl.j0 + Math.floor(m / bl.w)); if (k >= 0) { level[k] = 3; hold[k] = 1; } }
          if (f >= n) { bl.phase = 1; bl.t = 0; }
        } else if (bl.phase === 1) {                           // held (allocated)
          if (bl.t > bl.holdFor) { bl.phase = 2; bl.t = 0; }
        } else {                                               // free in the same order
          var fr = Math.min(n, Math.floor(bl.t * 36));
          for (var m2 = 0; m2 < fr; m2++) { var k2 = idx(bl.i0 + m2 % bl.w, bl.j0 + Math.floor(m2 / bl.w)); if (k2 >= 0) { hold[k2] = 0; level[k2] = Math.min(level[k2], 1.2); } }
          if (fr >= n) blocks.splice(b, 1);
        }
      }
    }
    // ---- render --------------------------------------------------------------------------------
    function step(e, dt) {
      workingSets(e, dt);
      rowScans(e, dt);
      blockAlloc(e, dt);
      for (var k = 0; k < level.length; k++) {
        if (hold[k] > 0) continue;
        if (level[k] > 0) level[k] = Math.max(0, level[k] - dt * 1.7);   // states cool back down
      }
    }
    // cursor lens: cells within LENS px scale up and push outward a little
    var LENS = 100, SWELL = 0.5, PUSH = 5;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      cur.on += ((cur.active ? 1 : 0) - cur.on) * 0.08;          // ease the lens in/out
      cur.lx += (cur.x - cur.lx) * 0.18; cur.ly += (cur.y - cur.ly) * 0.18;
      var lensOn = cur.on > 0.01;
      for (var b = 0; b < 6; b++) {                              // batch by shade → 6 fillStyle changes/frame
        ctx.fillStyle = SHADES[b];
        for (var k = 0; k < level.length; k++) {
          var lv = level[k], s = lv < 0.5 ? 0 : Math.min(5, Math.round(lv));
          if (s !== b) continue;
          var i = k % cols, j = (k - i) / cols;
          var x = ox + i * PITCH, y = oy + j * PITCH, t = TILE, a = ALPHA[s];
          if (lensOn) {
            var dx = x - cur.lx, dy = y - cur.ly, d = Math.hypot(dx, dy);
            if (d < LENS) {
              var f = 1 - d / LENS; f = f * f * (3 - 2 * f) * cur.on;   // smoothstep falloff
              t = TILE * (1 + SWELL * f);
              if (d > 0.5) { x += dx / d * PUSH * f; y += dy / d * PUSH * f; }
              a = Math.min(0.9, a + 0.28 * f);                        // lens reads even on idle cells
            }
          }
          ctx.globalAlpha = a;
          ctx.fillRect(Math.round(x - t / 2), Math.round(y - t / 2), Math.round(t), Math.round(t));
        }
      }
      ctx.globalAlpha = 1;
    }
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (visible) { step((now - t0) / 1000, dt); draw(); }
      requestAnimationFrame(frame);
    }

    // ---- interaction ---------------------------------------------------------------------------------
    scope.addEventListener('pointermove', function (ev) {
      var r = canvas.getBoundingClientRect();
      cur.x = ev.clientX - r.left; cur.y = ev.clientY - r.top;
      if (!cur.active && cur.on < 0.01) { cur.lx = cur.x; cur.ly = cur.y; }   // no swoop in from the last spot
      cur.active = true;
    });
    scope.addEventListener('pointerleave', function () { cur.active = false; });

    build();
    if (reduce) {
      for (var s = 0; s < 120; s++) step(s / 30, 1 / 30);        // settle into a representative still
      draw();
    } else {
      requestAnimationFrame(frame);
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(scope);
      }
    }
    var rt, lw = window.innerWidth;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (window.innerWidth === lw) return;                   // ignore mobile URL-bar jitter
        lw = window.innerWidth; build();
        if (reduce) { for (var s = 0; s < 120; s++) step(s / 30, 1 / 30); draw(); }
      }, 150);
    });
  }

  function init() {
    var list = document.querySelectorAll('[data-memory-matrix]');
    for (var i = 0; i < list.length; i++) mount(list[i]);
  }
  window.MemoryMatrix = { mount: mount, init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
