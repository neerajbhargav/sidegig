// Pomodoro: focus, short break, and a long break every few rounds. The state
// is plain data kept in storage, so it carries across new tabs.

export type PomoPhase = 'focus' | 'short' | 'long';

export interface PomoConfig {
  focus: number;
  short: number;
  long: number;
  /** A long break after this many focus rounds. */
  every: number;
}

export interface PomoState {
  phase: PomoPhase;
  running: boolean;
  /** When the running phase ends (ms since epoch). */
  endsAt: number;
  /** Time left while paused (ms). */
  left: number;
  /** Focus rounds finished. */
  rounds: number;
}

export const POMO_DEFAULT: PomoConfig = { focus: 25, short: 5, long: 15, every: 4 };

export const phaseMs = (p: PomoPhase, c: PomoConfig) => (p === 'focus' ? c.focus : p === 'short' ? c.short : c.long) * 60_000;

export const freshPomo = (c: PomoConfig): PomoState => ({ phase: 'focus', running: false, endsAt: 0, left: phaseMs('focus', c), rounds: 0 });

export function msLeft(s: PomoState, now: number): number {
  return s.running ? Math.max(0, s.endsAt - now) : s.left;
}

export function start(s: PomoState, now: number): PomoState {
  return s.running ? s : { ...s, running: true, endsAt: now + s.left };
}

export function pause(s: PomoState, now: number): PomoState {
  return s.running ? { ...s, running: false, left: Math.max(0, s.endsAt - now) } : s;
}

/** The next phase (after finishing or skipping this one), stopped and full. */
export function next(s: PomoState, c: PomoConfig): PomoState {
  if (s.phase === 'focus') {
    const rounds = s.rounds + 1;
    const phase: PomoPhase = rounds % Math.max(1, c.every) === 0 ? 'long' : 'short';
    return { phase, running: false, endsAt: 0, left: phaseMs(phase, c), rounds };
  }
  return { ...s, phase: 'focus', running: false, endsAt: 0, left: phaseMs('focus', c) };
}

/** If the running phase has run out, move on; says whether it just finished. */
export function settle(s: PomoState, c: PomoConfig, now: number): { state: PomoState; finished: PomoPhase | null } {
  if (s.running && now >= s.endsAt) return { state: next(s, c), finished: s.phase };
  return { state: s, finished: null };
}

export const clockText = (ms: number) => {
  const t = Math.ceil(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
