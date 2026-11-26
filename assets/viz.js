/* amitdu6ey.github.io — live sketches of systems I've worked on.
   Plain canvas + DOM, no libraries. Each sketch pauses off-screen and renders a
   single settled frame under prefers-reduced-motion. */
(() => {
  'use strict';

  // Colours come from the page's CSS custom properties, so light and dark themes stay in sync.
  // c1..c4 = identity (fixed order), ok/bad/warn = status (always paired with a glyph or label).
  const C = {};
  const VARS = {
    paper: '--bg', ink: '--fg', muted: '--muted', rule: '--line', mark: '--mark',
    c1: '--c1', c2: '--c2', c3: '--c3', c4: '--c4', ok: '--ok', bad: '--bad', warn: '--warn'
  };
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    for (const k in VARS) C[k] = cs.getPropertyValue(VARS[k]).trim() || C[k] || '#888';
  }
  readTheme();
  const cat = i => [C.c1, C.c2, C.c3, C.c4][i % 4];
  const redraws = [];

  const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
  const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function report(name, e) {
    const el = document.getElementById('viz-errors');
    if (el) el.textContent += name + ': ' + ((e && e.stack) || e) + '\n';
    if (window.console) console.error('[viz]', name, e);
  }

  /* ---------- drawing helpers ---------- */
  function text(ctx, str, x, y, o = {}) {
    ctx.font = `${o.weight || 400} ${o.size || 11}px ${MONO}`;
    ctx.fillStyle = o.color || C.ink;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.base || 'middle';
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  // Box centred on (cx, cy); optional coloured accent stripe on the left edge.
  function box(ctx, cx, cy, w, h, o = {}) {
    const x = cx - w / 2, y = cy - h / 2;
    rrect(ctx, x, y, w, h, 4);
    ctx.fillStyle = o.fill || C.paper; ctx.fill();
    if (o.accent) {
      ctx.save(); ctx.clip(); ctx.fillStyle = o.accent; ctx.fillRect(x, y, 4, h); ctx.restore();
      rrect(ctx, x, y, w, h, 4);
    }
    ctx.setLineDash(o.dash || []);
    ctx.lineWidth = o.lw || 1.3; ctx.strokeStyle = o.stroke || C.ink; ctx.stroke();
    ctx.setLineDash([]);
  }
  function line(ctx, a, b, o = {}) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.setLineDash(o.dash || []);
    ctx.lineWidth = o.lw || 1; ctx.strokeStyle = o.color || C.rule;
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  function dot(ctx, x, y, r, color, hollow) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    if (hollow) { ctx.lineWidth = 1.6; ctx.strokeStyle = color; ctx.fillStyle = C.paper; ctx.fill(); ctx.stroke(); }
    else { ctx.fillStyle = color; ctx.fill(); }
  }
  function diamond(ctx, x, y, r, color) {
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
  }
  function cross(ctx, x, y, r, color, alpha) {
    ctx.globalAlpha = clamp(alpha == null ? 1 : alpha, 0, 1);
    ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.stroke(); ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }
  // ✓ pass · ✗ fail · amber dot = running · faint dot = not yet
  function checkMark(ctx, x, y, st, r) {
    r = r || 4;
    ctx.beginPath(); ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (st === 'pass') { ctx.strokeStyle = C.ok; ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.3, y + r * 0.75); ctx.lineTo(x + r, y - r * 0.8); ctx.stroke(); }
    else if (st === 'fail') { ctx.strokeStyle = C.bad; ctx.moveTo(x - r * 0.8, y - r * 0.8); ctx.lineTo(x + r * 0.8, y + r * 0.8); ctx.moveTo(x + r * 0.8, y - r * 0.8); ctx.lineTo(x - r * 0.8, y + r * 0.8); ctx.stroke(); }
    else if (st === 'run') dot(ctx, x, y, 3.2, C.warn);
    else dot(ctx, x, y, 2.2, C.rule);
    ctx.lineCap = 'butt';
  }
  function docIcon(ctx, x, y, color) {
    const w = 10, h = 12, f = 3.5;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - h / 2); ctx.lineTo(x + w / 2 - f, y - h / 2); ctx.lineTo(x + w / 2, y - h / 2 + f);
    ctx.lineTo(x + w / 2, y + h / 2); ctx.lineTo(x - w / 2, y + h / 2); ctx.closePath();
    ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = color || C.ink; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.moveTo(x - 2.5, y + 2.6); ctx.lineTo(x + 1.5, y + 2.6);
    ctx.lineWidth = 1.1; ctx.stroke();
  }
  function setText(el, str) { if (el && el.textContent !== str) el.textContent = str; }

  /* ---------- animation plumbing ---------- */
  // Runs step(dt) on rAF while `el` is on screen and the tab is visible.
  function loop(el, step) {
    let raf = 0, last = 0, visible = false, broken = false;
    const running = () => visible && !document.hidden && !REDUCED && !broken;
    function frame(t) {
      raf = 0;
      if (!running()) return;
      const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
      last = t;
      try { step(dt); } catch (e) { broken = true; report(el.id || el.dataset.viz || 'viz', e); return; }
      raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (running() && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; kick(); }, { rootMargin: '120px' }).observe(el);
    } else { visible = true; }
    document.addEventListener('visibilitychange', kick);
    return { kick };
  }

  // DPR-aware canvas that tracks its container width; height comes from opts.height(width).
  function stage(canvas, opts) {
    const ctx = canvas.getContext('2d');
    const s = { canvas, ctx, w: 0, h: 0 };
    let lastW = -1, broken = false;
    const draw = () => {
      if (broken || !s.w) return;
      try { opts.render(s); } catch (e) { broken = true; report(canvas.id, e); }
    };
    function resize() {
      const w = Math.round(canvas.parentElement.getBoundingClientRect().width);
      if (!w || w === lastW) return;
      lastW = w;
      const h = opts.height(w), dpr = Math.min(window.devicePixelRatio || 1, 2);
      s.w = w; s.h = h;
      canvas.style.height = h + 'px';
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    const tick = dt => { if (s.w) opts.step(dt, s); };
    const lp = loop(canvas, dt => { tick(dt); draw(); });
    s.draw = draw;
    redraws.push(draw);
    s.advance = sec => { for (let i = 0; i < sec * 30; i++) tick(1 / 30); draw(); };
    s.poke = () => { if (REDUCED) s.advance(2.5); else { lp.kick(); draw(); } };
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas.parentElement);
    else window.addEventListener('resize', resize);
    resize();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    if (REDUCED) s.advance(opts.warm || 6);
    return s;
  }

  /* =====================================================================
     1. Kafka: partitions → consumer group → membership recompute
     ===================================================================== */
  function kafka(root) {
    const canvas = root.querySelector('canvas'), out = root.querySelector('[data-status]');
    const P = 4, SVC = 0.27, RATE = 6, COLS = 12, ROWS = 8, MAXC = 4;
    let k = 2, rebalance = 0, acc = 0, burst = 0, applied = 0, gen = 1, auto = true, autoT = 0, g = null, s;
    const lanes = Array.from({ length: P }, () => ({ q: [], off: 1000 + ((Math.random() * 900) | 0) }));
    const cons = Array.from({ length: MAXC }, () => ({ busy: null, rr: 0 }));
    const cells = Array.from({ length: COLS * ROWS }, () => ({ on: Math.random() < 0.45, p: (Math.random() * P) | 0, flash: 0 }));
    let incoming = [], outgoing = [];

    function geo(st) {
      const w = st.w, h = st.h, top = 38, bot = h - 10;
      const lh = Math.min(28, (bot - top) / P - 14), lg = (bot - top - lh * P) / (P - 1);
      const l0 = Math.max(46, w * 0.13), l1 = w * 0.56;
      const cw = clamp(w * 0.09, 36, 64), cx = w * 0.645;
      const gx1 = w - 8, cell = Math.min((gx1 - w * 0.745) / COLS, (bot - top) / ROWS);
      const gw = cell * COLS, gh = cell * ROWS;
      const ch = Math.min(42, (bot - top - (k - 1) * 8) / k);
      const c0 = top + (bot - top - (k * ch + (k - 1) * 8)) / 2;
      return {
        w, h, top, bot, lh, lg, l0, l1, cw, cx, ch, cell, bw: 7,
        gx0: gx1 - gw, gy0: top + (bot - top - gh) / 2,
        laneY: p => top + p * (lh + lg),
        consY: c => c0 + c * (ch + 8) + ch / 2,
        cap: Math.max(1, Math.floor((l1 - l0 - 6) / 9))
      };
    }
    function setK(n) {
      n = clamp(n, 1, MAXC);
      if (n === k) return;
      for (let c = n; c < k; c++) {
        const b = cons[c].busy;
        if (b) { lanes[b.p].q.unshift({ x: g ? g.l1 - 12 : 0 }); cons[c].busy = null; } // uncommitted → redelivered
      }
      k = n; rebalance = 0.9; gen++;
    }
    const SCRIPT = [[5, () => setK(1)], [13, () => setK(3)], [20, () => { burst = 0.6; }], [26, () => setK(2)]];

    function step(dt, st) {
      g = geo(st);
      if (auto) {
        const prev = autoT; autoT = (autoT + dt) % 30;
        for (const [t, f] of SCRIPT) if (prev < t && autoT >= t) f();
      }
      const lag = lanes.reduce((a, l) => a + l.q.length, 0) + incoming.length;
      acc += dt * (RATE + (burst > 0 ? 45 : 0)); burst = Math.max(0, burst - dt);
      while (acc >= 1) {
        acc -= 1;
        if (lag < 150) incoming.push({ p: (Math.random() * P) | 0, y0: rnd(g.top, g.bot), t: 0 }); // p = hash(key) % P
      }
      for (const e of incoming) {
        e.t += dt / 0.7;
        if (e.t >= 1) { e.done = true; lanes[e.p].q.push({ x: g.l0 + 2 }); }
      }
      incoming = incoming.filter(e => !e.done);
      for (const l of lanes) l.q.forEach((it, i) => {
        const tx = Math.max(g.l1 - 3 - g.bw - i * (g.bw + 2), g.l0 + 2);
        it.x += (tx - it.x) * Math.min(1, dt * 10);
      });
      rebalance = Math.max(0, rebalance - dt);
      for (let c = 0; c < k; c++) {
        const cs = cons[c];
        if (cs.busy && (cs.busy.t += dt / SVC) >= 1) {
          outgoing.push({ c, p: cs.busy.p, cell: (Math.random() * cells.length) | 0, t: 0 });
          cs.busy = null;
        }
        if (!cs.busy && rebalance === 0) {
          for (let j = 0; j < P; j++) {
            const p = (cs.rr + j) % P, q = lanes[p].q;
            if (p % k === c && q.length && q[0].x > g.l1 - g.bw - 10) { q.shift(); cs.busy = { t: 0, p }; cs.rr = p + 1; break; }
          }
        }
      }
      for (const o of outgoing) {
        o.t += dt / 0.5;
        if (o.t >= 1) {
          o.done = true;
          const cl = cells[o.cell]; cl.on = Math.random() < 0.55; cl.p = o.p; cl.flash = 1;
          lanes[o.p].off++; applied++; // offset committed after the membership write
        }
      }
      outgoing = outgoing.filter(o => !o.done);
      for (const cl of cells) cl.flash = Math.max(0, cl.flash - dt * 1.4);
    }

    function render(st) {
      g = geo(st);
      const { ctx, w, h } = st, narrow = w < 560;
      ctx.clearRect(0, 0, w, h);
      const cap = { size: 10, color: C.muted };
      text(ctx, narrow ? 'in' : 'events', g.l0 / 2 + 2, 12, cap);
      text(ctx, narrow ? 'topic' : `topic · ${P} partitions`, (g.l0 + g.l1) / 2, 12, cap);
      text(ctx, rebalance > 0 ? (narrow ? 'rebal…' : 'rebalancing…') : narrow ? 'group' : 'consumers', g.cx, 12, cap);
      text(ctx, narrow ? 'members' : 'audiences', g.gx0 + (g.cell * COLS) / 2, 12, cap);

      for (let p = 0; p < P; p++) {
        const y = g.laneY(p) + g.lh / 2, c = p % k;
        line(ctx, [g.l1, y], [g.cx - g.cw / 2, g.consY(c)],
          rebalance > 0 ? { color: C.warn, dash: [4, 3], lw: 1.6 } : { color: cat(p), lw: 1.4, alpha: 0.7 });
      }

      for (let p = 0; p < P; p++) {
        const y = g.laneY(p), q = lanes[p].q, col = cat(p);
        rrect(ctx, g.l0, y, g.l1 - g.l0, g.lh, 4);
        ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = C.ink; ctx.stroke();
        dot(ctx, g.l0 - 22, y + g.lh / 2, 3.5, col);
        text(ctx, 'p' + p, g.l0 - 7, y + g.lh / 2, { size: 10, align: 'right' });
        text(ctx, `offset ${lanes[p].off.toLocaleString('en-US')} · lag ${q.length}`, g.l1, y - 7, { size: 9, align: 'right', color: C.muted });
        ctx.fillStyle = col;
        const n = Math.min(q.length, g.cap);
        for (let i = 0; i < n; i++) ctx.fillRect(q[i].x, y + 5, g.bw, g.lh - 10);
        if (q.length > g.cap) {
          const label = '+' + (q.length - g.cap);
          ctx.fillStyle = C.paper; ctx.fillRect(g.l0 + 2, y + 3, label.length * 6.4 + 6, g.lh - 6);
          text(ctx, label, g.l0 + 5, y + g.lh / 2, { size: 10, align: 'left', weight: 600 });
        }
      }

      for (const e of incoming) {
        const t = ease(Math.min(1, e.t));
        const x = lerp(6, g.l0 + 2, t), y = lerp(e.y0, g.laneY(e.p) + g.lh / 2, t);
        ctx.fillStyle = cat(e.p); ctx.fillRect(x, y - 3, 6, 6);
      }
      for (const o of outgoing) {
        const cl = o.cell, gx = g.gx0 + (cl % COLS) * g.cell + g.cell / 2, gy = g.gy0 + ((cl / COLS) | 0) * g.cell + g.cell / 2;
        const t = ease(Math.min(1, o.t));
        dot(ctx, lerp(g.cx + g.cw / 2, gx, t), lerp(g.consY(o.c), gy, t), 3, cat(o.p));
      }

      for (let c = 0; c < k; c++) {
        const y = g.consY(c), b = cons[c].busy, x0 = g.cx - g.cw / 2;
        box(ctx, g.cx, y, g.cw, g.ch, { dash: rebalance > 0 ? [3, 3] : [] });
        let tab = 0;
        for (let p = 0; p < P; p++) if (p % k === c) { ctx.fillStyle = cat(p); ctx.fillRect(x0 + 5 + tab * 9, y - g.ch / 2 + 4, 7, 3); tab++; }
        text(ctx, 'c' + (c + 1), g.cx, y - (g.ch > 26 ? 2 : 0), { size: 10.5, weight: 600 });
        if (b) {
          const by = g.ch > 26 ? y + 10 : y + g.ch / 2 - 4;
          ctx.fillStyle = C.mark; ctx.fillRect(x0 + 6, by, g.cw - 12, 3);
          ctx.fillStyle = cat(b.p); ctx.fillRect(x0 + 6, by, (g.cw - 12) * clamp(b.t, 0, 1), 3);
        }
      }

      const sz = g.cell - 2;
      cells.forEach((cl, i) => {
        const x = g.gx0 + (i % COLS) * g.cell + 1, y = g.gy0 + ((i / COLS) | 0) * g.cell + 1;
        if (cl.on) { ctx.fillStyle = cat(cl.p); ctx.fillRect(x, y, sz, sz); }
        else { ctx.lineWidth = 1; ctx.strokeStyle = C.rule; ctx.strokeRect(x + 0.5, y + 0.5, sz - 1, sz - 1); }
        if (cl.flash > 0) { ctx.globalAlpha = cl.flash; ctx.lineWidth = 1.5; ctx.strokeStyle = C.ink; ctx.strokeRect(x - 0.5, y - 0.5, sz + 1, sz + 1); ctx.globalAlpha = 1; }
      });

      const lag = lanes.reduce((a, l) => a + l.q.length, 0);
      setText(out, `consumers ${k} · lag ${lag} event${lag === 1 ? '' : 's'} · ${applied.toLocaleString('en-US')} memberships recomputed · generation ${gen}` +
        (rebalance > 0 ? ' · rebalancing' : ''));
    }

    s = stage(canvas, { height: w => (w < 560 ? 250 : 270), step, render, warm: 8 });
    const user = f => () => { auto = false; f(); s.poke(); };
    root.querySelector('[data-act="add"]').addEventListener('click', user(() => setK(k + 1)));
    root.querySelector('[data-act="remove"]').addEventListener('click', user(() => setK(k - 1)));
  }

  /* =====================================================================
     2. Notifications: idempotency keys + per-channel circuit breakers + digest
     ===================================================================== */
  function breaker(root) {
    const canvas = root.querySelector('canvas'), out = root.querySelector('[data-status]');
    const btn = root.querySelector('[data-act="fail"]');
    const OPEN_FOR = 2.8, WIN = 6, TRIP = 3, DUR = [0.5, 0.5, 0.45, 0.35, 0.65];
    let failing = false, auto = true, autoT = 0, acc = 0, seq = 0, dups = 0, delivered = 0, digest = 0, g = null, s;
    let pk = [], later = [], fx = [], seen = new Set(), keys = [], hits = {};
    const ch = [
      { name: 'mobile', state: 'closed', win: [], openT: 0, probe: false },
      { name: 'desktop', state: 'closed', win: [], openT: 0, probe: false }
    ];
    const chColor = c => cat(c === 0 ? 0 : 1);

    function geo(st) {
      const w = st.w, h = st.h, bw = clamp(w * 0.14, 62, 104), bh = 30, bkh = 40;
      const sx = 6 + bw / 2, dx = w - 6 - bw / 2, bx = w * 0.58;
      return {
        w, h, bw, bh, bkh,
        src: [sx, h * 0.47], ded: [w * 0.32, h * 0.47],
        brk: [[bx, h * 0.24], [bx, h * 0.72]],
        dev: [[dx, h * 0.24], [dx, h * 0.72]],
        dig: [(bx + dx) / 2, h * 0.48]
      };
    }
    function ends(p) {
      switch (p.seg) {
        case 0: return [g.src, g.ded];
        case 1: return [g.ded, g.brk[p.c]];
        case 2: return [g.brk[p.c], g.dev[p.c]];
        case 3: return [g.brk[p.c], g.dig];
        default: return [g.dig, g.dev[0]];
      }
    }
    function setFailing(v) {
      failing = v;
      btn.setAttribute('aria-pressed', String(v));
      btn.textContent = v ? 'recover mobile provider' : 'fail mobile provider';
    }
    function trip(c) { c.state = 'open'; c.openT = OPEN_FOR; c.win = []; c.probe = false; }
    function close(c) {
      c.state = 'closed'; c.win = [];
      if (c === ch[0] && digest > 0) { later.push({ kind: 'sum', n: digest, c: 0, seg: 4, t: 0 }); digest = 0; }
    }
    function record(c, ok, probe) {
      if (c.state === 'half' && probe) { c.probe = false; if (ok) close(c); else trip(c); return; }
      if (c.state !== 'closed') return;
      c.win.push(ok); if (c.win.length > WIN) c.win.shift();
      if (c.win.filter(x => !x).length >= TRIP) trip(c);
    }
    function arrive(p) {
      const c = ch[p.c];
      if (p.seg === 0) {
        if (seen.has(p.id)) { dups++; hits[p.id] = 0.9; fx.push({ kind: 'dup', x: g.ded[0], y: g.ded[1] - g.bh / 2 - 8, t: 0 }); return false; }
        seen.add(p.id); keys.push(p.id); if (keys.length > 4) keys.shift();
        if (seen.size > 400) seen = new Set([...seen].slice(-200));
        p.seg = 1; p.t = 0; return true;
      }
      if (p.seg === 1) {
        if (c.state === 'open' || (c.state === 'half' && c.probe)) { p.seg = 3; p.t = 0; return true; }
        if (c.state === 'half') { c.probe = true; p.kind = 'probe'; }
        p.seg = 2; p.t = 0; return true;
      }
      if (p.seg === 2) {
        const ok = !(p.c === 0 && failing);
        if (ok) delivered++;
        else fx.push({ kind: 'fail', x: g.dev[p.c][0] - g.bw / 2 - 9, y: g.dev[p.c][1], t: 0 });
        record(c, ok, p.kind === 'probe');
        return false;
      }
      if (p.seg === 3) { digest++; return false; }
      delivered++; return false;
    }

    function step(dt, st) {
      g = geo(st);
      if (auto) {
        autoT = (autoT + dt) % 18;
        const want = autoT > 4 && autoT < 11;
        if (want !== failing) setFailing(want);
      }
      acc += dt * 3.2;
      while (acc >= 1) {
        acc -= 1;
        const id = keys.length > 2 && Math.random() < 0.16 ? keys[(Math.random() * keys.length) | 0] : ++seq; // retry reuses its key
        pk.push({ id, c: Math.random() < 0.6 ? 0 : 1, seg: 0, t: 0, kind: 'msg' });
      }
      for (const c of ch) if (c.state === 'open' && (c.openT -= dt) <= 0) { c.state = 'half'; c.probe = false; }
      pk = pk.filter(p => { p.t += dt / DUR[p.seg]; return p.t < 1 || arrive(p); });
      if (later.length) { pk = pk.concat(later); later = []; }
      for (const f of fx) f.t += dt;
      fx = fx.filter(f => f.t < 0.9);
      for (const id in hits) { hits[id] -= dt; if (hits[id] <= 0) delete hits[id]; }
    }

    const STATE = { closed: ['closed', 'ok'], open: ['open', 'bad'], half: ['half-open', 'warn'] };

    function render(st) {
      g = geo(st);
      const { ctx, w, h } = st;
      ctx.clearRect(0, 0, w, h);

      line(ctx, g.src, g.ded, { color: C.muted });
      for (let i = 0; i < 2; i++) {
        line(ctx, g.ded, g.brk[i], { color: chColor(i), lw: 1.4, alpha: 0.6 });
        line(ctx, g.brk[i], g.dev[i], { color: chColor(i), lw: 1.4, alpha: 0.6, dash: ch[i].state === 'open' ? [2, 4] : [] });
      }
      line(ctx, g.brk[0], g.dig, { color: C.muted, dash: [3, 3] });
      line(ctx, g.dig, g.dev[0], { color: C.muted, dash: [3, 3] });

      for (const p of pk) {
        const [a, b] = ends(p), t = Math.min(1, p.t), x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t);
        if (p.kind === 'probe') diamond(ctx, x, y, 5.5, C.warn);
        else if (p.kind === 'sum') {
          ctx.fillStyle = chColor(0); ctx.fillRect(x - 6, y - 6, 12, 12);
          text(ctx, 'Σ' + p.n, x + 10, y, { size: 10.5, align: 'left', weight: 600 });
        } else dot(ctx, x, y, 4, chColor(p.c));
      }

      box(ctx, g.src[0], g.src[1], g.bw, g.bh);
      text(ctx, 'requests', g.src[0], g.src[1], { size: 10.5 });

      box(ctx, g.ded[0], g.ded[1], g.bw, g.bh + 6);
      text(ctx, 'dedupe', g.ded[0], g.ded[1] - 6, { size: 10.5, weight: 600 });
      text(ctx, 'idempotency', g.ded[0], g.ded[1] + 7, { size: 8.5, color: C.muted });
      // recently seen idempotency keys; a retry that hits one is underlined in red
      const ky = g.ded[1] + g.bh / 2 + 15, kw = 30, kx0 = g.ded[0] - ((keys.length - 1) * kw) / 2;
      keys.forEach((id, i) => {
        const x = kx0 + i * kw;
        text(ctx, '#' + id, x, ky, { size: 9, color: hits[id] ? C.ink : C.muted, weight: hits[id] ? 600 : 400 });
        if (hits[id]) { ctx.fillStyle = C.bad; ctx.globalAlpha = clamp(hits[id] / 0.9, 0, 1); ctx.fillRect(x - 11, ky + 7, 22, 2); ctx.globalAlpha = 1; }
      });
      text(ctx, 'seen keys', g.ded[0], ky + 17, { size: 8.5, color: C.muted });

      for (let i = 0; i < 2; i++) {
        const c = ch[i], [x, y] = g.brk[i], [lab, tone] = STATE[c.state], col = C[tone];
        box(ctx, x, y, g.bw, g.bkh, { stroke: c.state === 'closed' ? C.ink : col, lw: c.state === 'closed' ? 1.3 : 2.2 });
        text(ctx, 'breaker', x, y - 8, { size: 9.5, color: C.muted });
        const tw = lab.length * 6 + 10;
        dot(ctx, x - tw / 2 + 3, y + 8, 3.6, col);
        text(ctx, lab, x - tw / 2 + 10, y + 8, { size: 10, align: 'left', weight: 600 });
        const sw = 6, sg = 2, wx = x - (WIN * (sw + sg) - sg) / 2, wy = y + g.bkh / 2 + 5;
        for (let j = 0; j < WIN; j++) {
          const r = c.win[j];
          if (r === undefined) { ctx.lineWidth = 1; ctx.strokeStyle = C.rule; ctx.strokeRect(wx + j * (sw + sg) + 0.5, wy + 0.5, sw - 1, sw - 1); }
          else { ctx.fillStyle = r ? C.ok : C.bad; ctx.fillRect(wx + j * (sw + sg), wy, sw, sw); }
        }
        if (c.state === 'open') text(ctx, `probe in ${c.openT.toFixed(1)}s`, x, y - g.bkh / 2 - 9, { size: 9.5, color: C.muted });

        const [dx, dy] = g.dev[i], down = i === 0 && failing;
        box(ctx, dx, dy, g.bw, g.bh, { stroke: down ? C.bad : C.ink, dash: down ? [4, 3] : [], accent: chColor(i), lw: down ? 1.8 : 1.3 });
        text(ctx, c.name, dx + 2, dy, { size: 10.5, weight: 600 });
        if (down) text(ctx, w < 560 ? 'down' : 'provider down', dx, dy + g.bh / 2 + 10, { size: 9.5, color: C.muted });
      }

      box(ctx, g.dig[0], g.dig[1], Math.max(50, g.bw * 0.8), g.bh, { dash: digest ? [] : [3, 3], accent: digest ? chColor(0) : null, stroke: digest ? C.ink : C.rule });
      text(ctx, 'digest', g.dig[0] + 2, g.dig[1], { size: 10, color: digest ? C.ink : C.muted, weight: digest ? 600 : 400 });
      if (digest) text(ctx, `${digest} held`, g.dig[0], g.dig[1] + g.bh / 2 + 10, { size: 9.5, color: C.muted });

      for (const f of fx) {
        const a = 1 - f.t / 0.9;
        if (f.kind === 'dup') {
          text(ctx, 'dup', f.x - 5, f.y - f.t * 14, { size: 10, color: C.ink, alpha: a, weight: 600 });
          cross(ctx, f.x + 12, f.y - f.t * 14, 3, C.bad, a);
        } else cross(ctx, f.x, f.y, 4.5, C.bad, a);
      }

      const m = ch[0];
      setText(out, `mobile breaker ${STATE[m.state][0]}${m.state === 'open' ? ` (probe in ${m.openT.toFixed(1)}s)` : ''} · ` +
        `${dups} duplicate${dups === 1 ? '' : 's'} suppressed · ${digest} held for digest · ${delivered} delivered`);
    }

    s = stage(canvas, { height: w => (w < 560 ? 250 : 262), step, render, warm: 7 });
    btn.addEventListener('click', () => { auto = false; setFailing(!failing); s.poke(); });
  }

  /* =====================================================================
     3. Pact: consumer contracts → broker → provider verification → can-i-deploy
     ===================================================================== */
  function pact(root) {
    const canvas = root.querySelector('canvas'), out = root.querySelector('[data-status]'), btn = root.querySelector('[data-act="break"]');
    const CONS = [
      { name: 'mobile app', short: 'mobile', ver: 12, q: 'notifications{title,channel}', title: true },
      { name: 'desktop app', short: 'desktop', ver: 8, q: 'notifications{title,priority}', title: true },
      { name: 'digest job', short: 'digest', ver: 5, q: 'digest{summary,count}', title: false }
    ];
    const NC = CONS.length, NCOL = 4, VSLOT = 0.65;
    const ORDER = ['publish', 'fetch', 'verify', 'results', 'gate', 'hold'];
    const DUR = { publish: 1.3, fetch: 1.0, verify: NC * VSLOT, results: 0.95, gate: 0.9, hold: 2.0 };
    const BENIGN = ['internal refactor', 'new optional field readAt', 'resolver caching'];
    let pv = 41, change = 'baseline', breaking = false, prevBroken = false, wantBreak = false, auto = true, builds = 0, first = true;
    let cols = [38, 39, 40, 41].map(v => ({ v, cells: ['pass', 'pass', 'pass'] }));
    let phase = '', pt = 0, pk = [], verify = [null, null, null], gate = null, published = [], s;
    const result = i => (breaking && CONS[i].title ? 'fail' : 'pass');
    function setBtn() {
      btn.setAttribute('aria-pressed', String(wantBreak));
      btn.textContent = wantBreak ? 'breaking change queued…' : 'ship a breaking change';
    }
    function enter(ph) {
      phase = ph; pt = 0;
      if (ph === 'publish') {
        published = first ? [0, 1, 2] : Math.random() < 0.55 ? [(Math.random() * NC) | 0] : [];
        if (!first) published.forEach(i => { CONS[i].ver++; });
        first = false;
        published.forEach(i => pk.push({ dir: 'pub', i, t: 0 }));
      } else if (ph === 'fetch') {
        pv++; builds++;
        breaking = wantBreak || (auto && !prevBroken && builds % 4 === 3);
        change = breaking ? 'renamed title → heading' : prevBroken ? 'added heading, kept title' : BENIGN[builds % BENIGN.length];
        wantBreak = false; setBtn();
        cols.push({ v: pv, cells: ['pending', 'pending', 'pending'] });
        if (cols.length > NCOL) cols.shift();
        verify = [null, null, null]; gate = null;
        for (let i = 0; i < NC; i++) pk.push({ dir: 'fetch', i, t: 0 });
      } else if (ph === 'results') {
        for (let i = 0; i < NC; i++) { verify[i] = result(i); pk.push({ dir: 'res', i, t: 0, ok: verify[i] === 'pass' }); }
      } else if (ph === 'gate') {
        const bad = CONS.filter((_, i) => verify[i] !== 'pass').map(c => c.short);
        gate = { ok: !bad.length, bad }; prevBroken = !gate.ok;
      }
    }
    function step(dt) {
      pt += dt;
      if (phase === 'verify') {
        const k = Math.floor(pt / VSLOT);
        for (let i = 0; i < NC; i++) verify[i] = i < k ? result(i) : i === k ? 'run' : null;
      }
      for (const p of pk) {
        p.t += dt / 0.8;
        if (p.t >= 1 && !p.done) { p.done = true; if (p.dir === 'res') cols[cols.length - 1].cells[p.i] = p.ok ? 'pass' : 'fail'; }
      }
      pk = pk.filter(p => !p.done);
      if (pt >= DUR[phase]) enter(ORDER[(ORDER.indexOf(phase) + 1) % ORDER.length]);
    }

    function geo(st) {
      const w = st.w, h = st.h;
      if (w >= 640) {
        const rows = [0.28, 0.5, 0.72].map(f => h * f);
        const cw = clamp(w * 0.18, 100, 140), cx = 8 + cw / 2;
        const bx0 = w * 0.27, bx1 = w * 0.56, px0 = w * 0.62, px1 = w - 8;
        return {
          wide: true, rows, cw, cx, bx0, bx1, by0: 10, by1: rows[2] + 24, px0, px1, ph0: 10, phh: 40,
          colX: j => bx0 + 80 + j * ((bx1 - bx0 - 94) / (NCOL - 1)), headY: rows[0] - 30, titleY: 26,
          lineY: i => rows[i], gateY: h - 26,
          pub: i => [[cx + cw / 2, rows[i]], [bx0, rows[i]]],
          fetch: i => [[bx1, rows[i]], [px0, rows[i]]]
        };
      }
      const cwn = (w - 32) / 3, cxs = [0, 1, 2].map(i => 8 + cwn / 2 + i * (cwn + 8));
      const by0 = 62, by1 = 172, py0 = 196;
      return {
        wide: false, cxs, cwn, bx0: 8, bx1: w - 8, by0, by1, px0: 8, px1: w - 8, ph0: py0, phh: 38,
        rows: [0, 1, 2].map(i => by0 + 56 + i * 22),
        colX: j => 100 + j * ((w - 30 - 100) / (NCOL - 1)), headY: by0 + 32, titleY: by0 + 14,
        lineY: i => py0 + 56 + i * 21, gateY: py0 + 134,
        pub: i => [[cxs[i], 26 + 17], [cxs[i], by0]],
        fetch: i => [[cxs[i], by1], [cxs[i], py0]]
      };
    }

    function render(st) {
      const g = geo(st), { ctx, w, h } = st;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < NC; i++) {
        const [a, b] = g.pub(i), [c, d] = g.fetch(i);
        line(ctx, a, b, { color: cat(i), alpha: 0.45, lw: 1.2 }); line(ctx, c, d, { color: cat(i), alpha: 0.45, lw: 1.2 });
      }

      for (const p of pk) {
        const [a, b] = p.dir === 'pub' ? g.pub(p.i) : g.fetch(p.i);
        const [from, to] = p.dir === 'res' ? [b, a] : [a, b];
        const t = ease(Math.min(1, p.t)), off = p.dir === 'res' ? 7 : 0;
        const x = lerp(from[0], to[0], t) + (g.wide ? 0 : off), y = lerp(from[1], to[1], t) + (g.wide ? off : 0);
        if (p.dir === 'res') dot(ctx, x, y, 3.6, p.ok ? C.ok : C.bad); else docIcon(ctx, x, y, cat(p.i));
      }

      CONS.forEach((c, i) => {
        const x = g.wide ? g.cx : g.cxs[i], y = g.wide ? g.rows[i] : 26, bw = g.wide ? g.cw : g.cwn;
        const pub = phase === 'publish' && published.includes(i);
        box(ctx, x, y, bw, 34, { lw: pub ? 1.9 : 1.3, accent: cat(i), stroke: pub ? cat(i) : C.ink });
        text(ctx, g.wide ? c.name : c.short, x + 2, y - 6, { size: 11, weight: 600 });
        text(ctx, 'v' + c.ver + (pub ? ' · publish' : ''), x + 2, y + 8, { size: 9.5, color: C.muted });
      });

      rrect(ctx, g.bx0, g.by0, g.bx1 - g.bx0, g.by1 - g.by0, 5);
      ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = C.ink; ctx.stroke();
      text(ctx, 'pact broker', g.bx0 + 10, g.titleY, { size: 10, align: 'left', weight: 600 });
      text(ctx, 'provider →', g.bx1 - 10, g.titleY, { size: 9.5, align: 'right', color: C.muted });
      cols.forEach((col, j) => {
        const x = g.colX(j + NCOL - cols.length), last = j === cols.length - 1;
        if (last) { ctx.fillStyle = C.mark; ctx.fillRect(x - 14, g.headY - 10, 28, g.rows[2] - g.headY + 22); }
        text(ctx, 'v' + col.v, x, g.headY, { size: 10, color: last ? C.ink : C.muted, weight: last ? 600 : 400 });
        col.cells.forEach((stt, i) => {
          const y = g.rows[i], r = 7.5;
          rrect(ctx, x - r, y - r, 2 * r, 2 * r, 3);
          if (stt === 'pending') { ctx.lineWidth = 1; ctx.strokeStyle = C.rule; ctx.stroke(); return; }
          ctx.fillStyle = stt === 'pass' ? C.ok : C.bad; ctx.fill();
          ctx.beginPath(); ctx.lineWidth = 1.8; ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
          if (stt === 'pass') { ctx.moveTo(x - 3.5, y); ctx.lineTo(x - 1, y + 2.8); ctx.lineTo(x + 3.8, y - 3); }
          else { ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); }
          ctx.stroke(); ctx.lineCap = 'butt';
        });
      });
      CONS.forEach((c, i) => {
        dot(ctx, g.bx0 + 13, g.rows[i], 3.5, cat(i));
        text(ctx, c.short, g.bx0 + 21, g.rows[i], { size: 10, align: 'left' });
      });

      const broken = breaking && phase !== 'publish';
      rrect(ctx, g.px0, g.ph0, g.px1 - g.px0, g.phh, 5);
      ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = broken ? 1.9 : 1.3; ctx.strokeStyle = broken ? C.bad : C.ink; ctx.stroke();
      text(ctx, 'notification api', g.px0 + 10, g.ph0 + 13, { size: 11, weight: 600, align: 'left' });
      text(ctx, 'v' + pv, g.px1 - 10, g.ph0 + 13, { size: 10.5, align: 'right', weight: 600 });
      text(ctx, change, g.px0 + 10, g.ph0 + 28, { size: 9.5, align: 'left', color: C.muted });
      if (!g.wide) text(ctx, 'verify', g.px0 + 2, g.lineY(0) - 20, { size: 9.5, align: 'left', color: C.muted });
      for (let i = 0; i < NC; i++) {
        const y = g.lineY(i), x = g.px0 + (g.wide ? 14 : 8), v = verify[i];
        checkMark(ctx, x, y, v || 'none');
        const q = v === 'fail' ? 'expected title, got heading' : CONS[i].q;
        text(ctx, (g.wide ? '' : CONS[i].short + ' · ') + q, x + 11, y, { size: 10, align: 'left', color: v ? C.ink : C.muted });
      }

      const gx = (g.px0 + g.px1) / 2, gw = g.px1 - g.px0;
      box(ctx, gx, g.gateY, gw, 28, gate ? { stroke: gate.ok ? C.ok : C.bad, lw: 1.9 } : { stroke: C.rule, dash: [3, 3] });
      if (gate) checkMark(ctx, g.px0 + 14, g.gateY, gate.ok ? 'pass' : 'fail');
      text(ctx, gate ? (gate.ok ? `can-i-deploy: ship v${pv}` : `can-i-deploy: blocked (${gate.bad.join(', ')})`) : 'can-i-deploy: waiting for results',
        g.px0 + (gate ? 25 : 10), g.gateY, { size: 10.5, align: 'left', weight: gate ? 600 : 400, color: gate ? C.ink : C.muted });

      const k = Math.min(NC - 1, Math.floor(pt / VSLOT));
      const verdict = gate && (gate.ok ? `v${pv} satisfies every consumer → safe to deploy` : `v${pv} would break ${gate.bad.join(' and ')} → release blocked`);
      setText(out, {
        publish: published.length ? `${published.map(i => CONS[i].name + ' v' + CONS[i].ver).join(', ')} publishes an updated contract` : 'no consumer changes · contracts already in the broker',
        fetch: `provider build v${pv} (${change}) fetches every consumer's contract`,
        verify: `replaying ${CONS[k].name} interactions against provider v${pv}`,
        results: 'publishing verification results to the broker',
        gate: verdict, hold: verdict
      }[phase] || '');
    }

    enter('publish');
    s = stage(canvas, { height: w => (w >= 640 ? 300 : 370), step, render, warm: 9 });
    btn.addEventListener('click', () => { auto = false; wantBreak = true; setBtn(); s.poke(); });
  }

  /* =====================================================================
     4. Agentic dev harness: plan → spin up → test → fix → re-test → ship
     ===================================================================== */
  function harness(root) {
    const canvas = root.querySelector('canvas'), term = root.querySelector('[data-term]'), out = root.querySelector('[data-status]');
    const pills = [...root.querySelectorAll('.loop li')];
    const DEPS = [
      { name: 'kafka', fail: 'e2e digest.feature:14 · no event on notify.digest in 5s', why: 'digest consumer never subscribed to notify.digest', fix: 'subscribe the digest consumer to notify.digest' },
      { name: 'mongodb', fail: 'contract prefs · duplicate key on userId', why: 'a retried request inserts the preference twice', fix: 'upsert keyed by the idempotency key' },
      { name: 'redis', fail: 'e2e prefs.feature:22 · stale value after update', why: 'cache entry not evicted on write', fix: 'evict the cache entry on write' },
      { name: 'aws sim', fail: 'e2e schedule.feature:9 · SQS message redelivered', why: 'visibility timeout shorter than handler time', fix: 'raise the visibility timeout, ack after commit' }
    ];
    const TASKS = ['add quiet hours to scheduling', 'expose readAt in the GraphQL schema', 'batch digest summaries', 'move preferences to the v2 schema', 'capability flags for desktop'];
    const PLATS = [7, 7, 6], N = 20;
    const PH = [['plan', 1.4], ['up', 2.6], ['test', 3.0], ['fix', 3.0], ['retest', 2.0], ['ship', 2.2]];
    let pi = 0, pt = 0, cur = -1, done = new Set(), up = [0, 0, 0, 0], tests = [], spawnIn = 0, pass = 0, fail = 0, failDep = 0;
    let task = '', lines = [], fx = [], pulse = 0, loggedFail = false, patched = false, fired = new Set();
    const sid = i => 'svc-' + String(i + 1).padStart(2, '0');
    const once = (key, at) => { if (!fired.has(key) && pt >= at) { fired.add(key); return true; } return false; };

    function log(gl, txt, cls) {
      lines.push([gl, txt, cls]);
      if (lines.length > 30) lines = lines.slice(-16);
      const frag = document.createDocumentFragment();
      for (const [g2, t2, c2] of lines.slice(-14)) {
        const d = document.createElement('div'); d.className = 'l-' + c2;
        const sp = document.createElement('span'); sp.className = 'g'; sp.textContent = g2;
        d.append(sp, t2); frag.append(d);
      }
      term.replaceChildren(frag);
    }
    function enter(i) {
      pi = i % PH.length; pt = 0; fired = new Set();
      const name = PH[pi][0];
      if (name === 'plan') {
        if (done.size >= N) done = new Set();
        do { cur = (Math.random() * N) | 0; } while (done.has(cur));
        task = TASKS[(Math.random() * TASKS.length) | 0];
        up = [0, 0, 0, 0]; tests = []; pass = 0; fail = 0; loggedFail = false; patched = false;
        failDep = (Math.random() * DEPS.length) | 0;
        log('$', `harness plan ${sid(cur)} "${task}"`, 'cmd');
      } else if (name === 'up') log('$', `harness up ${sid(cur)} --sim kafka,mongodb,redis,aws`, 'cmd');
      else if (name === 'test') log('$', `harness test ${sid(cur)} --suites unit,contract,e2e`, 'cmd');
      else if (name === 'retest') { fail = 0; log('$', 'harness test --rerun-failed', 'cmd'); }
      else if (name === 'ship') { done.add(cur); log('›', 'agent: PR opened with test evidence · prod in < 24h', 'agent'); }
    }
    function step(dt) {
      pt += dt; pulse = Math.max(0, pulse - dt);
      const [name, dur] = PH[pi];
      if (name === 'plan' && once('plan', 0.7)) log('›', 'agent: plan ready, writing tests first', 'agent');
      if (name === 'up') {
        for (let k = 0; k < up.length; k++) if (!up[k] && pt > 0.35 + k * 0.5) up[k] = 1;
        if (once('up', 2.3)) log('✓', 'kafka · mongodb · redis · aws-sim healthy (4 containers)', 'ok');
      }
      if ((name === 'test' || name === 'retest') && pt < dur - 0.9 && (spawnIn -= dt) <= 0) {
        spawnIn = 0.14;
        const late = name === 'test' && pt > 0.8;
        const d = late && Math.random() < 0.4 ? failDep : (Math.random() * DEPS.length) | 0;
        tests.push({ d, seg: 0, t: 0, bad: late && d === failDep });
      }
      if (name === 'test' && once('force', 1.6) && !loggedFail) tests.push({ d: failDep, seg: 0, t: 0, bad: true });
      if (name === 'test' && once('sum', dur - 0.05)) log('·', `${pass} passed · ${fail} failed`, 'agent');
      if (name === 'fix') {
        if (once('logs', 0.1)) log('›', `agent: reading logs → ${DEPS[failDep].why}`, 'agent');
        if (once('patch', 1.7)) { patched = true; pulse = 0.9; log('›', `agent: patch → ${DEPS[failDep].fix} (+${4 + ((Math.random() * 9) | 0)} −${1 + ((Math.random() * 4) | 0)})`, 'agent'); }
      }
      if (name === 'retest' && once('rsum', dur - 0.05)) log('✓', `${pass} passed · 0 failed`, 'ok');
      for (const t of tests) {
        t.t += dt / 0.26;
        if (t.t < 1) continue;
        if (t.bad && t.seg === 1) {
          t.dead = true; fail++; fx.push({ d: t.d, t: 0 });
          if (!loggedFail) { loggedFail = true; log('✗', DEPS[failDep].fail, 'bad'); }
          continue;
        }
        t.seg++; t.t = 0;
        if (t.seg > 3) { t.dead = true; pass += 7; }
      }
      tests = tests.filter(t => !t.dead);
      for (const f of fx) f.t += dt;
      fx = fx.filter(f => f.t < 0.9);
      if (pt >= dur) enter(pi + 1);
    }

    function geo(st) {
      const w = st.w, h = st.h, sx0 = Math.max(76, w * 0.22), sx1 = w - 6, sy0 = 10, sy1 = h - 46;
      const dw = clamp(w * 0.22, 64, 92), dx = sx1 - 10 - dw / 2;
      const deps = DEPS.map((_, k) => [dx, sy0 + 24 + (k + 0.5) * ((sy1 - sy0 - 28) / DEPS.length)]);
      const mid = (sy0 + sy1) / 2;
      return { w, h, sx0, sx1, sy0, sy1, dw, deps, agent: [sx0 / 2, sy0 + 30], runner: [sx0 / 2, mid + 22], svc: [sx0 + (dx - dw / 2 - sx0) * 0.45, mid + 10] };
    }

    function render(st) {
      const g = geo(st), { ctx, w, h } = st, name = PH[pi][0];
      ctx.clearRect(0, 0, w, h);
      pills.forEach((el, k) => el.classList.toggle('on', k === pi));

      rrect(ctx, g.sx0, g.sy0, g.sx1 - g.sx0, g.sy1 - g.sy0, 6);
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.strokeStyle = C.rule; ctx.stroke(); ctx.setLineDash([]);
      text(ctx, 'local simulation · containers', g.sx0 + 10, g.sy0 + 13, { size: 9.5, align: 'left', color: C.muted });

      line(ctx, g.runner, g.svc, { color: C.muted });
      g.deps.forEach((d, k) => line(ctx, g.svc, d, { color: cat(k), lw: 1.3, alpha: up[k] ? 0.6 : 0.25, dash: up[k] ? [] : [3, 3] }));
      if (name === 'plan' || (name === 'fix' && patched)) line(ctx, g.agent, g.svc, { color: C.ink, dash: [3, 3], lw: 1.3 });
      if (name === 'fix' && !patched) { ctx.lineDashOffset = -pt * 18; line(ctx, g.agent, g.deps[failDep], { color: C.ink, dash: [3, 3], lw: 1.3 }); ctx.lineDashOffset = 0; }

      for (const t of tests) {
        const P = [g.runner, g.svc, g.deps[t.d], g.svc, g.runner], a = P[t.seg], b = P[t.seg + 1];
        dot(ctx, lerp(a[0], b[0], t.t), lerp(a[1], b[1], t.t), 3, t.seg < 2 ? C.ink : cat(t.d));
      }

      g.deps.forEach((d, k) => {
        const bad = k === failDep && ((name === 'test' && loggedFail) || (name === 'fix' && !patched));
        box(ctx, d[0], d[1], g.dw, 24, { stroke: !up[k] ? C.rule : bad ? C.bad : C.ink, dash: up[k] ? [] : [3, 3], lw: bad ? 2 : 1.3, accent: up[k] ? cat(k) : null });
        text(ctx, DEPS[k].name, d[0] + 2, d[1], { size: 10, color: up[k] ? C.ink : C.muted, weight: up[k] ? 500 : 400 });
      });
      for (const f of fx) cross(ctx, g.deps[f.d][0] - g.dw / 2 - 9, g.deps[f.d][1], 4, C.bad, 1 - f.t / 0.9);

      if (pulse > 0) {
        const grow = (0.9 - pulse) * 16;
        rrect(ctx, g.svc[0] - 41 - grow, g.svc[1] - 17 - grow, 82 + grow * 2, 34 + grow * 2, 6);
        ctx.lineWidth = 2; ctx.strokeStyle = C.ok; ctx.globalAlpha = pulse; ctx.stroke(); ctx.globalAlpha = 1;
      }
      box(ctx, g.svc[0], g.svc[1], 82, 34, { lw: 1.6 });
      text(ctx, cur >= 0 ? sid(cur) : 'service', g.svc[0], g.svc[1] - 6, { size: 11, weight: 600 });
      text(ctx, 'under change', g.svc[0], g.svc[1] + 8, { size: 9, color: C.muted });

      box(ctx, g.runner[0], g.runner[1], 58, 28);
      text(ctx, 'tests', g.runner[0], g.runner[1], { size: 10.5, weight: 600 });
      checkMark(ctx, g.runner[0] - 18, g.runner[1] + 28, 'pass', 3.5);
      text(ctx, String(pass), g.runner[0] - 10, g.runner[1] + 28, { size: 10, align: 'left' });
      checkMark(ctx, g.runner[0] - 18, g.runner[1] + 44, fail ? 'fail' : 'none', 3.5);
      text(ctx, String(fail), g.runner[0] - 10, g.runner[1] + 44, { size: 10, align: 'left', color: fail ? C.ink : C.muted });

      dot(ctx, g.agent[0], g.agent[1], 17, C.ink);
      text(ctx, 'agent', g.agent[0], g.agent[1], { size: 9.5, weight: 600, color: C.paper });

      const fy = h - 18, sq = 9, gp = 3;
      let fx0 = 8, idx = 0;
      text(ctx, 'fleet', fx0, fy, { size: 9.5, align: 'left', color: C.muted });
      fx0 += 34;
      PLATS.forEach(n => {
        for (let k = 0; k < n; k++, idx++) {
          const x = fx0 + k * (sq + gp), y = fy - sq / 2;
          if (idx === cur) { ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.strokeRect(x + 1, y + 1, sq - 2, sq - 2); }
          else if (done.has(idx)) { ctx.fillStyle = C.ok; ctx.fillRect(x, y, sq, sq); }
          else { ctx.lineWidth = 1; ctx.strokeStyle = C.rule; ctx.strokeRect(x + 0.5, y + 0.5, sq - 1, sq - 1); }
        }
        fx0 += n * (sq + gp) + 8;
      });
      if (w > 430) text(ctx, `${done.size}/20 green · 3 platforms`, fx0 + 2, fy, { size: 9.5, align: 'left', color: C.muted });

      const upN = up.reduce((a, b) => a + b, 0);
      setText(out, {
        plan: `agent plans "${task}" for ${sid(cur)}`,
        up: `spinning up the local simulation · ${upN}/4 dependencies healthy`,
        test: `unit, contract and e2e suites · ${pass} passed · ${fail} failed`,
        fix: patched ? 'patched · re-running the failed suites next' : `agent reading ${DEPS[failDep].name} logs to find the cause`,
        retest: `re-running failed suites · ${pass} passed · 0 failed`,
        ship: `${sid(cur)} green → PR with test evidence → production within 24h`
      }[name]);
    }

    enter(0);
    stage(canvas, { height: w => (w < 420 ? 270 : 300), step, render, warm: 9.2 });
  }

  /* =====================================================================
     5. Insights: build → measure → learn, then .NET → TypeScript
     ===================================================================== */
  function insights(root) {
    const ins = root.querySelector('.ins'), out = root.querySelector('[data-status]');
    const loopEls = [...root.querySelectorAll('.loop li')], ver = root.querySelector('[data-ver]'), learnEl = root.querySelector('[data-learn]');
    const meters = [...root.querySelectorAll('.meter i')], tiles = [...root.querySelectorAll('.mig i')];
    const IT = [
      { m: [0.78, 0.22, 0.5], learn: 'learned: the meetings number lands; learning needs a nudge, not a count' },
      { m: [0.84, 0.64, 0.56], learn: 'learned: people act on suggestions, not just numbers' },
      { m: [0.9, 0.82, 0.86], learn: 'learned: proven, so move the core to TypeScript and roll it out firm-wide' }
    ];
    const STEP = ['build: ship the smallest insight that could help', 'measure: watch how people actually use it', 'learn: keep, change or drop'];
    const PH = 1.8, ITER = PH * 3, MIG = IT.length * ITER, DONE = MIG + 3.6, END = DONE + 3;
    let t = 0;
    function apply() {
      const mig = t >= MIG, it = mig ? IT.length - 1 : Math.floor(t / ITER), local = mig ? ITER : t - it * ITER;
      const stg = mig ? -1 : Math.min(2, Math.floor(local / PH)), v = String(it + 1);
      if (ins.dataset.v !== v) ins.dataset.v = v;
      setText(ver, 'v' + v);
      loopEls.forEach((el, i) => el.classList.toggle('on', i === stg));
      const prev = it ? IT[it - 1].m : [0, 0, 0];
      const f = mig || stg === 2 ? 1 : stg === 1 ? ease(clamp((local - PH) / PH, 0, 1)) : 0;
      meters.forEach((el, i) => el.style.setProperty('--m', lerp(prev[i], IT[it].m[i], f).toFixed(3)));
      setText(learnEl, mig || stg === 2 ? IT[it].learn : stg === 1 ? `measuring how people use v${v}…` : `building v${v}…`);
      const done = mig ? Math.min(tiles.length, Math.floor((t - MIG) / 0.8)) : 0;
      tiles.forEach((el, i) => {
        const ts = i < done;
        if (el.classList.contains('ts') !== ts) { el.classList.toggle('ts', ts); el.querySelector('b').textContent = ts ? 'TS' : '.NET'; }
      });
      setText(out, t >= DONE ? 'shipped firm-wide: 350K+ employees · JPMC Impact Award'
        : mig ? `migrating core insights .NET → TypeScript · ${done}/${tiles.length}`
        : `v${v} · ${STEP[stg]}`);
    }
    if (REDUCED) { t = DONE + 0.1; apply(); return; }
    apply();
    loop(root, dt => { t += dt; if (t > END) t = 0; apply(); });
  }

  /* =====================================================================
     6. Search: prefix + fuzzy (AUTO) + phonetic over fictional names
     ===================================================================== */
  function search(root) {
    const input = root.querySelector('input'), list = root.querySelector('[data-results]'), meta = root.querySelector('[data-meta]');
    const NAMES = [
      'Jonathan Pereira', 'Jonathon Mathew', 'Katherine Iyer', 'Catherine Lobo', 'Kathryn Menon', 'Mohammed Rizvi',
      'Mohamed Farooq', 'Muhammad Ansari', 'Srinivasan Rao', 'Shrinivas Kulkarni', 'Aisha Khan', 'Ayesha Siddiqui',
      'Priya Nair', 'Preeya Sharma', 'Philip Shaw', 'Phillip Gomes', 'Filip Novak', 'Stephen D\'Souza', 'Steven Fernandes',
      'Stefan Weber', 'Vikram Sethi', 'Vickram Joshi', 'Deepak Verma', 'Dipak Chauhan', 'Lakshmi Narayan', 'Laxmi Pillai',
      'Sean O\'Brien', 'Shaun Murphy', 'Shawn Taylor', 'Michael Chen', 'Michel Laurent', 'Mikhail Petrov', 'Rahul Gupta',
      'Raoul Dumont', 'Sara Lee', 'Sarah Thomas', 'Zara Ali', 'Aditya Bansal', 'Aaditya Mehta', 'Krishna Reddy',
      'Krishnan Iyengar', 'Nikhil Jain', 'Nicole Martin', 'Elizabeth Brown', 'Elisabeth Fischer', 'Gaurav Malhotra',
      'Gourav Das', 'Anjali Kapoor', 'Anjalee Bose', 'Rohit Saxena', 'Rohith Kumar', 'Yusuf Shaikh', 'Yousuf Hussain',
      'Joseph Kurian', 'Josef Horak', 'Matthew Wilson', 'Mathew George', 'Karthik Subramanian', 'Kartik Arora',
      'Sneha Patil', 'Snehaa Desai', 'Pillai Ramesh'
    ];
    const SDX = { b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 };
    function normalise(word) {
      return word.toLowerCase().replace(/[^a-z]/g, '')
        .replace(/^(kn|gn|pn|wr)/, m => m[1])
        .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k')
        .replace(/q/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's').replace(/w/g, 'v')
        .replace(/([^aeiou])h/g, '$1');
    }
    function phon(word) {
      const s = normalise(word);
      if (!s) return '';
      let out = '', prev = SDX[s[0]] || 0;
      for (let i = 1; i < s.length && out.length < 3; i++) {
        const ch = s[i], d = SDX[ch] || 0;
        if (d && d !== prev) out += d;
        if (ch !== 'h' && ch !== 'w') prev = d;
      }
      return (s[0].toUpperCase() + out + '000').slice(0, 4);
    }
    function osa(a, b) { // optimal string alignment (Damerau-Levenshtein, adjacent transpositions)
      const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
      for (let j = 0; j <= n; j++) d[0][j] = j;
      for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      return d[m][n];
    }
    const auto = t => (t.length <= 2 ? 0 : t.length <= 5 ? 1 : 2);
    const docs = NAMES.map(name => ({ name, toks: name.split(' ').map(t => ({ raw: t, t: t.toLowerCase().replace(/[^a-z]/g, ''), k: phon(t) })) }));

    function match(qt, tok) {
      if (tok.t === qt) return { s: 4, why: ['exact'] };
      const why = []; let s = 0;
      if (qt.length >= 2 && tok.t.startsWith(qt)) { s = 3; why.push('prefix'); }
      const d = osa(qt, tok.t), f = auto(qt);
      if (d > 0 && d <= f) { const fs = 3 - 0.6 * d; if (fs > s) s = fs; why.push(`fuzzy:${d} edit${d > 1 ? 's' : ''}`); }
      if (qt.length >= 3 && phon(qt) === tok.k) { s = Math.max(s, 1.6) + (s ? 0.4 : 0); why.push(`phonetic:${tok.k}`); }
      return s ? { s, why } : null;
    }

    function run() {
      const q = input.value.trim().toLowerCase();
      const qts = q.split(/\s+/).map(t => t.replace(/[^a-z]/g, '')).filter(Boolean).slice(0, 3);
      list.textContent = '';
      if (!qts.length) { setText(meta, 'type a name; misspellings welcome'); return; }
      const hits = [];
      for (const doc of docs) {
        let score = 0; const marks = new Set(), why = [];
        for (const qt of qts) {
          let best = null, bi = -1;
          doc.toks.forEach((tok, i) => { const m = match(qt, tok); if (m && (!best || m.s > best.s)) { best = m; bi = i; } });
          if (best) { score += best.s; marks.add(bi); why.push(...best.why); }
        }
        if (score) hits.push({ doc, score, marks, why: [...new Set(why)] });
      }
      hits.sort((a, b) => b.score - a.score || a.doc.name.localeCompare(b.doc.name));
      const f = qts.map(t => `${t} → ${phon(t)}`).join(', ');
      meta.textContent = '';
      const b = document.createElement('b'); b.textContent = hits.length;
      meta.append(b, ` of ${docs.length} records · phonetic ${f} · fuzziness AUTO (${qts.map(auto).join('/')} edits)`);
      if (!hits.length) {
        const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'no match within the fuzziness budget';
        list.append(li); return;
      }
      for (const h of hits.slice(0, 6)) {
        const li = document.createElement('li');
        const nm = document.createElement('span'); nm.className = 'nm';
        h.doc.toks.forEach((tok, i) => {
          if (i) nm.append(' ');
          if (h.marks.has(i)) { const m = document.createElement('mark'); m.textContent = tok.raw; nm.append(m); } else nm.append(tok.raw);
        });
        const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = 'score ' + h.score.toFixed(1);
        const why = document.createElement('span'); why.className = 'why';
        for (const w of h.why) {
          const [kind, detail] = w.split(':');
          const i = document.createElement('i'); i.dataset.kind = kind;
          const kb = document.createElement('b'); kb.textContent = kind;
          i.append(kb); if (detail) i.append(' ' + detail); why.append(i);
        }
        li.append(nm, sc, why); list.append(li);
      }
    }
    input.addEventListener('input', run);
    root.querySelectorAll('.try button').forEach(b => b.addEventListener('click', () => { input.value = b.textContent; run(); input.focus({ preventScroll: true }); }));
    run();
  }

  /* ---------- theme: the toggle lives inline in index.html; here we just repaint canvases ---------- */
  function themeSync() {
    const repaint = () => { readTheme(); redraws.forEach(d => d()); };
    new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', repaint); else if (mq.addListener) mq.addListener(repaint); }
  }

  /* ---------- boot ---------- */
  const VIZ = { kafka, breaker, pact, harness, insights, search };
  function boot() {
    document.querySelectorAll('[data-viz]').forEach(el => {
      const f = VIZ[el.dataset.viz];
      if (!f) return;
      try { f(el); } catch (e) { report(el.dataset.viz, e); }
    });
    try { themeSync(); } catch (e) { report('theme', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
