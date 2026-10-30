// ИИ-преподаватель: анализ прогресса и индивидуальный план повторения.
// Локальный план строится всегда (работает офлайн); ИИ-разбор добавляется, если доступен Claude.
import type { ProgressData, Skill } from '../store/progress';
import { SKILL_NAMES, dueCards, accuracy } from '../store/progress';
import { mastery } from './srs';
import { pluralN } from './format';

export interface PlanStep {
  title: string;
  minutes: number;
  route: string;
  reason: string;
}

export interface LocalPlan {
  summary: string;
  steps: PlanStep[];
  weakSkills: { skill: Skill; acc: number; total: number }[];
  strongSkills: { skill: Skill; acc: number; total: number }[];
  focusItems: string[];
  due: number;
  leeches: string[];
}

const SKILL_ROUTE: Record<Skill, string> = {
  kana: '/kana',
  vocab: '/review',
  kanji: '/kanji',
  grammar: '/grammar',
  listening: '/talk',
  speaking: '/speak',
  reading: '/read',
  writing: '/write',
  pronunciation: '/speak',
};

export function buildLocalPlan(d: ProgressData, now = Date.now()): LocalPlan {
  const due = dueCards(d.cards, now);
  const skills = (Object.keys(SKILL_NAMES) as Skill[])
    .map((skill) => ({ skill, acc: accuracy(d.skills[skill]), total: d.skills[skill]?.total ?? 0 }))
    .filter((s) => s.total >= 5);
  const weakSkills = skills.filter((s) => s.acc < 0.75).sort((a, b) => a.acc - b.acc);
  const strongSkills = skills.filter((s) => s.acc >= 0.85).sort((a, b) => b.acc - a.acc);

  // «пиявки» — карточки, которые забываются снова и снова
  const leeches = Object.values(d.cards)
    .filter((c) => c.lapses >= 3)
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, 8)
    .map((c) => d.items[c.id]?.f ?? c.id);

  // самые частые недавние ошибки
  const counts = new Map<string, number>();
  for (const m of d.mistakes.slice(0, 120)) {
    const key = m.expected || m.item;
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const focusItems = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k]) => k);

  const steps: PlanStep[] = [];
  if (due.length) {
    steps.push({
      title: `Повторить ${pluralN(due.length, ['карточку', 'карточки', 'карточек'])}`,
      minutes: Math.min(25, Math.ceil(due.length * 0.35)),
      route: '/review',
      reason: 'Интервальное повторение — именно сейчас эти слова начинают забываться.',
    });
  }
  if (leeches.length) {
    steps.push({ title: `Разобрать трудные слова: ${leeches.slice(0, 4).join('、')}`, minutes: 5, route: '/review?mode=leeches', reason: 'Эти карточки забываются уже 3+ раза — нужна новая мнемоника или пример.' });
  }
  for (const w of weakSkills.slice(0, 2)) {
    steps.push({
      title: `Подтянуть навык «${SKILL_NAMES[w.skill]}»`,
      minutes: 8,
      route: SKILL_ROUTE[w.skill],
      reason: `Точность за последние ответы — ${Math.round(w.acc * 100)}%.`,
    });
  }
  const lastPron = d.pronunciation.slice(0, 10);
  if (lastPron.length >= 3) {
    const avg = lastPron.reduce((s, p) => s + p.score, 0) / lastPron.length;
    if (avg < 0.7) steps.push({ title: 'Тренировка произношения', minutes: 7, route: '/speak', reason: `Средняя оценка произношения ${Math.round(avg * 100)} — потренируйте долгие гласные и тон.` });
  }
  steps.push({ title: 'Новый урок курса', minutes: 10, route: '/course', reason: 'Новый материал небольшими порциями.' });
  if (!steps.some((s) => s.route === '/talk')) steps.push({ title: 'Живой разговор', minutes: 5, route: '/talk', reason: 'Перенести выученное в речь — главный шаг к «мышлению на японском».' });

  const totalAnswers = skills.reduce((s, x) => s + x.total, 0);
  const summary = !totalAnswers
    ? 'Пока мало данных. Пройдите пару уроков — и я составлю точный план.'
    : `Карточек к повторению: ${due.length}. ${weakSkills.length ? `Слабее всего: ${weakSkills.map((w) => SKILL_NAMES[w.skill].toLowerCase()).join(', ')}.` : 'Все навыки на хорошем уровне.'} ${strongSkills.length ? `Сильные стороны: ${strongSkills.slice(0, 2).map((s) => SKILL_NAMES[s.skill].toLowerCase()).join(', ')}.` : ''}`;

  return { summary, steps: steps.slice(0, 6), weakSkills, strongSkills, focusItems, due: due.length, leeches };
}

/** Текстовый отчёт о прогрессе для ИИ-преподавателя (без личных данных). */
export function statsReport(d: ProgressData, now = Date.now()): string {
  const cards = Object.values(d.cards);
  const byType: Record<string, number> = {};
  for (const c of cards) {
    const t = d.items[c.id]?.t ?? 'other';
    byType[t] = (byType[t] ?? 0) + 1;
  }
  const strong = cards.filter((c) => mastery(c, now) > 0.7).length;
  const lines = [
    'Learner progress report (Japanese course for Russian speakers):',
    `Total XP: ${d.xp}; streak: ${d.streak} days; lessons completed: ${Object.keys(d.lessons).length}.`,
    `SRS cards: ${cards.length} (${Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(', ')}); well-known: ${strong}; due now: ${dueCards(d.cards, now).length}.`,
    'Skill accuracy over last answers:',
    ...(Object.keys(SKILL_NAMES) as Skill[]).map((s) => `- ${s}: ${Math.round(accuracy(d.skills[s]) * 100)}% of last ${d.skills[s]?.recent.length ?? 0} (total answered ${d.skills[s]?.total ?? 0})`),
    'Frequently forgotten cards (lapses ≥ 2):',
    ...cards.filter((c) => c.lapses >= 2).slice(0, 15).map((c) => `- ${d.items[c.id]?.f ?? c.id} (${d.items[c.id]?.b ?? ''}), lapses ${c.lapses}`),
    'Recent mistakes (newest first):',
    ...d.mistakes.slice(0, 25).map((m) => `- [${m.skill}] ${m.item} → expected «${m.expected}»${m.note ? ` (${m.note})` : ''}`),
    'Recent pronunciation attempts:',
    ...d.pronunciation.slice(0, 10).map((p) => `- ${p.text}: score ${Math.round(p.score * 100)}; ${p.issues.join('; ')}`),
    `Completed lesson ids (latest): ${Object.entries(d.lessons).sort((a, b) => b[1].at - a[1].at).slice(0, 12).map(([id]) => id).join(', ')}`,
  ];
  return lines.join('\n');
}
