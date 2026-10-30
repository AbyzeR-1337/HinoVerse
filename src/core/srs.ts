// Интервальные повторения по алгоритму FSRS-4.5 (Free Spaced Repetition Scheduler).
// Каждая карточка хранит стабильность памяти S (дни) и сложность D (1–10).

export type Grade = 1 | 2 | 3 | 4; // 1 — забыл, 2 — трудно, 3 — хорошо, 4 — легко
export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface Card {
  id: string;
  state: CardState;
  due: number; // мс
  s: number; // стабильность, дни
  d: number; // сложность 1..10
  reps: number;
  lapses: number;
  last: number; // мс последнего повторения
  step?: number; // шаг заучивания
}

const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793,
  0.3246, 1.587, 0.2272, 2.8755,
];
const SHORT_TERM = [0.5034, 0.6567];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const DAY = 86_400_000;
const MINUTE = 60_000;
export const DESIRED_RETENTION = 0.9;
const LEARNING_STEPS = [1 * MINUTE, 10 * MINUTE];
const RELEARNING_STEPS = [10 * MINUTE];
const MAX_INTERVAL_DAYS = 3650;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function newCard(id: string, now = Date.now()): Card {
  return { id, state: 'new', due: now, s: 0, d: 0, reps: 0, lapses: 0, last: 0 };
}

export function retrievability(elapsedDays: number, s: number): number {
  if (s <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / s, DECAY);
}

export function intervalDays(s: number, retention = DESIRED_RETENTION): number {
  const ivl = (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.round(ivl), 1, MAX_INTERVAL_DAYS);
}

const initStability = (g: Grade) => Math.max(W[g - 1], 0.1);
const initDifficulty = (g: Grade) => clamp(W[4] - (g - 3) * W[5], 1, 10);

function nextDifficulty(d: number, g: Grade): number {
  const nd = d - W[6] * (g - 3);
  return clamp(W[7] * initDifficulty(3) + (1 - W[7]) * nd, 1, 10);
}

function recallStability(d: number, s: number, r: number, g: Grade): number {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy);
}

function forgetStability(d: number, s: number, r: number): number {
  return Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
}

/** Возвращает новую карточку после ответа с оценкой g. Исходная не изменяется. */
export function review(card: Card, g: Grade, now = Date.now()): Card {
  const c: Card = { ...card, reps: card.reps + 1, last: now };
  const elapsed = card.last ? Math.max(0, (now - card.last) / DAY) : 0;

  if (card.state === 'new') {
    c.s = initStability(g);
    c.d = initDifficulty(g);
  } else {
    const r = retrievability(elapsed, card.s);
    c.d = nextDifficulty(card.d, g);
    if (card.state === 'review') {
      if (g === 1) {
        c.s = forgetStability(card.d, card.s, r);
        c.lapses = card.lapses + 1;
      } else {
        c.s = recallStability(card.d, card.s, r, g);
      }
    } else {
      // краткосрочное повторение внутри шага заучивания (формула FSRS-5)
      c.s = Math.max(0.1, card.s * Math.exp(SHORT_TERM[0] * (g - 3 + SHORT_TERM[1])));
    }
  }

  const inLearning = card.state === 'new' || card.state === 'learning';
  const inRelearning = card.state === 'relearning' || (card.state === 'review' && g === 1);

  if (g === 4) {
    c.state = 'review';
    c.step = undefined;
    c.due = now + intervalDays(c.s) * DAY;
    return c;
  }

  if (inLearning || inRelearning) {
    const steps = inLearning ? LEARNING_STEPS : RELEARNING_STEPS;
    let step = card.state === 'review' ? 0 : card.step ?? 0;
    if (g === 1) step = 0;
    else if (g === 3) step += 1;
    if (step >= steps.length) {
      c.state = 'review';
      c.step = undefined;
      c.due = now + intervalDays(c.s) * DAY;
    } else {
      c.state = inLearning ? 'learning' : 'relearning';
      c.step = step;
      const delay = g === 2 ? Math.round(steps[step] * 1.5) : steps[step];
      c.due = now + delay;
    }
    return c;
  }

  c.state = 'review';
  c.due = now + intervalDays(c.s) * DAY;
  return c;
}

/** Предварительный просмотр интервалов для кнопок «забыл / трудно / хорошо / легко». */
export function previewIntervals(card: Card, now = Date.now()): Record<Grade, number> {
  return {
    1: review(card, 1, now).due - now,
    2: review(card, 2, now).due - now,
    3: review(card, 3, now).due - now,
    4: review(card, 4, now).due - now,
  };
}

export function formatInterval(ms: number): string {
  const min = Math.round(ms / MINUTE);
  if (min < 60) return `${Math.max(1, min)} мин`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ч`;
  const d = Math.round(ms / DAY);
  if (d < 31) return `${d} дн`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} мес`;
  return `${(d / 365).toFixed(1)} г`;
}

export function isDue(card: Card, now = Date.now()): boolean {
  return card.state !== 'new' && card.due <= now;
}

/** Уверенность в знании 0..1 — для аналитики ИИ-преподавателя. */
export function mastery(card: Card | undefined, now = Date.now()): number {
  if (!card || card.state === 'new') return 0;
  const r = retrievability((now - card.last) / DAY, card.s);
  const stabilityFactor = clamp(Math.log10(1 + card.s) / 2, 0, 1);
  return clamp(r * 0.5 + stabilityFactor * 0.5, 0, 1);
}
