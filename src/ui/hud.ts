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

  log(pl: Player, text: string) {
    const d = document.createElement('div');
    d.className = pl === 0 ? 'p0' : 'p1';
    d.textContent = text;
    this.logEl.appendChild(d);
    while (this.logEl.children.length > 8) this.logEl.firstChild!.remove();
  }

  clearLog() {
    this.logEl.innerHTML = '';
  }

  rebuildLog(entries: { pl: Player; text: string }[]) {
    this.clearLog();
    for (const e of entries.slice(-8)) this.log(e.pl, e.text);
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
