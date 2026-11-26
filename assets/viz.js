/* amitdu6ey.github.io — live distributed-systems sketches.
   Plain canvas + DOM, no libraries. Each sketch pauses offscreen and renders a
   single settled frame under prefers-reduced-motion. */
(() => {
  'use strict';

  // Colours come from the page's CSS custom properties, so light and dark themes stay in sync.
  const C = {};
  const VARS = { paper: '--bg', deep: '--bg-2', ink: '--fg', muted: '--muted', rule: '--line', mark: '--mark', rust: '--rust', blue: '--blue', amber: '--amber' };
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    for (const k in VARS) C[k] = cs.getPropertyValue(VARS[k]).trim() || C[k] || '#888';
  }
  readTheme();
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
  function box(ctx, cx, cy, w, h, o = {}) {
    rrect(ctx, cx - w / 2, cy - h / 2, w, h, 3);
    ctx.fillStyle = o.fill || C.paper; ctx.fill();
    ctx.setLineDash(o.dash || []);
    ctx.lineWidth = o.lw || 1.5; ctx.strokeStyle = o.stroke || C.ink; ctx.stroke();
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
  function diamond(ctx, x, y, r, color, hollow) {
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    if (hollow) { ctx.lineWidth = 1.6; ctx.strokeStyle = color; ctx.fillStyle = C.paper; ctx.fill(); ctx.stroke(); }
    else { ctx.fillStyle = color; ctx.fill(); }
  }
  function cross(ctx, x, y, r, color, alpha) {
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
    ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
    ctx.globalAlpha = 1;
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
    const lanes = Array.from({ length: P }, () => ({ q: [] }));
    const cons = Array.from({ length: MAXC }, () => ({ busy: null, rr: 0 }));
    const cells = Array.from({ length: COLS * ROWS }, () => ({ on: Math.random() < 0.45, flash: 0 }));
    let incoming = [], outgoing = [];

    function geo(st) {
      const w = st.w, h = st.h, top = 28, bot = h - 12;
      const lh = Math.min(30, (bot - top) / P - 8), lg = (bot - top - lh * P) / (P - 1);
      const l0 = Math.max(46, w * 0.13), l1 = w * 0.56;
      const cw = clamp(w * 0.09, 34, 64), cx = w * 0.645;
      const gx1 = w - 8, cell = Math.min((gx1 - w * 0.745) / COLS, (bot - top) / ROWS);
      const gw = cell * COLS, gh = cell * ROWS;
      const ch = Math.min(40, (bot - top - (k - 1) * 8) / k);
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
          outgoing.push({ c, cell: (Math.random() * cells.length) | 0, t: 0 });
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
        if (o.t >= 1) { o.done = true; const cl = cells[o.cell]; cl.on = Math.random() < 0.5; cl.flash = 1; applied++; }
      }
      outgoing = outgoing.filter(o => !o.done);
      for (const cl of cells) cl.flash = Math.max(0, cl.flash - dt * 1.4);
    }

    function render(st) {
      g = geo(st);
      const { ctx, w, h } = st;
      ctx.clearRect(0, 0, w, h);
      const cap = { size: 10, color: C.muted };
      const narrow = w < 560;
      text(ctx, narrow ? 'in' : 'events', g.l0 / 2 + 2, 12, cap);
      text(ctx, narrow ? 'topic' : `topic · ${P} partitions`, (g.l0 + g.l1) / 2, 12, cap);
      text(ctx, rebalance > 0 ? (narrow ? 'rebal…' : 'rebalancing…') : narrow ? 'group' : 'consumers', g.cx, 12, cap);
      text(ctx, narrow ? 'members' : 'audiences', g.gx0 + (g.cell * COLS) / 2, 12, cap);

      // assignment: partition p → consumer p % k
      for (let p = 0; p < P; p++) {
        const y = g.laneY(p) + g.lh / 2, c = p % k;
        line(ctx, [g.l1, y], [g.cx - g.cw / 2, g.consY(c)], rebalance > 0 ? { color: C.amber, dash: [4, 3], lw: 1.4 } : { color: C.muted, lw: 1 });
      }

      for (let p = 0; p < P; p++) {
        const y = g.laneY(p), q = lanes[p].q;
        rrect(ctx, g.l0, y, g.l1 - g.l0, g.lh, 3);
        ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = C.ink; ctx.stroke();
        text(ctx, 'p' + p, g.l0 - 7, y + g.lh / 2, { size: 10, align: 'right', color: C.muted });
        ctx.fillStyle = C.ink;
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
        ctx.fillStyle = C.ink; ctx.globalAlpha = 0.85; ctx.fillRect(x, y - 3, 6, 6); ctx.globalAlpha = 1;
      }

      for (const o of outgoing) {
        const cl = o.cell, gx = g.gx0 + (cl % COLS) * g.cell + g.cell / 2, gy = g.gy0 + ((cl / COLS) | 0) * g.cell + g.cell / 2;
        const t = ease(Math.min(1, o.t));
        dot(ctx, lerp(g.cx + g.cw / 2, gx, t), lerp(g.consY(o.c), gy, t), 2.8, C.blue);
      }

      for (let c = 0; c < k; c++) {
        const y = g.consY(c), b = cons[c].busy;
        box(ctx, g.cx, y, g.cw, g.ch, { dash: rebalance > 0 ? [3, 3] : [] });
        text(ctx, 'c' + (c + 1), g.cx, y - (g.ch > 26 ? 4 : 0), { size: 10.5, weight: 600 });
        if (b && g.ch > 26) {
          ctx.fillStyle = C.rule; ctx.fillRect(g.cx - g.cw / 2 + 6, y + 8, g.cw - 12, 3);
          ctx.fillStyle = C.blue; ctx.fillRect(g.cx - g.cw / 2 + 6, y + 8, (g.cw - 12) * clamp(b.t, 0, 1), 3);
        } else if (b) {
          ctx.fillStyle = C.blue; ctx.fillRect(g.cx - g.cw / 2 + 4, y + g.ch / 2 - 4, (g.cw - 8) * clamp(b.t, 0, 1), 2);
        }
      }

      const sz = g.cell - 2;
      cells.forEach((cl, i) => {
        const x = g.gx0 + (i % COLS) * g.cell + 1, y = g.gy0 + ((i / COLS) | 0) * g.cell + 1;
        if (cl.on) { ctx.fillStyle = C.ink; ctx.fillRect(x, y, sz, sz); }
        else { ctx.lineWidth = 1; ctx.strokeStyle = C.rule; ctx.strokeRect(x + 0.5, y + 0.5, sz - 1, sz - 1); }
        if (cl.flash > 0) { ctx.globalAlpha = cl.flash; ctx.fillStyle = C.blue; ctx.fillRect(x, y, sz, sz); ctx.globalAlpha = 1; }
      });

      const lag = lanes.reduce((a, l) => a + l.q.length, 0);
      setText(out, `consumers ${k} · lag ${lag} event${lag === 1 ? '' : 's'} · ${applied.toLocaleString('en-US')} memberships recomputed · group generation ${gen}` +
        (rebalance > 0 ? ' · rebalancing' : ''));
    }

    s = stage(canvas, { height: w => (w < 560 ? 230 : 252), step, render, warm: 8 });
    const user = f => () => { auto = false; f(); s.poke(); };
    root.querySelector('[data-act="add"]').addEventListener('click', user(() => setK(k + 1)));
    root.querySelector('[data-act="remove"]').addEventListener('click', user(() => setK(k - 1)));
  }

  /* =====================================================================
     2. Notifications: idempotency + circuit breaker + digest
     ===================================================================== */
  function breaker(root) {
    const canvas = root.querySelector('canvas'), out = root.querySelector('[data-status]');
    const btn = root.querySelector('[data-act="fail"]');
    const OPEN_FOR = 2.8, WIN = 6, TRIP = 3, DUR = [0.5, 0.5, 0.45, 0.35, 0.65];
    let failing = false, auto = true, autoT = 0, acc = 0, seq = 0, dups = 0, delivered = 0, digest = 0, g = null, s;
    let pk = [], later = [], fx = [], seen = new Set(), recent = [];
    const ch = [
      { name: 'mobile', state: 'closed', win: [], openT: 0, probe: false },
      { name: 'desktop', state: 'closed', win: [], openT: 0, probe: false }
    ];

    function geo(st) {
      const w = st.w, h = st.h, bw = clamp(w * 0.14, 62, 104), bh = 30, bkh = 40;
      const sx = 6 + bw / 2, dx = w - 6 - bw / 2, bx = w * 0.58;
      return {
        w, h, bw, bh, bkh,
        src: [sx, h * 0.5], ded: [w * 0.32, h * 0.5],
        brk: [[bx, h * 0.25], [bx, h * 0.75]],
        dev: [[dx, h * 0.25], [dx, h * 0.75]],
        dig: [(bx + dx) / 2, h * 0.5]
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
        if (seen.has(p.id)) { dups++; fx.push({ kind: 'dup', x: g.ded[0], y: g.ded[1] - g.bh / 2 - 8, t: 0 }); return false; }
        seen.add(p.id);
        if (seen.size > 400) seen = new Set([...seen].slice(-200));
        p.seg = 1; p.t = 0; return true;
      }
      if (p.seg === 1) {
        if (c.state === 'open' || (c.state === 'half' && c.probe)) { p.seg = 3; p.t = 0; return true; } // short-circuit → hold
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
      delivered++; return false; // summary landed
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
        let id;
        if (recent.length > 3 && Math.random() < 0.16) id = recent[(Math.random() * recent.length) | 0]; // client retry, same key
        else { id = ++seq; recent.push(id); if (recent.length > 8) recent.shift(); }
        pk.push({ id, c: Math.random() < 0.6 ? 0 : 1, seg: 0, t: 0, kind: 'msg' });
      }
      for (const c of ch) if (c.state === 'open' && (c.openT -= dt) <= 0) { c.state = 'half'; c.probe = false; }
      pk = pk.filter(p => { p.t += dt / DUR[p.seg]; return p.t < 1 || arrive(p); });
      if (later.length) { pk = pk.concat(later); later = []; }
      for (const f of fx) f.t += dt;
      fx = fx.filter(f => f.t < 0.9);
    }

    const STATE = { closed: ['closed', C.blue], open: ['open', C.rust], half: ['half-open', C.amber] };

    function render(st) {
      g = geo(st);
      const { ctx, w, h } = st;
      ctx.clearRect(0, 0, w, h);

      line(ctx, g.src, g.ded, { color: C.muted });
      for (let i = 0; i < 2; i++) {
        line(ctx, g.ded, g.brk[i], { color: C.muted });
        line(ctx, g.brk[i], g.dev[i], { color: C.muted, dash: ch[i].state === 'open' ? [2, 4] : [] });
      }
      line(ctx, g.brk[0], g.dig, { color: C.muted, dash: [3, 3] });
      line(ctx, g.dig, g.dev[0], { color: C.muted, dash: [3, 3] });

      for (const p of pk) {
        const [a, b] = ends(p), t = Math.min(1, p.t), x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t);
        if (p.kind === 'probe') diamond(ctx, x, y, 5.5, C.amber);
        else if (p.kind === 'sum') {
          ctx.fillStyle = C.blue; ctx.fillRect(x - 6, y - 6, 12, 12);
          text(ctx, 'Σ' + p.n, x + 10, y, { size: 10.5, align: 'left', weight: 600 });
        } else dot(ctx, x, y, 4, C.blue);
      }

      box(ctx, g.src[0], g.src[1], g.bw, g.bh);
      text(ctx, 'requests', g.src[0], g.src[1], { size: 10.5 });
      box(ctx, g.ded[0], g.ded[1], g.bw, g.bh + 6);
      text(ctx, 'dedupe', g.ded[0], g.ded[1] - 6, { size: 10.5, weight: 600 });
      text(ctx, 'idem. keys', g.ded[0], g.ded[1] + 7, { size: 9, color: C.muted });

      for (let i = 0; i < 2; i++) {
        const c = ch[i], [x, y] = g.brk[i], [lab, col] = STATE[c.state];
        box(ctx, x, y, g.bw, g.bkh, { stroke: c.state === 'closed' ? C.ink : col, lw: c.state === 'closed' ? 1.5 : 2 });
        text(ctx, 'breaker', x, y - 8, { size: 9.5, color: C.muted });
        const tw = lab.length * 6 + 10;
        dot(ctx, x - tw / 2 + 3, y + 8, 3.2, col);
        text(ctx, lab, x - tw / 2 + 10, y + 8, { size: 10, align: 'left', weight: 600 });
        // rolling result window
        const sw = 6, sg = 2, wx = x - (WIN * (sw + sg) - sg) / 2, wy = y + g.bkh / 2 + 5;
        for (let j = 0; j < WIN; j++) {
          const r = c.win[j];
          if (r === undefined) { ctx.lineWidth = 1; ctx.strokeStyle = C.rule; ctx.strokeRect(wx + j * (sw + sg) + 0.5, wy + 0.5, sw - 1, sw - 1); }
          else { ctx.fillStyle = r ? C.blue : C.rust; ctx.fillRect(wx + j * (sw + sg), wy, sw, sw); }
        }
        if (c.state === 'open') text(ctx, `retry in ${c.openT.toFixed(1)}s`, x, y - g.bkh / 2 - 9, { size: 9.5, color: C.muted });

        const [dx, dy] = g.dev[i], down = i === 0 && failing;
        box(ctx, dx, dy, g.bw, g.bh, { stroke: down ? C.rust : C.ink, dash: down ? [4, 3] : [] });
        text(ctx, c.name, dx, dy, { size: 10.5, weight: 600 });
        if (down) text(ctx, w < 560 ? 'down' : 'provider down', dx, dy + g.bh / 2 + 10, { size: 9.5, color: C.muted });
      }

      box(ctx, g.dig[0], g.dig[1], Math.max(48, g.bw * 0.78), g.bh, { dash: digest ? [] : [3, 3] });
      text(ctx, 'digest', g.dig[0], g.dig[1], { size: 10, color: digest ? C.ink : C.muted, weight: digest ? 600 : 400 });
      if (digest) text(ctx, `${digest} held`, g.dig[0], g.dig[1] + g.bh / 2 + 10, { size: 9.5, color: C.muted });

      for (const f of fx) {
        const a = 1 - f.t / 0.9;
        if (f.kind === 'dup') text(ctx, 'dup ✕', f.x, f.y - f.t * 14, { size: 10, color: C.ink, alpha: a, weight: 600 });
        else cross(ctx, f.x, f.y, 4.5, C.rust, a);
      }

      const m = ch[0];
      setText(out, `mobile breaker ${STATE[m.state][0]}${m.state === 'open' ? ` (probe in ${m.openT.toFixed(1)}s)` : ''} · ` +
        `${dups} duplicate${dups === 1 ? '' : 's'} suppressed · ${digest} held for digest · ${delivered} delivered`);
    }

    s = stage(canvas, { height: w => (w < 560 ? 236 : 252), step, render, warm: 7 });
    btn.addEventListener('click', () => { auto = false; setFailing(!failing); s.poke(); });
  }

  /* =====================================================================
     3. Search: prefix + fuzzy (AUTO) + phonetic over fictional names
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
      meta.innerHTML = '';
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
          const i = document.createElement('i'); const kb = document.createElement('b'); kb.textContent = kind;
          i.append(kb); if (detail) i.append(' ' + detail); why.append(i);
        }
        li.append(nm, sc, why); list.append(li);
      }
    }
    input.addEventListener('input', run);
    root.querySelectorAll('.try button').forEach(b => b.addEventListener('click', () => { input.value = b.textContent; run(); input.focus({ preventScroll: true }); }));
    run();
  }

  /* =====================================================================
     4. Insights: build → measure → learn, then .NET → TypeScript
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

  /* ---------- theme: the toggle lives inline in index.html; here we just repaint canvases ---------- */
  function themeSync() {
    const repaint = () => { readTheme(); redraws.forEach(d => d()); };
    new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', repaint); else if (mq.addListener) mq.addListener(repaint); }
  }

  /* ---------- boot ---------- */
  const VIZ = { kafka, breaker, search, insights };
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
