// Структура курса: ступени → главы → уроки. Строится из рукописного контента
// и открытых данных (слова и кандзи каждого уровня JLPT).
import type { DataManifest } from '../core/data';
import { INTRO } from './intro';
import { KANA_GROUPS } from './kana';
import { GRAMMAR_N5 } from './grammar/n5';
import { GRAMMAR_N4 } from './grammar/n4';
import { GRAMMAR_N3, GRAMMAR_N2, GRAMMAR_N1 } from './grammar/upper';
import { THEMES } from './themes';
import { STORIES } from './stories';
import { SCENES } from './scenes';
import type { GrammarTopic } from './types';

export type LessonKind = 'article' | 'kana' | 'vocab' | 'theme' | 'kanji' | 'grammar' | 'story' | 'scene' | 'exam';

export interface LessonRef {
  id: string;
  kind: LessonKind;
  title: string;
  subtitle?: string;
  ref: string;
  level: number; // 0 — старт и кана, 5..1 — уровни JLPT
  slice?: [number, number];
  minutes: number;
  chapterId: string;
}

export interface Chapter {
  id: string;
  title: string;
  lessons: LessonRef[];
}

export interface Stage {
  id: string;
  title: string;
  subtitle: string;
  level: number;
  chapters: Chapter[];
}

export const ALL_GRAMMAR: GrammarTopic[] = [...GRAMMAR_N5, ...GRAMMAR_N4, ...GRAMMAR_N3, ...GRAMMAR_N2, ...GRAMMAR_N1];
export const grammarById = (id: string) => ALL_GRAMMAR.find((g) => g.id === id);

export const VOCAB_PER_LESSON = 10;
export const KANJI_PER_LESSON = 6;

const LEVEL_INFO: Record<number, { title: string; subtitle: string }> = {
  5: { title: 'N5 · Основы', subtitle: 'Базовые фразы, 800 слов, 80 кандзи — вы понимаете простую речь' },
  4: { title: 'N4 · Повседневность', subtitle: 'Бытовые темы, связная речь, 300 кандзи' },
  3: { title: 'N3 · Средний уровень', subtitle: 'Живое общение, новости простым языком, 650 кандзи' },
  2: { title: 'N2 · Продвинутый', subtitle: 'Работа, газеты, сериалы, 1000 кандзи' },
  1: { title: 'N1 · Свободное владение', subtitle: 'Литература, деловой японский, нюансы, 2000 кандзи' },
};

function chunks(total: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < total; i += size) out.push([i, Math.min(total, i + size)]);
  return out;
}

export function buildCourse(manifest: DataManifest | null): Stage[] {
  const stages: Stage[] = [];

  // Ступень 0 — с полного нуля
  stages.push({
    id: 'start',
    title: 'Старт · С полного нуля',
    subtitle: 'Что такое японский язык и как его учить',
    level: 0,
    chapters: [
      {
        id: 'ch-intro',
        title: 'Введение в японский',
        lessons: INTRO.map((a) => ({ id: `a:${a.id}`, kind: 'article' as const, title: a.title, subtitle: a.subtitle, ref: a.id, level: 0, minutes: a.minutes, chapterId: 'ch-intro' })),
      },
    ],
  });

  // Кана
  const kanaChapters: Chapter[] = (['hiragana', 'katakana'] as const).map((script) => {
    const id = `ch-${script}`;
    const groups = KANA_GROUPS.filter((g) => g.script === script);
    const lessons: LessonRef[] = groups.map((g) => ({
      id: `kana:${g.id}`,
      kind: 'kana',
      title: g.title.replace(/^(Хирагана|Катакана): /, ''),
      subtitle: g.chars.slice(0, 8).join(' '),
      ref: g.id,
      level: 0,
      minutes: 8,
      chapterId: id,
    }));
    lessons.push({ id: `x:${id}`, kind: 'exam', title: script === 'hiragana' ? 'Экзамен: вся хирагана' : 'Экзамен: вся катакана', ref: id, level: 0, minutes: 10, chapterId: id });
    return { id, title: script === 'hiragana' ? 'Хирагана ひらがな' : 'Катакана カタカナ', lessons };
  });
  stages.push({ id: 'kana', title: 'Азбуки · Кана', subtitle: 'Хирагана и катакана: письмо, чтение, звуки', level: 0, chapters: kanaChapters });

  // Уровни JLPT
  const grammarByLevel: Record<number, GrammarTopic[]> = { 5: GRAMMAR_N5, 4: GRAMMAR_N4, 3: GRAMMAR_N3, 2: GRAMMAR_N2, 1: GRAMMAR_N1 };
  for (const level of [5, 4, 3, 2, 1]) {
    const vocabTotal = manifest?.vocab?.[`n${level}`] ?? 0;
    const kanjiTotal = manifest?.kanjiByLevel?.[`n${level}`] ?? 0;
    const vocabSlices = chunks(vocabTotal, VOCAB_PER_LESSON);
    const kanjiSlices = chunks(kanjiTotal, KANJI_PER_LESSON);
    const grammar = grammarByLevel[level];
    const themes = THEMES.filter((t) => t.level === level);
    const stories = STORIES.filter((s) => s.level === level);
    const scenes = SCENES.filter((s) => s.level === level);

    const nChapters = Math.max(grammar.length, Math.ceil(vocabSlices.length / 2), kanjiSlices.length, 1);
    const chapters: Chapter[] = [];
    let v = 0;
    let k = 0;
    for (let c = 0; c < nChapters; c++) {
      const chId = `ch-n${level}-${c + 1}`;
      const lessons: LessonRef[] = [];
      const gt = grammar[c];
      if (gt) lessons.push({ id: `g:${gt.id}`, kind: 'grammar', title: gt.title, subtitle: gt.pattern, ref: gt.id, level, minutes: 10, chapterId: chId });
      // слова: равномерно распределяем по главам
      const vTarget = Math.round(((c + 1) * vocabSlices.length) / nChapters);
      for (; v < vTarget; v++) {
        const [a, b] = vocabSlices[v];
        lessons.push({ id: `v:${level}:${v}`, kind: 'vocab', title: `Слова ${a + 1}–${b}`, subtitle: `N${level}, урок ${v + 1}`, ref: `n${level}`, level, slice: [a, b], minutes: 8, chapterId: chId });
      }
      const kTarget = Math.round(((c + 1) * kanjiSlices.length) / nChapters);
      for (; k < kTarget; k++) {
        const [a, b] = kanjiSlices[k];
        lessons.push({ id: `k:${level}:${k}`, kind: 'kanji', title: `Кандзи ${a + 1}–${b}`, subtitle: `N${level}`, ref: `n${level}`, level, slice: [a, b], minutes: 10, chapterId: chId });
      }
      // темы, истории и сцены — в начале уровня, через главу
      const extraIdx = Math.floor(c / 2);
      if (c % 2 === 0 && themes[extraIdx]) {
        const t = themes[extraIdx];
        lessons.push({ id: `t:${t.id}`, kind: 'theme', title: `${t.icon} Тема: ${t.title}`, ref: t.id, level, minutes: 10, chapterId: chId });
      }
      if (c % 2 === 1 && scenes[extraIdx]) {
        const s = scenes[extraIdx];
        lessons.push({ id: `sc:${s.id}`, kind: 'scene', title: `${s.icon} ${s.title}`, subtitle: 'разговорная сцена', ref: s.id, level, minutes: 6, chapterId: chId });
      }
      if (c % 3 === 2 && stories[Math.floor(c / 3)]) {
        const s = stories[Math.floor(c / 3)];
        lessons.push({ id: `s:${s.id}`, kind: 'story', title: `📖 ${s.title}`, subtitle: s.titleJa.replace(/\{[^}]*\}/g, ''), ref: s.id, level, minutes: 8, chapterId: chId });
      }
      lessons.push({ id: `x:${chId}`, kind: 'exam', title: 'Проверка главы', ref: chId, level, minutes: 6, chapterId: chId });
      const head = gt ? gt.title : lessons[0]?.title ?? '';
      chapters.push({ id: chId, title: `Глава ${c + 1}. ${head}`, lessons });
    }
    // оставшиеся темы/истории/сцены — в последнюю главу
    const last = chapters[chapters.length - 1];
    const used = new Set(chapters.flatMap((ch) => ch.lessons.map((l) => l.id)));
    for (const t of themes) if (!used.has(`t:${t.id}`)) last.lessons.splice(-1, 0, { id: `t:${t.id}`, kind: 'theme', title: `${t.icon} Тема: ${t.title}`, ref: t.id, level, minutes: 10, chapterId: last.id });
    for (const s of scenes) if (!used.has(`sc:${s.id}`)) last.lessons.splice(-1, 0, { id: `sc:${s.id}`, kind: 'scene', title: `${s.icon} ${s.title}`, subtitle: 'разговорная сцена', ref: s.id, level, minutes: 6, chapterId: last.id });
    for (const s of stories) if (!used.has(`s:${s.id}`)) last.lessons.splice(-1, 0, { id: `s:${s.id}`, kind: 'story', title: `📖 ${s.title}`, ref: s.id, level, minutes: 8, chapterId: last.id });

    stages.push({ id: `n${level}`, title: LEVEL_INFO[level].title, subtitle: LEVEL_INFO[level].subtitle, level, chapters });
  }
  return stages;
}

export function flattenLessons(stages: Stage[]): LessonRef[] {
  return stages.flatMap((s) => s.chapters.flatMap((c) => c.lessons));
}

export function courseStats(stages: Stage[]) {
  const lessons = flattenLessons(stages);
  return {
    stages: stages.length,
    chapters: stages.reduce((s, st) => s + st.chapters.length, 0),
    lessons: lessons.length,
  };
}
