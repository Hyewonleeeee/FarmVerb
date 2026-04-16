type RouteKey = 'home' | 'instrument' | 'plugins' | 'sample-pack' | 'support';

type SwitchOptions = {
  fromHash?: boolean;
};

type RouteConfig = {
  hash: string;
  title: string;
};

const ROUTES: Record<RouteKey, RouteConfig> = {
  home: {
    hash: '#/',
    title: 'FarmVerb | Grow Your Sound'
  },
  instrument: {
    hash: '#/instrument',
    title: 'FarmVerb | Software Instrument'
  },
  plugins: {
    hash: '#/plugins',
    title: 'FarmVerb | Audio Plugins'
  },
  'sample-pack': {
    hash: '#/sample-pack',
    title: 'FarmVerb | Sample Pack'
  },
  support: {
    hash: '#/support',
    title: 'FarmVerb | Support'
  }
};

type Source = {
  nx: number;
  ny: number;
  max: number;
  rate: number;
  seed: number;
  driftX: number;
  driftY: number;
  color: string;
  index: number;
  x: number;
  y: number;
  maxRadius: number;
  ringCount: number;
  irregularity: number;
  ovalX: number;
  ovalY: number;
};

type LocalEmitter = {
  x: number;
  y: number;
  radius: number;
  life: number;
  speed: number;
  tightness: number;
  seed: number;
};

type FarmDroplet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
};

type FarmRipple = {
  x: number;
  y: number;
  radius: number;
  growth: number;
  life: number;
  color: string;
  lineWidth: number;
  phase: number;
};

class HomeAmbient {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private time = 0;
  private readonly tau = Math.PI * 2;
  private sources: Source[] = [];
  private localEmitters: LocalEmitter[] = [];
  private readonly maxLocalEmitters = 14;
  private farmDroplets: FarmDroplet[] = [];
  private farmRipples: FarmRipple[] = [];
  private readonly maxFarmDroplets = 620;
  private readonly maxFarmRipples = 72;
  private lastSpawnAt = 0;
  private lastFarmSplashAt = 0;
  private lastCursorWaveAt = 0;
  private pointerInCanvas = false;
  private frameId: number | null = null;
  private readonly prefersReducedMotion: boolean;

  private pointer = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    activity: 0,
    lastX: 0,
    lastY: 0
  };

  constructor(canvas: HTMLCanvasElement, prefersReducedMotion: boolean) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create 2D context for home ambient canvas.');
    }

    this.canvas = canvas;
    this.ctx = ctx;
    this.prefersReducedMotion = prefersReducedMotion;

    this.resize();
    this.createSources();
    this.resetPointer();
    this.bindEvents();

    if (!this.prefersReducedMotion) {
      this.animate();
    } else {
      this.drawFrame(3200);
    }
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('pointerdown', this.onPointerDown);

    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private onResize = () => {
    this.resize();
    this.createSources();
    this.resetPointer();
  };

  private resetPointer() {
    this.pointer.x = this.pointer.targetX = this.w * 0.5;
    this.pointer.y = this.pointer.targetY = this.h * 0.5;
    this.pointer.lastX = this.pointer.x;
    this.pointer.lastY = this.pointer.y;
    this.pointer.activity = 0;
    this.pointerInCanvas = false;
  }

  private createSources() {
    const span = Math.min(this.w, this.h);
    this.sources = [
      { nx: 0.18, ny: 0.26, max: 0.52, rate: 0.000082, seed: 0.8, driftX: 0.024, driftY: 0.018, color: '194,231,118' },
      { nx: 0.72, ny: 0.22, max: 0.45, rate: 0.000074, seed: 1.6, driftX: 0.02, driftY: 0.022, color: '233,217,164' },
      { nx: 0.34, ny: 0.72, max: 0.48, rate: 0.000071, seed: 2.7, driftX: 0.02, driftY: 0.018, color: '179,221,128' },
      { nx: 0.84, ny: 0.66, max: 0.42, rate: 0.000068, seed: 3.4, driftX: 0.018, driftY: 0.02, color: '220,231,164' }
    ].map((source, index) => ({
      ...source,
      index,
      x: this.w * source.nx,
      y: this.h * source.ny,
      maxRadius: span * source.max,
      ringCount: 4 + (index % 2),
      irregularity: 0.028 + index * 0.005,
      ovalX: 1.08 - index * 0.08,
      ovalY: 0.88 + index * 0.06
    }));
  }

  private bindEvents() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
  }

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const insideX = event.clientX >= rect.left && event.clientX <= rect.right;
    const insideY = event.clientY >= rect.top && event.clientY <= rect.bottom;

    if (!insideX || !insideY) {
      this.pointerInCanvas = false;
      return;
    }

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const dx = x - this.pointer.lastX;
    const dy = y - this.pointer.lastY;
    const speed = Math.hypot(dx, dy);

    this.pointer.targetX = x;
    this.pointer.targetY = y;
    this.pointer.activity = Math.min(1.35, this.pointer.activity * 0.72 + speed / 34);
    this.pointer.lastX = x;
    this.pointer.lastY = y;
    this.pointerInCanvas = true;

    const now = performance.now();
    if (now - this.lastSpawnAt > 82 && speed > 0.32) {
      this.spawnLocalEmitter(x, y, Math.min(1.2, speed / 13));
      this.lastSpawnAt = now;
    }

    if (now - this.lastFarmSplashAt > 34 && speed > 0.08) {
      this.spawnFarmSplash(x, y, Math.min(1.5, 0.8 + speed / 7.2), 'trail');
      this.lastFarmSplashAt = now;
    }
  };

  private onPointerLeave = () => {
    this.pointer.targetX = this.w * 0.5;
    this.pointer.targetY = this.h * 0.5;
    this.pointer.activity *= 0.4;
    this.pointerInCanvas = false;
  };

  private onPointerDown = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const insideX = event.clientX >= rect.left && event.clientX <= rect.right;
    const insideY = event.clientY >= rect.top && event.clientY <= rect.bottom;

    if (!insideX || !insideY) {
      return;
    }

    this.emitFarmSplashFromViewport(event.clientX, event.clientY, 1.1);
  };

  private resize() {
    this.dpr = Math.max(window.devicePixelRatio || 1, 1);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private spawnLocalEmitter(x: number, y: number, intensity: number) {
    this.localEmitters.push({
      x,
      y,
      radius: 3 + intensity * 2.4,
      life: 1,
      speed: 1 + intensity * 1.4,
      tightness: 0.02 + intensity * 0.06,
      seed: Math.random() * this.tau
    });

    if (this.localEmitters.length > this.maxLocalEmitters) {
      this.localEmitters.shift();
    }
  }

  emitFarmSplashFromViewport(clientX: number, clientY: number, intensity = 0.9) {
    const rect = this.canvas.getBoundingClientRect();
    const insideX = clientX >= rect.left && clientX <= rect.right;
    const insideY = clientY >= rect.top && clientY <= rect.bottom;

    if (!insideX || !insideY) {
      return;
    }

    this.spawnFarmSplash(clientX - rect.left, clientY - rect.top, Math.min(1.6, intensity), 'burst');
  }

  private spawnFarmSplash(x: number, y: number, intensity: number, mode: 'trail' | 'burst') {
    const clampedIntensity = Math.max(0.35, Math.min(1.35, intensity));
    const ringCount = mode === 'trail' ? 2 : 4;
    const dropletCount = mode === 'trail' ? 18 + Math.round(clampedIntensity * 14) : 34 + Math.round(clampedIntensity * 22);
    const palette = ['173,229,106', '194,239,130', '213,245,158', '232,248,188'];

    for (let i = 0; i < ringCount; i += 1) {
      this.farmRipples.push({
        x,
        y,
        radius: 2.8 + i * 2.5 + clampedIntensity * 1.5,
        growth: 1.05 + clampedIntensity * (mode === 'trail' ? 0.95 : 1.45) + i * 0.2,
        life: mode === 'trail' ? 0.74 : 1.02,
        color: i % 2 === 0 ? '184,236,118' : '224,243,178',
        lineWidth: mode === 'trail' ? 1.05 : 1.45 - i * 0.08,
        phase: Math.random() * this.tau
      });
    }

    for (let i = 0; i < dropletCount; i += 1) {
      const angle = Math.random() * this.tau;
      const speedBase = mode === 'trail' ? 0.42 : 0.72;
      const speedRange = mode === 'trail' ? 1.55 : 2.2;
      const speed = (speedBase + Math.random() * speedRange) * (0.9 + clampedIntensity * 0.92);

      this.farmDroplets.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 7,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (mode === 'trail' ? 0.05 : 0.15),
        life: mode === 'trail' ? 1.25 + Math.random() * 0.48 : 1.55 + Math.random() * 0.55,
        size: (mode === 'trail' ? 0.85 : 1.1) + Math.random() * 0.8 + clampedIntensity * 0.16,
        color: palette[Math.floor(Math.random() * palette.length)] || palette[0]
      });
    }

    if (this.farmRipples.length > this.maxFarmRipples) {
      this.farmRipples.splice(0, this.farmRipples.length - this.maxFarmRipples);
    }
    if (this.farmDroplets.length > this.maxFarmDroplets) {
      this.farmDroplets.splice(0, this.farmDroplets.length - this.maxFarmDroplets);
    }
  }

  private updatePointerAndSources(timestamp: number) {
    this.pointer.x += (this.pointer.targetX - this.pointer.x) * 0.11;
    this.pointer.y += (this.pointer.targetY - this.pointer.y) * 0.11;
    this.pointer.activity *= 0.968;

    this.sources.forEach((source) => {
      const tx = timestamp * source.rate * (33 + source.index * 8) + source.seed;
      const ty = timestamp * source.rate * (27 + source.index * 6) + source.seed * 1.4;
      source.x = this.w * source.nx + Math.cos(tx) * this.w * source.driftX;
      source.y = this.h * source.ny + Math.sin(ty) * this.h * source.driftY;
    });
  }

  private updateLocalEmitters() {
    this.localEmitters = this.localEmitters
      .map((emitter) => ({
        ...emitter,
        radius: emitter.radius + 1.25 + emitter.speed * 1.25,
        life: emitter.life - 0.017
      }))
      .filter((emitter) => emitter.life > 0);
  }

  private updateFarmSplash() {
    this.farmRipples = this.farmRipples
      .map((ripple) => ({
        ...ripple,
        radius: ripple.radius + ripple.growth,
        growth: ripple.growth * 0.9975,
        life: ripple.life - 0.0135
      }))
      .filter((ripple) => ripple.life > 0);

    this.farmDroplets = this.farmDroplets
      .map((droplet) => ({
        ...droplet,
        x: droplet.x + droplet.vx,
        y: droplet.y + droplet.vy,
        vx: droplet.vx * 0.991,
        vy: droplet.vy * 0.991 + 0.0055,
        life: droplet.life - 0.0064,
        size: droplet.size * 0.999
      }))
      .filter((droplet) => droplet.life > 0 && droplet.x > -30 && droplet.x < this.w + 30 && droplet.y > -30 && droplet.y < this.h + 30);
  }

  private emitCursorHoverWave(timestamp: number) {
    if (!this.pointerInCanvas) {
      return;
    }

    if (timestamp - this.lastCursorWaveAt < 170) {
      return;
    }

    const intensity = 0.5 + Math.min(0.14, this.pointer.activity * 0.1);
    this.spawnFarmSplash(this.pointer.targetX, this.pointer.targetY, intensity, 'trail');
    this.lastCursorWaveAt = timestamp;
  }

  private drawFarmSplash() {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';

    this.farmRipples.forEach((ripple) => {
      const alpha = Math.min(0.52, Math.pow(ripple.life, 1.15) * 0.58);
      const ovalX = 1 + Math.sin(this.time * 0.0018 + ripple.phase) * 0.05;
      const ovalY = 1 + Math.cos(this.time * 0.0015 + ripple.phase * 0.6) * 0.04;

      this.ctx.beginPath();
      this.ctx.ellipse(ripple.x, ripple.y, ripple.radius * ovalX, ripple.radius * ovalY, 0, 0, this.tau);
      this.ctx.strokeStyle = `rgba(${ripple.color}, ${alpha})`;
      this.ctx.lineWidth = ripple.lineWidth;
      this.ctx.stroke();
    });

    this.farmDroplets.forEach((droplet) => {
      const alpha = Math.min(0.98, Math.pow(droplet.life, 1.04) * 0.98);
      const glowAlpha = alpha * 0.9;

      this.ctx.beginPath();
      this.ctx.arc(droplet.x, droplet.y, droplet.size, 0, this.tau);
      this.ctx.fillStyle = `rgba(${droplet.color}, ${alpha})`;
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.arc(droplet.x, droplet.y, droplet.size * 1.8, 0, this.tau);
      this.ctx.fillStyle = `rgba(243, 252, 222, ${glowAlpha})`;
      this.ctx.fill();
    });

    this.ctx.restore();
  }

  private drawOrganicRing(options: {
    cx: number;
    cy: number;
    radius: number;
    ovalX: number;
    ovalY: number;
    irregularity: number;
    phase: number;
    alpha: number;
    color: string;
    lineWidth: number;
  }) {
    const { cx, cy, radius, ovalX, ovalY, irregularity, phase, alpha, color, lineWidth } = options;

    if (alpha <= 0 || radius <= 0) {
      return;
    }

    const segments = Math.max(26, Math.min(64, Math.floor(radius * 0.35)));
    this.ctx.beginPath();

    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * this.tau;
      const wobbleA = Math.sin(a * 3 + phase) * irregularity;
      const wobbleB = Math.sin(a * 6 - phase * 0.7) * irregularity * 0.55;
      const wobbleC = Math.sin(a * 9 + phase * 0.38) * irregularity * 0.28;
      const r = radius * (1 + wobbleA + wobbleB + wobbleC);
      const x = cx + Math.cos(a) * r * ovalX;
      const y = cy + Math.sin(a) * r * ovalY;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.strokeStyle = `rgba(${color}, ${alpha})`;
    this.ctx.lineWidth = lineWidth;
    this.ctx.stroke();
  }

  private drawSourceField(timestamp: number) {
    this.sources.forEach((source) => {
      const dx = this.pointer.x - source.x;
      const dy = this.pointer.y - source.y;
      const proximity = Math.exp(-(dx * dx + dy * dy) / (270 * 270));
      const localExcite = proximity * this.pointer.activity;
      const densityBoost = Math.round(localExcite * 3.2);
      const ringTotal = source.ringCount + densityBoost;
      const speedBoost = 1 + localExcite * 1.95;

      for (let i = 0; i < ringTotal; i += 1) {
        const orbit = (timestamp * source.rate * speedBoost + i / ringTotal + source.seed * 0.3) % 1;
        const radius = 22 + orbit * source.maxRadius;
        const alphaBase = Math.pow(1 - orbit, 1.52) * (0.14 + localExcite * 0.115);
        const phase = timestamp * 0.00072 * speedBoost + source.seed + i * 0.62;

        this.drawOrganicRing({
          cx: source.x,
          cy: source.y,
          radius,
          ovalX: source.ovalX,
          ovalY: source.ovalY,
          irregularity: source.irregularity * (1 + localExcite * 0.36),
          phase,
          alpha: alphaBase,
          color: source.color,
          lineWidth: 1 + i * 0.05
        });
      }
    });
  }

  private drawLocalExcitation(timestamp: number) {
    this.localEmitters.forEach((emitter) => {
      for (let layer = 0; layer < 3; layer += 1) {
        const radius = emitter.radius + layer * 13;
        const alpha = emitter.life * (0.18 - layer * 0.034);
        const phase = timestamp * 0.0022 * emitter.speed + emitter.seed + layer * 0.9;

        this.drawOrganicRing({
          cx: emitter.x,
          cy: emitter.y,
          radius,
          ovalX: 1.02 + layer * 0.04,
          ovalY: 0.84 + layer * 0.05,
          irregularity: 0.026 + layer * 0.012 + emitter.tightness,
          phase,
          alpha,
          color: layer === 0 ? '214,237,152' : '234,219,174',
          lineWidth: 1.05 - layer * 0.16
        });
      }
    });
  }

  private drawFrame(timestamp: number) {
    this.time = timestamp;
    this.ctx.clearRect(0, 0, this.w, this.h);

    this.ctx.fillStyle = 'rgba(250, 246, 226, 0.045)';
    this.ctx.fillRect(0, 0, this.w, this.h);

    this.updatePointerAndSources(timestamp);
    this.updateLocalEmitters();
    this.updateFarmSplash();
    this.emitCursorHoverWave(timestamp);
    this.drawSourceField(timestamp);
    this.drawLocalExcitation(timestamp);
    this.drawFarmSplash();
  }

  private animate = (timestamp = 0) => {
    this.drawFrame(timestamp);
    this.frameId = window.requestAnimationFrame(this.animate);
  };
}

export function initFarmVerbSite() {
  const pageEntries = Array.from(document.querySelectorAll<HTMLElement>('.page'))
    .map((page) => [page.dataset.page, page] as const)
    .filter(([pageKey]) => Boolean(pageKey) && pageKey in ROUTES);

  const pages = new Map<RouteKey, HTMLElement>(pageEntries as Array<readonly [RouteKey, HTMLElement]>);
  if (pages.size === 0) {
    return () => undefined;
  }

  const navLinks = Array.from(document.querySelectorAll<HTMLElement>('.site-header .nav-link[data-route]'));
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let activeRoute: RouteKey = 'home';
  let transitionTimer: number | null = null;

  const normalizeRoute = (inputRoute: string): RouteKey => {
    if (inputRoute in ROUTES) {
      return inputRoute as RouteKey;
    }
    return 'home';
  };

  const routeFromHash = (hash: string) => {
    const route = hash.replace(/^#\/?/, '').trim();
    return normalizeRoute(route || 'home');
  };

  const updateNavState = (route: RouteKey) => {
    navLinks.forEach((link) => {
      link.classList.toggle('is-current', link.dataset.route === route);
    });
  };

  const updateTitle = (route: RouteKey) => {
    document.title = ROUTES[route].title;
  };

  const switchTo = (route: string, options: SwitchOptions = {}) => {
    const nextRoute = normalizeRoute(route);
    const { fromHash = false } = options;

    if (nextRoute === activeRoute) {
      updateNavState(nextRoute);
      updateTitle(nextRoute);
      if (!fromHash && window.location.hash !== ROUTES[nextRoute].hash) {
        history.replaceState(null, '', ROUTES[nextRoute].hash);
      }
      return;
    }

    const currentPage = pages.get(activeRoute);
    const nextPage = pages.get(nextRoute);

    if (!currentPage || !nextPage) {
      return;
    }

    if (transitionTimer !== null) {
      window.clearTimeout(transitionTimer);
      transitionTimer = null;
    }

    currentPage.classList.add('is-leaving');
    currentPage.classList.remove('is-active');
    currentPage.setAttribute('aria-hidden', 'true');

    nextPage.classList.add('is-active');
    nextPage.setAttribute('aria-hidden', 'false');
    nextPage.scrollTop = 0;

    transitionTimer = window.setTimeout(() => {
      currentPage.classList.remove('is-leaving');
    }, prefersReducedMotion ? 0 : 650);

    activeRoute = nextRoute;
    updateNavState(nextRoute);
    updateTitle(nextRoute);

    if (!fromHash && window.location.hash !== ROUTES[nextRoute].hash) {
      history.pushState(null, '', ROUTES[nextRoute].hash);
    }
  };

  const onDocumentClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const routeLink = event.target.closest<HTMLElement>('[data-route]');
    if (!routeLink) {
      return;
    }

    const routeKey = routeLink.dataset.route;
    if (!routeKey || !(routeKey in ROUTES)) {
      return;
    }

    event.preventDefault();
    switchTo(routeKey);
  };

  const onHashChange = () => {
    switchTo(routeFromHash(window.location.hash), { fromHash: true });
  };

  document.addEventListener('click', onDocumentClick);
  window.addEventListener('hashchange', onHashChange);
  switchTo(routeFromHash(window.location.hash), { fromHash: true });

  const homeCanvas = document.getElementById('home-canvas');
  const ambient = homeCanvas instanceof HTMLCanvasElement ? new HomeAmbient(homeCanvas, prefersReducedMotion) : null;

  const railCleanup: Array<() => void> = [];
  document.querySelectorAll<HTMLElement>('.device-rail').forEach((rail) => {
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        rail.scrollLeft += event.deltaY;
        event.preventDefault();
      }
    };

    rail.addEventListener('wheel', onWheel, { passive: false });
    railCleanup.push(() => rail.removeEventListener('wheel', onWheel));
  });

  const galleryCleanup: Array<() => void> = [];
  document.querySelectorAll<HTMLElement>('[data-auto-gallery]').forEach((gallery) => {
    const slides = Array.from(gallery.querySelectorAll('img'));
    if (slides.length < 2) {
      return;
    }

    let index = 0;
    let timerId: number | null = null;

    const moveTo = (nextIndex: number, behavior: ScrollBehavior = 'smooth') => {
      const width = gallery.clientWidth;
      if (width <= 0) {
        return;
      }

      const safeIndex = Math.max(0, Math.min(slides.length - 1, nextIndex));
      index = safeIndex;
      gallery.scrollTo({
        left: safeIndex * width,
        behavior
      });
    };

    const stop = () => {
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };

    const start = () => {
      stop();
      if (prefersReducedMotion) {
        return;
      }

      timerId = window.setInterval(() => {
        const nextIndex = (index + 1) % slides.length;
        moveTo(nextIndex, 'smooth');
      }, 3600);
    };

    const syncIndexFromScroll = () => {
      const width = gallery.clientWidth;
      if (width <= 0) {
        return;
      }

      index = Math.round(gallery.scrollLeft / width);
    };

    const onResize = () => moveTo(index, 'auto');

    gallery.addEventListener('scroll', syncIndexFromScroll, { passive: true });
    gallery.addEventListener('pointerdown', stop);
    gallery.addEventListener('pointerup', start);
    gallery.addEventListener('pointercancel', start);
    gallery.addEventListener('mouseenter', stop);
    gallery.addEventListener('mouseleave', start);
    window.addEventListener('resize', onResize);

    moveTo(0, 'auto');
    start();

    galleryCleanup.push(() => {
      stop();
      gallery.removeEventListener('scroll', syncIndexFromScroll);
      gallery.removeEventListener('pointerdown', stop);
      gallery.removeEventListener('pointerup', start);
      gallery.removeEventListener('pointercancel', start);
      gallery.removeEventListener('mouseenter', stop);
      gallery.removeEventListener('mouseleave', start);
      window.removeEventListener('resize', onResize);
    });
  });

  const dragCleanup: Array<() => void> = [];
  const homePage = pages.get('home');

  if (homePage) {
    let selectionLockCount = 0;
    const previousUserSelect = document.body.style.userSelect;
    const previousWebkitUserSelect = document.body.style.getPropertyValue('-webkit-user-select');

    const lockSelection = () => {
      selectionLockCount += 1;
      if (selectionLockCount === 1) {
        document.body.style.userSelect = 'none';
        document.body.style.setProperty('-webkit-user-select', 'none');
      }
    };

    const unlockSelection = () => {
      selectionLockCount = Math.max(0, selectionLockCount - 1);
      if (selectionLockCount === 0) {
        document.body.style.userSelect = previousUserSelect;
        if (previousWebkitUserSelect) {
          document.body.style.setProperty('-webkit-user-select', previousWebkitUserSelect);
        } else {
          document.body.style.removeProperty('-webkit-user-select');
        }
      }
    };

    const draggableNodes = homePage.querySelectorAll<HTMLElement>('.crop-node, .fruit-node');

    draggableNodes.forEach((node) => {
      let isDragging = false;
      let pointerId = -1;
      let startOffsetX = 0;
      let startOffsetY = 0;
      let nodeW = 0;
      let nodeH = 0;
      let lastHoverSplashAt = 0;

      const emitNodeSplash = (intensity: number) => {
        if (!ambient) {
          return;
        }
        const rect = node.getBoundingClientRect();
        ambient.emitFarmSplashFromViewport(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5, intensity);
      };

      const moveNode = (event: PointerEvent) => {
        if (!isDragging || event.pointerId !== pointerId) {
          return;
        }

        const rect = homePage.getBoundingClientRect();
        const nextLeftRaw = event.clientX - rect.left - startOffsetX;
        const nextTopRaw = event.clientY - rect.top - startOffsetY;

        const maxLeft = Math.max(0, rect.width - nodeW);
        const maxTop = Math.max(0, rect.height - nodeH);

        const nextLeft = Math.min(maxLeft, Math.max(0, nextLeftRaw));
        const nextTop = Math.min(maxTop, Math.max(0, nextTopRaw));

        node.style.left = `${nextLeft}px`;
        node.style.top = `${nextTop}px`;
      };

      const stopDrag = (event: PointerEvent) => {
        if (!isDragging || event.pointerId !== pointerId) {
          return;
        }

        isDragging = false;
        unlockSelection();
        node.classList.remove('is-dragging');
        node.classList.add('is-placed');
        node.dataset.depth = '0';
        node.style.setProperty('--px', '0px');
        node.style.setProperty('--py', '0px');
        node.style.setProperty('--fx', '0px');
        node.style.setProperty('--fy', '0px');
        try {
          node.releasePointerCapture(pointerId);
        } catch {
          // ignore capture release errors
        }
      };

      const startDrag = (event: PointerEvent) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        lockSelection();

        const containerRect = homePage.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();

        isDragging = true;
        pointerId = event.pointerId;
        nodeW = nodeRect.width;
        nodeH = nodeRect.height;

        startOffsetX = event.clientX - nodeRect.left;
        startOffsetY = event.clientY - nodeRect.top;

        if (!node.dataset.dragDepthOriginal) {
          node.dataset.dragDepthOriginal = node.dataset.depth || '0';
        }
        node.dataset.depth = '0';
        node.style.setProperty('--px', '0px');
        node.style.setProperty('--py', '0px');
        node.style.setProperty('--fx', '0px');
        node.style.setProperty('--fy', '0px');

        node.style.left = `${nodeRect.left - containerRect.left}px`;
        node.style.top = `${nodeRect.top - containerRect.top}px`;
        node.style.right = 'auto';
        node.style.bottom = 'auto';

        node.classList.add('is-dragging');
        node.setPointerCapture(pointerId);
        emitNodeSplash(1.04);
      };

      const onPointerEnter = () => {
        const now = performance.now();
        if (now - lastHoverSplashAt < 200) {
          return;
        }
        lastHoverSplashAt = now;
        emitNodeSplash(0.9);
      };

      node.addEventListener('pointerdown', startDrag);
      node.addEventListener('pointermove', moveNode);
      node.addEventListener('pointerup', stopDrag);
      node.addEventListener('pointercancel', stopDrag);
      node.addEventListener('pointerenter', onPointerEnter);

      dragCleanup.push(() => {
        if (isDragging) {
          unlockSelection();
          isDragging = false;
        }
        node.removeEventListener('pointerdown', startDrag);
        node.removeEventListener('pointermove', moveNode);
        node.removeEventListener('pointerup', stopDrag);
        node.removeEventListener('pointercancel', stopDrag);
        node.removeEventListener('pointerenter', onPointerEnter);
      });
    });

    dragCleanup.push(() => {
      selectionLockCount = 0;
      document.body.style.userSelect = previousUserSelect;
      if (previousWebkitUserSelect) {
        document.body.style.setProperty('-webkit-user-select', previousWebkitUserSelect);
      } else {
        document.body.style.removeProperty('-webkit-user-select');
      }
    });
  }

  const motionCleanup: Array<() => void> = [];

  if (!prefersReducedMotion) {
    const interactiveElements = document.querySelectorAll<HTMLElement>('.interactive-tilt');

    interactiveElements.forEach((element) => {
      const onPointerMove = (event: PointerEvent) => {
        const rect = element.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width;
        const py = (event.clientY - rect.top) / rect.height;
        const ry = (px - 0.5) * 3.8;
        const rx = (0.5 - py) * 3.8;

        element.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
        element.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
      };

      const resetTilt = () => {
        element.style.setProperty('--rx', '0deg');
        element.style.setProperty('--ry', '0deg');
      };

      element.addEventListener('pointermove', onPointerMove);
      element.addEventListener('pointerleave', resetTilt);
      element.addEventListener('blur', resetTilt);

      motionCleanup.push(() => {
        element.removeEventListener('pointermove', onPointerMove);
        element.removeEventListener('pointerleave', resetTilt);
        element.removeEventListener('blur', resetTilt);
      });
    });

    const parallaxNodes = document.querySelectorAll<HTMLElement>('.parallax-node');
    const floatingNodes =
      homePage !== undefined
        ? Array.from(homePage.querySelectorAll<HTMLElement>('.crop-node, .fruit-node'))
        : [];

    const resetFloatingFollow = () => {
      floatingNodes.forEach((node) => {
        node.style.setProperty('--fx', '0px');
        node.style.setProperty('--fy', '0px');
      });
    };

    const updateFloatingFollow = (clientX: number, clientY: number) => {
      floatingNodes.forEach((node) => {
        if (node.classList.contains('is-dragging') || node.classList.contains('is-placed')) {
          node.style.setProperty('--fx', '0px');
          node.style.setProperty('--fy', '0px');
          return;
        }

        const rect = node.getBoundingClientRect();
        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const distance = Math.hypot(dx, dy);
        const influenceRadius = Math.max(110, Math.min(240, Math.max(rect.width, rect.height) * 2.3));
        const influence = Math.max(0, 1 - distance / influenceRadius);
        const easedInfluence = influence * influence;
        const depth = Math.max(1, Number(node.dataset.depth || node.dataset.dragDepthOriginal || 3));
        const amplitude = 0.9 + depth * 0.45;

        const dirX = distance > 0 ? dx / distance : 0;
        const dirY = distance > 0 ? dy / distance : 0;
        const fx = dirX * amplitude * easedInfluence;
        const fy = dirY * amplitude * easedInfluence * 0.78;

        node.style.setProperty('--fx', `${fx.toFixed(2)}px`);
        node.style.setProperty('--fy', `${fy.toFixed(2)}px`);
      });
    };

    const onWindowPointerMove = (event: PointerEvent) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const offsetX = (event.clientX - centerX) / centerX;
      const offsetY = (event.clientY - centerY) / centerY;

      parallaxNodes.forEach((node) => {
        const depth = Number(node.dataset.depth || 8) * 0.55;
        node.style.setProperty('--px', `${(-offsetX * depth).toFixed(2)}px`);
        node.style.setProperty('--py', `${(-offsetY * depth).toFixed(2)}px`);
      });

      updateFloatingFollow(event.clientX, event.clientY);
    };

    const onWindowPointerLeave = () => {
      parallaxNodes.forEach((node) => {
        node.style.setProperty('--px', '0px');
        node.style.setProperty('--py', '0px');
      });
      resetFloatingFollow();
    };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerleave', onWindowPointerLeave);

    motionCleanup.push(() => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerleave', onWindowPointerLeave);
    });
  }

  return () => {
    document.removeEventListener('click', onDocumentClick);
    window.removeEventListener('hashchange', onHashChange);

    if (transitionTimer !== null) {
      window.clearTimeout(transitionTimer);
      transitionTimer = null;
    }

    ambient?.destroy();
    railCleanup.forEach((cleanup) => cleanup());
    galleryCleanup.forEach((cleanup) => cleanup());
    dragCleanup.forEach((cleanup) => cleanup());
    motionCleanup.forEach((cleanup) => cleanup());
  };
}
