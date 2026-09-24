import type { Player } from '../engine/game.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const NAMES = ['Granite', 'Basalt'] as const;

export class Hud {
  root = $('hud');
  turn = $('turn');
  hintEl = $('hint');
  logEl = $('log');
  undoBtn = $<HTMLButtonElement>('btn-undo');
  soundBtn = $('btn-sound');

  show(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  setTurn(pl: Player, sub: string, thinking = false) {
    this.turn.classList.remove('p0', 'p1');
    this.turn.classList.add(pl === 0 ? 'p0' : 'p1');
    this.turn.classList.toggle('thinking', thinking);
    (this.turn.querySelector('.turn-name') as HTMLElement).textContent = NAMES[pl];
    (this.turn.querySelector('.turn-sub') as HTMLElement).textContent = sub;
  }

  hint(text: string, alert = false) {
    this.hintEl.textContent = text;
    this.hintEl.classList.toggle('alert', alert);
  }

  /** captured: piece code taken by this move (0 = none). 1/2 = Granite student/master, 3/4 = Basalt. */
  log(pl: Player, text: string, captured = 0) {
    const d = document.createElement('div');
    d.className = pl === 0 ? 'p0' : 'p1';
    const t = document.createElement('span');
    t.textContent = text;
    d.appendChild(t);
    if (captured) {
      d.classList.add('cap');
      const m = document.createElement('span');
      const victim = captured <= 2 ? 'g' : 'b';
      const master = captured === 2 || captured === 4;
      m.className = `capmark ${victim}${master ? ' master' : ''}`;
      m.title = `took a ${captured <= 2 ? 'Granite' : 'Basalt'} ${master ? 'Master' : 'student'}`;
      d.appendChild(m);
    }
    this.logEl.appendChild(d);
    while (this.logEl.children.length > 8) this.logEl.firstChild!.remove();
  }

  clearLog() {
    this.logEl.innerHTML = '';
  }

  rebuildLog(entries: { pl: Player; text: string; captured?: number }[]) {
    this.clearLog();
    for (const e of entries.slice(-8)) this.log(e.pl, e.text, e.captured ?? 0);
  }

  /**
   * Opponent's two cards (+ the side card), oriented as they move from the viewer's seat.
   * Card faces are drawn from their owner's seat, so the opponent's are rotated 180°.
   */
  setOpponent(opp: Player, cards: [number, number], names: [string, string], urls: [string, string], side: { url: string; name: string; toViewer: boolean }) {
    const box = document.getElementById('opp')!;
    box.classList.remove('p0', 'p1');
    box.classList.add(opp === 0 ? 'p0' : 'p1');
    (box.querySelector('.opp-title') as HTMLElement).textContent = `${NAMES[opp]}'s cards`;
    const figs = box.querySelectorAll('.opp-cards figure');
    figs.forEach((f, i) => {
      const img = f.querySelector('img') as HTMLImageElement;
      if (img.src !== urls[i]) img.src = urls[i];
      img.alt = names[i];
      (f.querySelector('figcaption') as HTMLElement).textContent = names[i];
    });
    const sImg = box.querySelector('.opp-side img') as HTMLImageElement;
    if (sImg.src !== side.url) sImg.src = side.url;
    sImg.classList.toggle('upright', side.toViewer);
    (box.querySelector('.opp-side span') as HTMLElement).innerHTML = `Side card <b>${side.name}</b><br>${side.toViewer ? 'you take it next' : `${NAMES[opp]} takes it next`}`;
    void cards;
  }

  initOpponentToggle(collapsed: boolean, onChange: (c: boolean) => void) {
    const box = document.getElementById('opp')!;
    const btn = document.getElementById('opp-toggle')!;
    const apply = (c: boolean) => {
      box.classList.toggle('collapsed', c);
      btn.setAttribute('aria-expanded', String(!c));
    };
    apply(collapsed);
    btn.addEventListener('click', () => {
      const c = !box.classList.contains('collapsed');
      apply(c);
      onChange(c);
    });
  }

  setMuted(m: boolean) {
    this.soundBtn.classList.toggle('muted', m);
  }
}

export function overlay(id: string, show: boolean) {
  $(id).classList.toggle('hidden', !show);
}

export function segValue(id: string): string {
  return ($(id).querySelector('button.on') as HTMLElement).dataset.v!;
}

export function initSeg(id: string, value: string | null, onChange?: (v: string) => void) {
  const el = $(id);
  const btns = [...el.querySelectorAll('button')] as HTMLButtonElement[];
  if (value) btns.forEach((b) => b.classList.toggle('on', b.dataset.v === value));
  btns.forEach((b) =>
    b.addEventListener('click', () => {
      btns.forEach((x) => x.classList.toggle('on', x === b));
      onChange?.(b.dataset.v!);
    }),
  );
}
