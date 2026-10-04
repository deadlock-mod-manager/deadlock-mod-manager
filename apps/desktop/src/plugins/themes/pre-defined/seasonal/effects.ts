import { type Effect, glowSprite, pick, random } from "./effect-canvas";

export const FIREWORK_EVENT = "dmm:seasonal-firework";

const clear = (ctx: CanvasRenderingContext2D, width: number, height: number) =>
  ctx.clearRect(0, 0, width, height);

/** Christmas: three depths of snow drifting in a slowly turning wind. */
export const createSnow = (): Effect => {
  type Flake = { x: number; y: number; depth: number; phase: number };
  const sprite = glowSprite("255, 248, 236", 32);
  let width = 0;
  let height = 0;
  let flakes: Flake[] = [];

  const flake = (y: number): Flake => ({
    x: random(-20, width + 20),
    y,
    depth: random(0.3, 1) ** 1.6,
    phase: random(0, Math.PI * 2),
  });

  return {
    resize(w, h) {
      width = w;
      height = h;
      const count = Math.round(Math.min(180, Math.max(50, (w * h) / 9000)));
      flakes = Array.from({ length: count }, () => flake(random(-h, h)));
    },
    frame(ctx, dt, time) {
      clear(ctx, width, height);
      const wind = Math.sin(time * 0.11) * 18 + Math.sin(time * 0.037) * 10;
      for (const f of flakes) {
        const size = 1.2 + f.depth * 4.2;
        f.y += (14 + f.depth * 46) * dt;
        f.x +=
          (wind * (0.4 + f.depth) + Math.sin(time * 0.8 + f.phase) * 10) * dt;
        if (f.y > height + 10) Object.assign(f, flake(-10));
        if (f.x > width + 20) f.x = -20;
        if (f.x < -20) f.x = width + 20;
        ctx.globalAlpha = 0.25 + f.depth * 0.6;
        ctx.drawImage(sprite, f.x - size, f.y - size, size * 2, size * 2);
      }
      ctx.globalAlpha = 1;
    },
  };
};

type Bat = {
  x: number;
  y: number;
  baseY: number;
  vx: number;
  size: number;
  flap: number;
  flapSpeed: number;
  wave: number;
};

const drawBat = (ctx: CanvasRenderingContext2D, bat: Bat) => {
  const s = bat.size;
  const lift = Math.sin(bat.flap);
  const tipY = -s * 0.75 * lift;
  ctx.save();
  ctx.translate(bat.x, bat.y);
  ctx.scale(Math.sign(bat.vx), 1);
  ctx.fillStyle = "rgba(12, 6, 18, 0.92)";
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(0, -s * 0.05);
    ctx.quadraticCurveTo(
      side * s * 0.6,
      tipY - s * 0.25,
      side * s * 1.25,
      tipY,
    );
    ctx.quadraticCurveTo(
      side * s * 1.05,
      tipY * 0.4 + s * 0.2,
      side * s * 0.85,
      tipY * 0.3 + s * 0.3,
    );
    ctx.quadraticCurveTo(side * s * 0.7, s * 0.15, side * s * 0.5, s * 0.35);
    ctx.quadraticCurveTo(side * s * 0.35, s * 0.15, 0, s * 0.25);
  }
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, s * 0.1, s * 0.18, s * 0.3, 0, 0, Math.PI * 2);
  ctx.moveTo(-s * 0.14, -s * 0.12);
  ctx.lineTo(-s * 0.1, -s * 0.36);
  ctx.lineTo(-s * 0.02, -s * 0.16);
  ctx.moveTo(s * 0.14, -s * 0.12);
  ctx.lineTo(s * 0.1, -s * 0.36);
  ctx.lineTo(s * 0.02, -s * 0.16);
  ctx.fill();
  ctx.restore();
};

/** Halloween: embers rising from the bottom and the odd colony of bats crossing the screen. */
export const createBatsAndEmbers = (): Effect => {
  type Ember = {
    x: number;
    y: number;
    speed: number;
    phase: number;
    size: number;
    sprite: HTMLCanvasElement;
  };

  const sprites = [
    glowSprite("255, 140, 40", 32),
    glowSprite("255, 180, 60", 32),
    glowSprite("140, 255, 90", 32),
  ];
  let width = 0;
  let height = 0;
  let embers: Ember[] = [];
  let bats: Bat[] = [];
  let nextColony = 2;

  const ember = (y: number): Ember => ({
    x: random(0, width),
    y,
    speed: random(10, 32),
    phase: random(0, Math.PI * 2),
    size: random(1, 2.6),
    sprite: Math.random() < 0.2 ? sprites[2] : pick(sprites.slice(0, 2)),
  });

  const releaseColony = () => {
    const fromLeft = Math.random() < 0.5;
    const baseY = random(height * 0.08, height * 0.5);
    const count = Math.ceil(random(0, 4));
    for (let i = 0; i < count; i++) {
      const speed = random(120, 200);
      bats.push({
        x: fromLeft ? random(-140, -30) : random(width + 30, width + 140),
        y: baseY,
        baseY: baseY + random(-50, 50),
        vx: fromLeft ? speed : -speed,
        size: random(9, 17),
        flap: random(0, Math.PI * 2),
        flapSpeed: random(14, 20),
        wave: random(0, Math.PI * 2),
      });
    }
  };

  return {
    resize(w, h) {
      width = w;
      height = h;
      const count = Math.round(Math.min(40, Math.max(16, w / 50)));
      embers = Array.from({ length: count }, () =>
        ember(random(h * 0.45, h + 20)),
      );
    },
    frame(ctx, dt, time) {
      clear(ctx, width, height);

      for (const e of embers) {
        e.y -= e.speed * dt;
        e.x += Math.sin(time * 1.3 + e.phase) * 12 * dt;
        const rise = (height - e.y) / (height * 0.55);
        if (rise > 1) Object.assign(e, ember(height + 10));
        const flicker = 0.6 + Math.sin(time * 6 + e.phase) * 0.4;
        ctx.globalAlpha = Math.max(0, (1 - rise) * flicker * 0.8);
        const size = e.size * 3;
        ctx.drawImage(e.sprite, e.x - size, e.y - size, size * 2, size * 2);
      }
      ctx.globalAlpha = 1;

      nextColony -= dt;
      if (nextColony <= 0) {
        releaseColony();
        nextColony = random(5, 11);
      }
      bats = bats.filter((bat) => bat.x > -200 && bat.x < width + 200);
      for (const bat of bats) {
        bat.flap += bat.flapSpeed * dt;
        bat.wave += dt * 2.2;
        bat.x += bat.vx * dt;
        bat.y = bat.baseY + Math.sin(bat.wave) * bat.size * 2.4;
        drawBat(ctx, bat);
      }
    },
  };
};

/** New Year's Eve: rockets with trails bursting into peonies, rings and golden willows. */
export const createFireworks = (): Effect => {
  type Rocket = { x: number; y: number; vx: number; vy: number; hue: number };
  type Spark = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    hue: number;
    sat: number;
    light: number;
    drag: number;
    gravity: number;
    crackle: boolean;
  };

  const HUES = [45, 38, 320, 190, 280, 10];
  let width = 0;
  let height = 0;
  let rockets: Rocket[] = [];
  let sparks: Spark[] = [];
  let nextLaunch = 0.6;

  const launch = (x = random(width * 0.1, width * 0.9)) => {
    const apex = random(height * 0.12, height * 0.42);
    rockets.push({
      x,
      y: height + 10,
      vx: random(-30, 30),
      vy: -Math.sqrt(2 * 240 * (height - apex)),
      hue: pick(HUES),
    });
  };

  const burst = (rocket: Rocket) => {
    const kind = pick(["peony", "peony", "ring", "willow"] as const);
    const count = kind === "ring" ? 70 : Math.round(random(80, 130));
    const speed = random(140, 230);
    const secondHue = Math.random() < 0.35 ? pick(HUES) : rocket.hue;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + random(-0.05, 0.05);
      const v =
        kind === "ring" ? speed : speed * Math.sqrt(Math.random()) * 1.05;
      const willow = kind === "willow";
      sparks.push({
        x: rocket.x,
        y: rocket.y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: 0,
        maxLife: willow ? random(2.2, 3.2) : random(1.1, 1.9),
        hue: willow ? 42 : i % 2 ? rocket.hue : secondHue,
        sat: willow ? 85 : 100,
        light: willow ? 62 : random(60, 72),
        drag: willow ? 0.965 : 0.978,
        gravity: willow ? 55 : 80,
        crackle: Math.random() < 0.3,
      });
    }
  };

  const onRequest = () => launch();
  window.addEventListener(FIREWORK_EVENT, onRequest);

  return {
    resize(w, h) {
      width = w;
      height = h;
    },
    frame(ctx, dt, time) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, dt * 9)})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      nextLaunch -= dt;
      if (nextLaunch <= 0) {
        launch();
        if (Math.random() < 0.25) launch();
        nextLaunch = random(0.9, 2.6);
      }

      rockets = rockets.filter((r) => {
        r.vy += 240 * dt;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        ctx.fillStyle = `hsla(${r.hue}, 90%, 80%, 0.9)`;
        ctx.fillRect(r.x - 1, r.y - 1, 2, 4);
        if (r.vy >= -30) {
          burst(r);
          return false;
        }
        return true;
      });

      sparks = sparks.filter((s) => {
        s.life += dt;
        if (s.life >= s.maxLife) return false;
        const drag = s.drag ** (dt * 60);
        s.vx *= drag;
        s.vy = s.vy * drag + s.gravity * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const fade = 1 - s.life / s.maxLife;
        const twinkle =
          s.crackle && fade < 0.5
            ? Math.sin(time * 40 + s.x) > 0
              ? 1
              : 0.2
            : 1;
        ctx.fillStyle = `hsla(${s.hue}, ${s.sat}%, ${s.light}%, ${fade * twinkle})`;
        ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
        return true;
      });

      ctx.globalCompositeOperation = "source-over";
    },
    dispose() {
      window.removeEventListener(FIREWORK_EVENT, onRequest);
    },
  };
};

/** Lunar New Year: glowing paper lanterns drifting upwards among gold motes. */
export const createLanterns = (): Effect => {
  type Lantern = {
    x: number;
    y: number;
    size: number;
    speed: number;
    phase: number;
  };
  type Mote = { x: number; y: number; speed: number; phase: number };

  const glow = glowSprite("255, 120, 40", 64);
  const gold = glowSprite("255, 210, 110", 16);
  let width = 0;
  let height = 0;
  let lanterns: Lantern[] = [];
  let motes: Mote[] = [];

  const lantern = (y: number): Lantern => {
    const depth = random(0.35, 1);
    return {
      x: random(width * 0.05, width * 0.95),
      y,
      size: 12 + depth * 20,
      speed: 6 + depth * 16,
      phase: random(0, Math.PI * 2),
    };
  };

  const drawLantern = (
    ctx: CanvasRenderingContext2D,
    l: Lantern,
    time: number,
  ) => {
    const s = l.size;
    const flicker = 0.85 + Math.sin(time * 5 + l.phase) * 0.08;
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(Math.sin(time * 0.7 + l.phase) * 0.08);

    ctx.globalAlpha = 0.45 * flicker;
    ctx.drawImage(glow, -s * 2.2, -s * 2.2, s * 4.4, s * 4.4);
    ctx.globalAlpha = 1;

    const body = ctx.createRadialGradient(0, 0, s * 0.1, 0, 0, s);
    body.addColorStop(0, `hsla(30, 100%, ${62 * flicker}%, 1)`);
    body.addColorStop(0.6, "hsl(356, 85%, 46%)");
    body.addColorStop(1, "hsl(352, 80%, 30%)");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.72, s * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "hsla(356, 70%, 25%, 0.6)";
    ctx.lineWidth = Math.max(0.6, s * 0.04);
    for (const rib of [-0.4, 0, 0.4]) {
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        Math.abs(rib) * s * 0.72 || 0.5,
        s * 0.6,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    ctx.fillStyle = "hsl(43, 90%, 55%)";
    ctx.fillRect(-s * 0.32, -s * 0.68, s * 0.64, s * 0.14);
    ctx.fillRect(-s * 0.32, s * 0.54, s * 0.64, s * 0.14);
    ctx.fillRect(-s * 0.03, s * 0.68, s * 0.06, s * 0.45);
    ctx.restore();
  };

  return {
    resize(w, h) {
      width = w;
      height = h;
      const count = Math.round(Math.min(16, Math.max(8, w / 110)));
      lanterns = Array.from({ length: count }, () =>
        lantern(random(0, h)),
      ).sort((a, b) => a.size - b.size);
      motes = Array.from({ length: 30 }, () => ({
        x: random(0, w),
        y: random(0, h),
        speed: random(6, 18),
        phase: random(0, Math.PI * 2),
      }));
    },
    frame(ctx, dt, time) {
      clear(ctx, width, height);
      for (const m of motes) {
        m.y -= m.speed * dt;
        if (m.y < -10) m.y = height + 10;
        ctx.globalAlpha = 0.3 + Math.sin(time * 2 + m.phase) * 0.3;
        ctx.drawImage(gold, m.x + Math.sin(time + m.phase) * 8, m.y, 6, 6);
      }
      ctx.globalAlpha = 1;
      for (const l of lanterns) {
        l.y -= l.speed * dt;
        l.x += Math.sin(time * 0.4 + l.phase) * 6 * dt;
        if (l.y < -l.size * 3) {
          l.y = height + l.size * 3;
          l.x = random(width * 0.05, width * 0.95);
        }
        drawLantern(ctx, l, time);
      }
    },
  };
};

/** Easter: blossom petals tumbling down in soft pastels. */
export const createPetals = (): Effect => {
  type Petal = {
    x: number;
    y: number;
    size: number;
    speed: number;
    spin: number;
    angle: number;
    flip: number;
    color: string;
  };

  const COLORS = [
    "hsla(340, 85%, 86%, 0.85)",
    "hsla(350, 90%, 92%, 0.85)",
    "hsla(50, 95%, 85%, 0.8)",
    "hsla(0, 0%, 100%, 0.8)",
  ];
  let width = 0;
  let height = 0;
  let petals: Petal[] = [];

  const petal = (y: number): Petal => ({
    x: random(-20, width),
    y,
    size: random(4, 9),
    speed: random(16, 38),
    spin: random(-1.6, 1.6),
    angle: random(0, Math.PI * 2),
    flip: random(0, Math.PI * 2),
    color: pick(COLORS),
  });

  return {
    resize(w, h) {
      width = w;
      height = h;
      const count = Math.round(Math.min(40, Math.max(18, w / 45)));
      petals = Array.from({ length: count }, () => petal(random(-h, h)));
    },
    frame(ctx, dt, time) {
      clear(ctx, width, height);
      for (const p of petals) {
        p.y += p.speed * dt;
        p.x += (14 + Math.sin(time * 0.9 + p.flip) * 20) * dt;
        p.angle += p.spin * dt;
        p.flip += dt * 2.4;
        if (p.y > height + 20 || p.x > width + 20) Object.assign(p, petal(-20));

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(p.flip))));
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.bezierCurveTo(
          p.size * 0.9,
          -p.size * 0.6,
          p.size * 0.7,
          p.size * 0.7,
          0,
          p.size,
        );
        ctx.bezierCurveTo(
          -p.size * 0.7,
          p.size * 0.7,
          -p.size * 0.9,
          -p.size * 0.6,
          0,
          -p.size,
        );
        ctx.fill();
        ctx.restore();
      }
    },
  };
};
