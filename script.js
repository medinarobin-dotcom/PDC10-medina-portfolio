/* ==========================================================================
   Robin J. Medina | Prompt Engineering Portfolio (PDC10)
   All interactions: preloader, kinetic type, tilt, particles, viewer.
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  // If the page's safety timer already showed everything, skip the intro effects.
  const failsafed = root.classList.contains('no-js');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const debounce = (fn, ms) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  /* ------------------------------------------------------------------
     1. Split headings into letters (for stagger reveals)
     ------------------------------------------------------------------ */
  function splitText(el) {
    const label = el.textContent.replace(/\s+/g, ' ').trim();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    let index = 0;
    textNodes.forEach((node) => {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          frag.append(' ');
          return;
        }
        const word = document.createElement('span');
        word.className = 'word';
        word.setAttribute('aria-hidden', 'true');
        for (const ch of part) {
          const c = document.createElement('span');
          c.className = 'char';
          c.textContent = ch;
          c.style.setProperty('--i', index);
          index += 1;
          word.append(c);
        }
        frag.append(word);
      });
      node.replaceWith(frag);
    });

    const chars = $$('.char', el);
    const mid = (chars.length - 1) / 2;
    chars.forEach((c, i) => c.style.setProperty('--o', ((i - mid) / Math.max(chars.length, 1)).toFixed(3)));
    el.style.setProperty('--step', clamp(Math.round(900 / Math.max(chars.length, 1)), 8, 34) + 'ms');

    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = label;
    el.append(sr);
  }

  /* ------------------------------------------------------------------
     2. Mouse-tracking gradient on headings
        Each letter shows its own slice of one big gradient, so the
        glow moves smoothly across the whole heading.
     ------------------------------------------------------------------ */
  const tracked = [];
  const visibleTracked = new Set();
  let pointerX = -1;
  let pointerY = -1;
  let lastPointerMove = 0;
  let trackRaf = 0;

  function measureTrack(el) {
    el.style.setProperty('--gw', el.offsetWidth + 'px');
    el.style.setProperty('--gh', el.offsetHeight + 'px');
    $$('.char', el).forEach((c) => {
      let x = 0;
      let y = 0;
      let n = c;
      while (n && n !== el) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent;
      }
      c.style.setProperty('--ox', x + 'px');
      c.style.setProperty('--oy', y + 'px');
    });
  }

  let trackFrame = 0;
  function paintTrack(now) {
    trackRaf = 0;
    trackFrame += 1;
    const idle = pointerX < 0 || now - lastPointerMove > 2600;
    // The slow idle drift only needs ~30 updates a second.
    if (idle && trackFrame % 2) {
      if (visibleTracked.size) trackRaf = requestAnimationFrame(paintTrack);
      return;
    }
    visibleTracked.forEach((el) => {
      let mx;
      let my;
      if (idle) {
        const t = now / 2600 + Number(el.dataset.seed || 0);
        mx = 50 + 44 * Math.sin(t);
        my = 50 + 34 * Math.cos(t * 1.27);
      } else {
        const r = el.getBoundingClientRect();
        mx = ((pointerX - r.left) / Math.max(r.width, 1)) * 100;
        my = ((pointerY - r.top) / Math.max(r.height, 1)) * 100;
      }
      el.style.setProperty('--mx', mx.toFixed(1) + '%');
      el.style.setProperty('--my', my.toFixed(1) + '%');
    });
    if (visibleTracked.size) trackRaf = requestAnimationFrame(paintTrack);
  }

  const trackObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver((entries) => {
          entries.forEach((e) => (e.isIntersecting ? visibleTracked.add(e.target) : visibleTracked.delete(e.target)));
          if (visibleTracked.size && !trackRaf && !reduceMotion) trackRaf = requestAnimationFrame(paintTrack);
        })
      : null;

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return;
      pointerX = e.clientX;
      pointerY = e.clientY;
      lastPointerMove = performance.now();
    },
    { passive: true }
  );

  /* ------------------------------------------------------------------
     3. Keep the hero title inside the screen on any font or width
     ------------------------------------------------------------------ */
  function fitTitle() {
    const title = $('[data-fit]');
    if (!title) return;
    title.style.fontSize = '';
    const lines = $$('.line', title);
    if (!lines.length) return;
    const widest = Math.max(...lines.map((l) => l.offsetWidth));
    const available = title.clientWidth;
    if (widest > available) {
      const size = parseFloat(getComputedStyle(title).fontSize);
      title.style.fontSize = Math.floor(size * (available / widest) * 0.98) + 'px';
    }
  }

  /* ------------------------------------------------------------------
     4. Cinematic preloader with real loading progress
     ------------------------------------------------------------------ */
  function runPreloader() {
    const pre = $('#preloader');
    if (!pre || failsafed) {
      if (pre) pre.remove();
      root.classList.remove('is-loading');
      return Promise.resolve();
    }

    const fill = $('.preloader__fill', pre);
    const count = $('.preloader__count span', pre);
    const lines = $$('.preloader__log li', pre);
    const skip = $('.preloader__skip', pre);
    const start = performance.now();
    const minTime = reduceMotion ? 400 : 2600;
    const maxTime = 7000;

    const jobs = $$('img[data-preload]').map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })
    );
    jobs.push(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve());
    jobs.push(
      document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise((resolve) => window.addEventListener('load', resolve, { once: true }))
    );
    let done = 0;
    jobs.forEach((job) => job.then(() => (done += 1), () => (done += 1)));

    let shown = 0;
    let skipped = false;
    if (skip) skip.addEventListener('click', () => (skipped = true));

    return new Promise((resolve) => {
      const finish = async () => {
        pre.classList.add('is-complete');
        await wait(reduceMotion ? 0 : 420);
        pre.classList.add('is-leaving');
        await wait(reduceMotion ? 0 : 280);
        pre.classList.add('is-done');
        root.classList.remove('is-loading');
        resolve();
        setTimeout(() => pre.remove(), reduceMotion ? 60 : 1500);
      };

      let last = start;
      const frame = (now) => {
        // Time-based easing, so slow devices finish on time too.
        const dt = Math.min(Math.max(now - last, 0), 100);
        last = now;
        const elapsed = now - start;
        let target = Math.min(done / jobs.length, elapsed / minTime);
        if (skipped || elapsed > maxTime) target = 1;
        shown += (target - shown) * (1 - Math.exp(-dt / (skipped ? 50 : 140)));
        if (target >= 1 && (shown > 0.995 || skipped || elapsed > minTime + 450)) shown = 1;

        const pct = Math.floor(shown * 100);
        count.textContent = pct;
        fill.style.setProperty('--p', shown.toFixed(4));
        lines.forEach((li) => li.classList.toggle('is-on', pct >= Number(li.dataset.at)));

        if (shown < 1) requestAnimationFrame(frame);
        else finish();
      };
      requestAnimationFrame(frame);
    });
  }

  /* ------------------------------------------------------------------
     5. Hero entrance after the curtain lifts
     ------------------------------------------------------------------ */
  let startConsole = () => {};

  function heroIntro() {
    const hero = $('.hero');
    const title = $('.hero__title');
    const who = $('.hero__who');
    if (title) title.classList.add('is-in');
    if (who) who.classList.add('is-lit');
    if (hero) hero.classList.add('is-ready');
    setTimeout(() => startConsole(), reduceMotion ? 0 : 1500);
  }

  function jumpToHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
    else window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------
     6. Scroll-triggered reveals
     ------------------------------------------------------------------ */
  function show(el) {
    el.classList.add(el.matches('[data-neon]') ? 'is-lit' : 'is-in');
    if (el.classList.contains('reveal')) {
      const delay = parseInt(getComputedStyle(el).getPropertyValue('--d'), 10) || 0;
      $$('[data-neon]', el).forEach((n) => setTimeout(() => n.classList.add('is-lit'), 350 + delay));
    }
  }

  function initReveal() {
    $$('.cards').forEach((grid) => {
      $$('.reveal', grid).forEach((card, i) => card.style.setProperty('--d', (i % 2) * 130 + 'ms'));
    });
    const items = $$('.reveal, .path__item, [data-split]:not(.hero__title)');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(show);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          show(entry.target);
          io.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    items.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------------
     7. 3D tilt cards (mouse only)
     ------------------------------------------------------------------ */
  function initTilt() {
    if (!finePointer || reduceMotion) return;
    $$('.tilt').forEach((el) => {
      const max = Number(el.dataset.tilt) || 6;
      let frame = 0;
      let timer = 0;
      el.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = el.getBoundingClientRect();
        const x = clamp((e.clientX - r.left) / r.width, 0, 1);
        const y = clamp((e.clientY - r.top) / r.height, 0, 1);
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          clearTimeout(timer);
          el.classList.remove('is-returning');
          el.classList.add('is-tilting');
          el.style.setProperty('--ry', ((x - 0.5) * 2 * max).toFixed(2) + 'deg');
          el.style.setProperty('--rx', ((0.5 - y) * 2 * max).toFixed(2) + 'deg');
          el.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
          el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
        });
      });
      el.addEventListener('pointerleave', () => {
        cancelAnimationFrame(frame);
        el.classList.remove('is-tilting');
        el.classList.add('is-returning');
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
        clearTimeout(timer);
        timer = setTimeout(() => el.classList.remove('is-returning'), 750);
      });
    });
  }

  /* ------------------------------------------------------------------
     8. Floating particle network
     ------------------------------------------------------------------ */
  function initParticles() {
    const canvas = $('#particles');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const palette = ['61,232,255', '174,140,255', '255,91,196', '82,245,168', '255,194,74'];
    const LINK = 128;
    const MOUSE_LINK = 170;
    const mouse = { x: -9999, y: -9999 };
    let width = 0;
    let height = 0;
    let dots = [];
    let raf = 0;

    const spawn = () => {
      const speed = 0.1 + Math.random() * 0.22;
      const angle = Math.random() * Math.PI * 2;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        bvx: Math.cos(angle) * speed,
        bvy: Math.sin(angle) * speed - 0.03,
        vx: 0,
        vy: 0,
        r: 0.7 + Math.random() * 1.5,
        color: palette[(Math.random() * palette.length) | 0],
        phase: Math.random() * Math.PI * 2,
      };
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.round(clamp((width * height) / 15000, 26, 110));
      while (dots.length < target) dots.push(spawn());
      dots.length = target;
    };

    const draw = (now) => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      for (const d of dots) {
        const dx = mouse.x - d.x;
        const dy = mouse.y - d.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < 200 * 200) {
          const pull = (1 - Math.sqrt(dist2) / 200) * 0.0006;
          d.vx += dx * pull;
          d.vy += dy * pull;
        }
        d.vx += (d.bvx - d.vx) * 0.02;
        d.vy += (d.bvy - d.vy) * 0.02;
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < -20) d.x = width + 20;
        else if (d.x > width + 20) d.x = -20;
        if (d.y < -20) d.y = height + 20;
        else if (d.y > height + 20) d.y = -20;
      }

      ctx.lineWidth = 1;
      for (let i = 0; i < dots.length; i++) {
        const a = dots[i];
        for (let j = i + 1; j < dots.length; j++) {
          const b = dots[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < LINK * LINK) {
            const alpha = (1 - Math.sqrt(dist2) / LINK) * 0.16;
            ctx.strokeStyle = 'rgba(160,168,255,' + alpha.toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        const mdx = a.x - mouse.x;
        const mdy = a.y - mouse.y;
        const md2 = mdx * mdx + mdy * mdy;
        if (md2 < MOUSE_LINK * MOUSE_LINK) {
          const alpha = (1 - Math.sqrt(md2) / MOUSE_LINK) * 0.38;
          ctx.strokeStyle = 'rgba(61,232,255,' + alpha.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }

      for (const d of dots) {
        const twinkle = 0.55 + 0.45 * Math.sin(now * 0.0016 + d.phase);
        ctx.fillStyle = 'rgba(' + d.color + ',' + (0.12 * twinkle).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(' + d.color + ',' + (0.85 * twinkle).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    const loop = (now) => {
      draw(now);
      raf = document.hidden ? 0 : requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener('resize', debounce(() => {
      resize();
      if (reduceMotion) draw(0);
    }, 200));

    if (reduceMotion) {
      draw(0);
      return;
    }

    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType === 'touch') return;
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      },
      { passive: true }
    );
    root.addEventListener('mouseleave', () => {
      mouse.x = -9999;
      mouse.y = -9999;
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !raf) raf = requestAnimationFrame(loop);
    });
    raf = requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------
     9. Soft spotlight that trails the mouse
     ------------------------------------------------------------------ */
  function initSpotlight() {
    const spot = $('.spotlight');
    if (!spot || !finePointer || reduceMotion) return;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 3;
    let tx = x;
    let ty = y;
    let raf = 0;
    const step = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      spot.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(step) : 0;
    };
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        tx = e.clientX;
        ty = e.clientY;
        root.classList.add('has-pointer');
        if (!raf) raf = requestAnimationFrame(step);
      },
      { passive: true }
    );
  }

  /* ------------------------------------------------------------------
     10. Navigation, scroll progress, and the "what I learned" line
     ------------------------------------------------------------------ */
  function initNav() {
    const nav = $('#nav');
    const toggle = $('.nav__toggle');
    const menu = $('#nav-menu');
    const bar = $('.scroll-progress');
    const path = $('.path');
    if (!nav || !menu) return;

    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      nav.classList.toggle('is-solid', y > 24);
      const max = root.scrollHeight - window.innerHeight;
      if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? clamp(y / max, 0, 1) : 0).toFixed(4) + ')';
      if (path) {
        const r = path.getBoundingClientRect();
        const p = clamp((window.innerHeight * 0.62 - r.top) / Math.max(r.height, 1), 0, 1);
        path.style.setProperty('--progress', p.toFixed(3));
      }
    };
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true }
    );
    window.addEventListener('resize', update);
    update();

    const close = () => {
      nav.classList.remove('is-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    };
    if (toggle) {
      toggle.addEventListener('click', () => {
        const open = !nav.classList.contains('is-open');
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        close();
        if (toggle) toggle.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('is-open') && !nav.contains(e.target)) close();
    });

    if (!('IntersectionObserver' in window)) return;
    const links = $$('a[href^="#"]', menu);
    const targets = links.map((a) => document.getElementById(a.getAttribute('href').slice(1)));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((a) => a.removeAttribute('aria-current'));
          const i = targets.indexOf(entry.target);
          if (i > -1) links[i].setAttribute('aria-current', 'true');
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    targets.concat($('#top')).forEach((t) => t && io.observe(t));
  }

  /* ------------------------------------------------------------------
     11. Hero console: types the "before" prompt, then every framework
         prompt, lighting up each part as it appears
     ------------------------------------------------------------------ */
  function prepareConsole() {
    const box = $('#console');
    if (!box) return;
    const live = $('.console__live', box);
    const ghost = $('.console__ghost', box);
    const state = $('.console__state', box);
    const name = $('.console__name', box);
    const chips = $$('.console__anatomy li', box);

    const beforeEl = $('#before-prompt');
    const sequence = [
      {
        state: 'before',
        name: 'Prompting with zero knowledge',
        segs: [{ text: beforeEl ? beforeEl.textContent.trim() : live.textContent.trim(), cat: 'task', plain: true }],
      },
    ];
    $$('.card--fw').forEach((card) => {
      sequence.push({
        state: 'after',
        name: card.dataset.name + ' framework',
        segs: $$('.prompt__text .seg', card).map((s) => ({
          text: $('.seg__text', s).textContent.trim(),
          cat: s.dataset.cat,
        })),
      });
    });

    // Reserve room for the longest prompt so the page never jumps.
    ghost.textContent = sequence
      .map((p) => p.segs.map((s) => s.text).join(' '))
      .reduce((a, b) => (b.length > a.length ? b : a), '');

    const setChips = (cats) => chips.forEach((c) => c.classList.toggle('is-on', cats.has(c.dataset.cat)));
    const setState = (p) => {
      box.dataset.state = p.state;
      state.textContent = p.state === 'before' ? 'Before' : 'After';
      name.textContent = p.name;
    };
    const renderAll = (p) => {
      live.textContent = '';
      p.segs.forEach((s, i) => {
        const span = document.createElement('span');
        if (!s.plain) span.dataset.cat = s.cat;
        span.textContent = (i ? ' ' : '') + s.text;
        live.append(span);
      });
      setChips(new Set(p.segs.map((s) => s.cat)));
    };

    if (reduceMotion || failsafed) {
      const last = sequence[sequence.length - 1];
      setState(last);
      renderAll(last);
      return;
    }

    const caret = document.createElement('span');
    caret.className = 'caret';
    live.textContent = '';
    live.append(caret);
    setState(sequence[0]);
    setChips(new Set());

    let visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
      }).observe(box);
    }

    // A timer that pauses while the console is off-screen or the tab is hidden.
    const pause = (ms) =>
      new Promise((resolve) => {
        let left = ms;
        let last = performance.now();
        const tick = () => {
          const now = performance.now();
          if (visible && !document.hidden) left -= now - last;
          last = now;
          if (left <= 0) resolve();
          else setTimeout(tick, Math.min(left, 100));
        };
        setTimeout(tick, Math.min(ms, 100));
      });

    let started = false;
    startConsole = async () => {
      if (started) return;
      started = true;
      let index = 0;
      for (;;) {
        const p = sequence[index % sequence.length];
        setState(p);
        live.textContent = '';
        live.append(caret);
        const lit = new Set();
        setChips(lit);
        const speed = p.state === 'before' ? 46 : 15;

        for (let s = 0; s < p.segs.length; s += 1) {
          const seg = p.segs[s];
          const span = document.createElement('span');
          if (!seg.plain) span.dataset.cat = seg.cat;
          live.insertBefore(span, caret);
          lit.add(seg.cat);
          setChips(lit);
          const text = (s ? ' ' : '') + seg.text;
          for (const ch of text) {
            span.textContent += ch;
            await pause(ch === ' ' ? speed * 0.5 : speed);
          }
          if (p.state === 'after') await pause(140);
        }

        await pause(p.state === 'before' ? 2600 : 3400);
        live.classList.add('is-clearing');
        await pause(420);
        live.classList.remove('is-clearing');
        index += 1;
      }
    };
  }

  /* ------------------------------------------------------------------
     12. Framework letters light up their part of the prompt
     ------------------------------------------------------------------ */
  function initDecoders() {
    $$('.card').forEach((card) => {
      const keys = $$('.decoder__key', card);
      if (!keys.length) return;
      const segs = $$('.prompt__text .seg', card);
      let pinned = null;
      const light = (key) => {
        card.classList.toggle('has-lit', key !== null);
        keys.forEach((k) => k.classList.toggle('is-lit', k.dataset.key === key));
        segs.forEach((s) => s.classList.toggle('is-lit', s.dataset.key === key));
      };
      keys.forEach((k) => {
        k.addEventListener('mouseenter', () => light(k.dataset.key));
        k.addEventListener('mouseleave', () => light(pinned));
        k.addEventListener('focus', () => light(k.dataset.key));
        k.addEventListener('blur', () => light(pinned));
        k.addEventListener('click', () => {
          pinned = pinned === k.dataset.key ? null : k.dataset.key;
          keys.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.key === pinned)));
          light(pinned);
        });
      });
      segs.forEach((s) => {
        s.addEventListener('mouseenter', () => light(s.dataset.key));
        s.addEventListener('mouseleave', () => light(pinned));
      });
    });
  }

  /* ------------------------------------------------------------------
     13. Copy prompt buttons
     ------------------------------------------------------------------ */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      area.remove();
      return ok;
    }
  }

  function initCopy() {
    const announcer = $('#announcer');
    $$('.copy[data-copy]').forEach((btn) => {
      const label = $('.copy__label', btn);
      let timer = 0;
      btn.addEventListener('click', async () => {
        const ok = await copyText(btn.dataset.copy);
        label.textContent = ok ? 'Copied' : 'Copy failed';
        btn.classList.toggle('is-done', ok);
        if (announcer) announcer.textContent = ok ? 'Prompt copied to clipboard.' : 'Could not copy the prompt.';
        clearTimeout(timer);
        timer = setTimeout(() => {
          label.textContent = 'Copy prompt';
          btn.classList.remove('is-done');
        }, 2000);
      });
    });
  }

  /* ------------------------------------------------------------------
     14. Full-size screenshot viewer
     ------------------------------------------------------------------ */
  function initViewer() {
    const dialog = $('#viewer');
    const openers = $$('.outcome__open');
    if (!dialog || typeof dialog.showModal !== 'function') {
      openers.forEach((btn) =>
        btn.addEventListener('click', () => {
          const list = JSON.parse(btn.dataset.images);
          window.open(list[0].src, '_blank', 'noopener');
        })
      );
      return;
    }

    const img = $('.viewer__img', dialog);
    const title = $('.viewer__title', dialog);
    const count = $('.viewer__count', dialog);
    const nav = $('.viewer__nav', dialog);
    const stage = $('.viewer__stage', dialog);
    let list = [];
    let index = 0;

    const showImage = (i) => {
      index = (i + list.length) % list.length;
      const item = list[index];
      img.src = item.src;
      img.alt = item.alt;
      img.width = item.w;
      img.height = item.h;
      count.textContent = list.length > 1 ? index + 1 + ' of ' + list.length : '';
      stage.scrollTop = 0;
    };

    openers.forEach((btn) =>
      btn.addEventListener('click', () => {
        list = JSON.parse(btn.dataset.images);
        title.textContent = btn.dataset.title;
        nav.hidden = list.length < 2;
        showImage(0);
        root.classList.add('has-dialog');
        dialog.showModal();
      })
    );
    $$('[data-step]', dialog).forEach((b) => b.addEventListener('click', () => showImage(index + Number(b.dataset.step))));
    $('.viewer__close', dialog).addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener('keydown', (e) => {
      if (list.length < 2) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        showImage(index + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        showImage(index - 1);
      }
    });
    dialog.addEventListener('close', () => root.classList.remove('has-dialog'));
  }

  /* ------------------------------------------------------------------
     Start everything
     ------------------------------------------------------------------ */
  // One broken feature should never take the rest of the page down with it.
  const safe = (fn, fallback) => {
    try {
      fn();
    } catch (err) {
      console.error(err);
      if (fallback) fallback();
    }
  };

  function init() {
    if (!failsafed) {
      safe(() => {
        $$('[data-split]').forEach(splitText);
        $$('[data-track]').forEach((el, i) => {
          el.dataset.seed = (i * 1.7).toFixed(2);
          tracked.push(el);
        });
      });
    }

    [initNav, initDecoders, initCopy, initViewer, initTilt, initSpotlight, prepareConsole].forEach((fn) => safe(fn));

    const layout = () => {
      fitTitle();
      tracked.forEach(measureTrack);
    };
    safe(() => {
      layout();
      if (document.fonts) {
        if (document.fonts.ready) document.fonts.ready.then(layout);
        if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', layout);
      }
      window.addEventListener('resize', debounce(layout, 150));
    });

    // Tells the page's safety timer that the intro is under control.
    window.__portfolioReady = true;

    let intro;
    try {
      intro = runPreloader();
    } catch (err) {
      console.error(err);
      const pre = $('#preloader');
      if (pre) pre.remove();
      root.classList.remove('is-loading');
      intro = Promise.resolve();
    }
    intro.then(() => {
      // Background effects start once the curtain lifts (nothing to see before that).
      safe(initParticles);
      safe(() => {
        if (trackObserver && !reduceMotion) tracked.forEach((el) => trackObserver.observe(el));
      });
      safe(jumpToHash);
      safe(heroIntro, () => {
        const hero = $('.hero');
        if (hero) hero.classList.add('is-ready');
      });
      safe(initReveal, () =>
        $$('.reveal, .path__item, [data-split]').forEach((el) => el.classList.add('is-in'))
      );
    });
  }

  init();
})();
