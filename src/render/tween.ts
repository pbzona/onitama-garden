// Tiny promise-based tween scheduler driven by the render loop.

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outBack: (t: number) => {
    const c1 = 1.4, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
};

interface Job {
  t: number;
  dur: number;
  delay: number;
  ease: Ease;
  update: (k: number, raw: number) => void;
  resolve: () => void;
}

const jobs = new Set<Job>();
let speed = 1;

export function setTweenSpeed(s: number) {
  speed = s;
}

export function tween(
  dur: number,
  update: (k: number, raw: number) => void,
  opts: { ease?: Ease; delay?: number } = {},
): Promise<void> {
  return new Promise((resolve) => {
    jobs.add({ t: 0, dur: Math.max(dur, 1e-4), delay: opts.delay ?? 0, ease: opts.ease ?? ease.inOutCubic, update, resolve });
  });
}

export const wait = (s: number) => tween(s, () => {}, { ease: ease.linear });

export function tickTweens(frameDt: number) {
  frameDt *= speed;
  for (const j of jobs) {
    let dt = frameDt;
    if (j.delay > 0) {
      j.delay -= dt;
      if (j.delay > 0) continue;
      dt = -j.delay;
      j.delay = 0;
    }
    j.t += dt;
    const raw = Math.min(1, j.t / j.dur);
    j.update(j.ease(raw), raw);
    if (raw >= 1) {
      jobs.delete(j);
      j.resolve();
    }
  }
}

export function busy() {
  return jobs.size > 0;
}
