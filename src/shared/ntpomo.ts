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

// ---------------------------------------------------------------- focus history

/** One finished focus session: when it ended and how long it was. */
export interface FocusDone { end: number; min: number }
export interface FocusDay { date: Date; min: number; level: 0 | 1 | 2 | 3 | 4; today: boolean; future: boolean }

/** Add a finished session, once (several open tabs may each see it finish). */
export function logFocus(log: FocusDone[], end: number, min: number): FocusDone[] {
  if (log.some((d) => d.end === end)) return log;
  return [...log, { end, min }].slice(-500);
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** The last `weeks` weeks, Sunday to Saturday, ending with this week. */
export function focusGrid(log: FocusDone[], now: Date, weeks: number): { days: FocusDay[]; thisWeek: number; lastWeek: number } {
  const totals = new Map<string, number>();
  for (const d of log) {
    const k = dayKey(new Date(d.end));
    totals.set(k, (totals.get(k) ?? 0) + d.min);
  }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - (weeks - 1) * 7);
  const days: FocusDay[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const today = dayKey(date) === dayKey(now);
    days.push({ date, min: totals.get(dayKey(date)) ?? 0, level: 0, today, future: date > now && !today });
  }
  const max = Math.max(1, ...days.map((d) => d.min));
  for (const d of days) d.level = d.min ? (Math.max(1, Math.ceil((d.min / max) * 4)) as FocusDay['level']) : 0;
  const week = (w: number) => days.slice(days.length - 7 * (w + 1), days.length - 7 * w).reduce((n, d) => n + d.min, 0);
  return { days, thisWeek: week(0), lastWeek: week(1) };
}
