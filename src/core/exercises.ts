// Типы упражнений и генераторы заданий из материала урока.
import type { Skill, CardItem } from '../store/progress';
import { type Rng, shuffle, sample, pick } from './random';
import { kanaToRomaji, isKanaString } from './kana';
import { conjugate, wordClassFromPos, FORM_NAMES, type Form, isVerbClass } from './conjugate';

export interface LearnItem {
  kind: 'word' | 'kanji' | 'kana';
  id: string; // id карточки
  ja: string;
  reading: string;
  meaning: string; // главный перевод
  meanings: string[]; // все допустимые ответы
  accent?: string;
  pos?: string[];
  examples?: [string, string][];
  romaji?: string;
  details?: Record<string, unknown>;
}

export interface ContextLine {
  speaker: string;
  ja: string;
  ru?: string;
}

interface Base {
  skill: Skill;
  prompt: string;
  itemId?: string;
  explain?: string;
}

export type Exercise =
  | (Base & {
      type: 'choice';
      ja?: string; // японский текст вопроса
      reading?: string;
      audio?: string; // что озвучить
      hideText?: boolean; // аудирование: текст скрыт до ответа
      context?: ContextLine[];
      options: string[];
      optionsJa?: boolean;
      answer: number;
    })
  | (Base & {
      type: 'input';
      ja?: string;
      reading?: string;
      audio?: string;
      hideText?: boolean;
      lang: 'ja' | 'ru' | 'romaji';
      answers: string[];
      placeholder?: string;
    })
  | (Base & { type: 'build'; ja?: string; translation: string; tokens: string[]; answer: string[]; audio?: string })
  | (Base & { type: 'match'; pairs: [string, string][]; leftJa?: boolean })
  | (Base & { type: 'speak'; ja: string; reading: string; translation: string; accent?: string })
  | (Base & { type: 'draw'; char: string; meaning: string });

export function cardItemOf(it: LearnItem): CardItem {
  return { t: it.kind, f: it.ja, r: it.reading !== it.ja ? it.reading : undefined, b: it.meaning, a: it.accent };
}

function distractors<T>(pool: T[], exclude: (x: T) => boolean, n: number, rng: Rng): T[] {
  return sample(
    pool.filter((x) => !exclude(x)),
    n,
    rng,
  );
}

function choiceFrom(correct: string, wrong: string[], rng: Rng): { options: string[]; answer: number } {
  const uniq = [...new Set(wrong.filter((w) => w !== correct))].slice(0, 3);
  const options = shuffle([correct, ...uniq], rng);
  return { options, answer: options.indexOf(correct) };
}

const shortMeaning = (s: string) =>
  s
    .replace(/\([^)]*\)/g, '')
    .split(/[;]/)[0]
    .trim() || s;

// ───────────────────────── слова ─────────────────────────

export function vocabExercises(items: LearnItem[], pool: LearnItem[], rng: Rng): Exercise[] {
  const out: Exercise[] = [];
  const all = pool.length >= 8 ? pool : [...pool, ...items];
  for (const it of items) {
    const kinds = shuffle(['meaning', 'reverse', 'listen', 'reading', 'speak', 'cloze'] as const, rng).slice(0, 3);
    for (const kind of kinds) {
      if (kind === 'meaning') {
        const wrong = distractors(all, (x) => x.id === it.id || x.meaning === it.meaning, 3, rng).map((x) => shortMeaning(x.meaning));
        out.push({
          type: 'choice',
          skill: 'vocab',
          prompt: 'Что означает это слово?',
          ja: it.ja,
          reading: it.reading,
          audio: it.reading,
          ...choiceFrom(shortMeaning(it.meaning), wrong, rng),
          itemId: it.id,
        });
      } else if (kind === 'reverse') {
        const wrong = distractors(all, (x) => x.id === it.id || x.ja === it.ja, 3, rng).map((x) => x.ja);
        out.push({
          type: 'choice',
          skill: 'vocab',
          prompt: `Как по-японски «${shortMeaning(it.meaning)}»?`,
          optionsJa: true,
          ...choiceFrom(it.ja, wrong, rng),
          itemId: it.id,
        });
      } else if (kind === 'listen') {
        const wrong = distractors(all, (x) => x.id === it.id || x.reading === it.reading, 3, rng).map((x) => x.ja);
        out.push({
          type: 'choice',
          skill: 'listening',
          prompt: 'Послушайте и выберите услышанное слово',
          audio: it.reading,
          hideText: true,
          optionsJa: true,
          ...choiceFrom(it.ja, wrong, rng),
          itemId: it.id,
        });
      } else if (kind === 'reading' && it.ja !== it.reading) {
        out.push({
          type: 'input',
          skill: 'vocab',
          prompt: 'Напишите чтение слова каной (можно латиницей — она превратится в кану)',
          ja: it.ja,
          lang: 'ja',
          answers: [it.reading],
          placeholder: 'например: taberu → たべる',
          itemId: it.id,
        });
      } else if (kind === 'speak') {
        out.push({
          type: 'speak',
          skill: 'speaking',
          prompt: 'Произнесите слово вслух',
          ja: it.ja,
          reading: it.reading,
          translation: shortMeaning(it.meaning),
          accent: it.accent,
          itemId: it.id,
        });
      } else if (kind === 'cloze') {
        const ex = it.examples?.find(([jp]) => jp.includes(it.ja) && jp.length <= 40);
        if (ex) {
          const wrong = distractors(all, (x) => x.id === it.id || ex[0].includes(x.ja), 3, rng).map((x) => x.ja);
          out.push({
            type: 'choice',
            skill: 'reading',
            prompt: `Вставьте пропущенное слово. Перевод: «${ex[1]}»`,
            ja: ex[0].replace(it.ja, '＿＿'),
            audio: ex[0],
            optionsJa: true,
            ...choiceFrom(it.ja, wrong, rng),
            itemId: it.id,
          });
        } else {
          out.push({
            type: 'input',
            skill: 'vocab',
            prompt: `Переведите на русский: ${it.ja}`,
            ja: it.ja,
            reading: it.reading,
            lang: 'ru',
            answers: it.meanings,
            itemId: it.id,
          });
        }
      }
    }
  }
  if (items.length >= 4) {
    const batch = sample(items, Math.min(5, items.length), rng);
    out.push({
      type: 'match',
      skill: 'vocab',
      prompt: 'Соедините слова с переводом',
      pairs: batch.map((x) => [x.ja, shortMeaning(x.meaning)]),
      leftJa: true,
    });
  }
  // спряжение для глаголов и прилагательных
  for (const it of items) {
    const cls = wordClassFromPos(it.pos ?? []);
    if (!cls || cls === 'vs') continue;
    const forms: Form[] = isVerbClass(cls) ? ['masu', 'te', 'nai', 'ta'] : ['nai', 'ta', 'te'];
    const form = pick(forms, rng);
    const right = conjugate(it.ja, cls, form);
    if (!right) continue;
    const wrongForms = forms.filter((f) => f !== form).map((f) => conjugate(it.ja, cls, f)).filter((x): x is string => !!x);
    out.push({
      type: 'choice',
      skill: 'grammar',
      prompt: `Поставьте «${it.ja}» в форму: ${FORM_NAMES[form]}`,
      ja: it.ja,
      reading: it.reading,
      optionsJa: true,
      ...choiceFrom(right, wrongForms, rng),
      itemId: it.id,
    });
    break;
  }
  return interleave(out, rng);
}

/** Перемешивает задания так, чтобы одно и то же слово не шло подряд. */
function interleave(list: Exercise[], rng: Rng): Exercise[] {
  const shuffled = shuffle(list, rng);
  for (let i = 1; i < shuffled.length; i++) {
    if (shuffled[i].itemId && shuffled[i].itemId === shuffled[i - 1].itemId) {
      const j = shuffled.findIndex((e, k) => k > i && e.itemId !== shuffled[i].itemId);
      if (j > 0) [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }
  return shuffled;
}

// ───────────────────────── кана ─────────────────────────

export function kanaExercises(items: LearnItem[], pool: LearnItem[], rng: Rng): Exercise[] {
  const out: Exercise[] = [];
  const all = pool.length >= 6 ? pool : [...pool, ...items];
  for (const it of items) {
    const romaji = it.romaji ?? kanaToRomaji(it.ja);
    out.push({
      type: 'choice',
      skill: 'kana',
      prompt: 'Как читается этот символ?',
      ja: it.ja,
      audio: it.ja,
      ...choiceFrom(romaji, distractors(all, (x) => x.id === it.id, 3, rng).map((x) => x.romaji ?? kanaToRomaji(x.ja)), rng),
      itemId: it.id,
    });
    out.push({
      type: 'choice',
      skill: 'kana',
      prompt: `Найдите символ «${romaji}»`,
      optionsJa: true,
      ...choiceFrom(it.ja, distractors(all, (x) => x.id === it.id, 3, rng).map((x) => x.ja), rng),
      itemId: it.id,
    });
    out.push({
      type: 'choice',
      skill: 'listening',
      prompt: 'Какой символ прозвучал?',
      audio: it.ja,
      hideText: true,
      optionsJa: true,
      ...choiceFrom(it.ja, distractors(all, (x) => x.id === it.id, 3, rng).map((x) => x.ja), rng),
      itemId: it.id,
    });
    if (rng() < 0.6) out.push({ type: 'draw', skill: 'writing', prompt: `Напишите «${romaji}» по порядку черт`, char: it.ja, meaning: romaji, itemId: it.id });
    if (rng() < 0.5)
      out.push({ type: 'input', skill: 'kana', prompt: 'Напечатайте чтение латиницей', ja: it.ja, lang: 'romaji', answers: [romaji], itemId: it.id });
  }
  if (items.length >= 4) {
    out.push({
      type: 'match',
      skill: 'kana',
      prompt: 'Соедините символы с чтением',
      pairs: sample(items, Math.min(6, items.length), rng).map((x) => [x.ja, x.romaji ?? kanaToRomaji(x.ja)]),
      leftJa: true,
    });
  }
  return interleave(out, rng);
}

// ───────────────────────── кандзи ─────────────────────────

export function kanjiExercises(items: LearnItem[], pool: LearnItem[], rng: Rng): Exercise[] {
  const out: Exercise[] = [];
  const all = pool.length >= 8 ? pool : [...pool, ...items];
  for (const it of items) {
    out.push({
      type: 'choice',
      skill: 'kanji',
      prompt: 'Что означает этот иероглиф?',
      ja: it.ja,
      ...choiceFrom(shortMeaning(it.meaning), distractors(all, (x) => x.id === it.id, 3, rng).map((x) => shortMeaning(x.meaning)), rng),
      itemId: it.id,
    });
    const ex = (it.details?.examples as [string, string, string][] | undefined)?.find(([w]) => w.length <= 4);
    if (ex) {
      const [word, reading, gloss] = ex;
      const wrongReadings = all
        .flatMap((x) => (x.details?.examples as [string, string, string][] | undefined) ?? [])
        .filter(([w, r]) => r !== reading && w.length <= 4 && isKanaString(r))
        .map(([, r]) => r);
      out.push({
        type: 'choice',
        skill: 'kanji',
        prompt: `Как читается слово? (${shortMeaning(gloss)})`,
        ja: word,
        audio: reading,
        optionsJa: true,
        ...choiceFrom(reading, sample(wrongReadings, 3, rng), rng),
        itemId: it.id,
      });
      const lookalikes = (it.details?.similar as string[] | undefined) ?? [];
      const wrongKanji = [...lookalikes, ...distractors(all, (x) => x.id === it.id, 3, rng).map((x) => x.ja)].slice(0, 3);
      out.push({
        type: 'choice',
        skill: 'kanji',
        prompt: `Выберите правильный иероглиф: ${word.replace(it.ja, '□')} (${reading}) — «${shortMeaning(gloss)}»`,
        optionsJa: true,
        ...choiceFrom(it.ja, wrongKanji, rng),
        itemId: it.id,
      });
    }
    out.push({ type: 'draw', skill: 'writing', prompt: `Напишите иероглиф «${shortMeaning(it.meaning)}»`, char: it.ja, meaning: it.meaning, itemId: it.id });
  }
  if (items.length >= 4) {
    out.push({
      type: 'match',
      skill: 'kanji',
      prompt: 'Соедините иероглифы со значениями',
      pairs: sample(items, Math.min(5, items.length), rng).map((x) => [x.ja, shortMeaning(x.meaning)]),
      leftJa: true,
    });
  }
  return interleave(out, rng);
}

// ───────────────────────── предложения ─────────────────────────

/** Сборка предложения из частей. Токены разделены «|» или пробелами. */
export function buildExercise(tokenized: string, translation: string, rng: Rng, skill: Skill = 'grammar'): Exercise {
  const answer = tokenized.split(/[|\s]+/).filter(Boolean);
  return {
    type: 'build',
    skill,
    prompt: 'Соберите предложение',
    translation,
    tokens: shuffle(answer, rng),
    answer,
    audio: answer.join(''),
  };
}
