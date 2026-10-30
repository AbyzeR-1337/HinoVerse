// Преобразование данных (слова, кандзи, кана) в учебные элементы для уроков и упражнений.
import type { LearnItem } from '../core/exercises';
import { getKanjiByLevel, getVocab, kanjiMeaning, type JlptLevel, type KanjiInfo, type VocabWord } from '../core/data';
import { KANA_INFO } from '../content/kana';
import { KANJI_NOTES } from '../content/kanjiNotes';
import { katakanaToHiragana, kanaToRomaji } from '../core/kana';
import type { ThemeWord } from '../content/types';

export function cleanMeaning(s: string): string {
  let t = s.replace(/^\((?:～|〜)[^)]*\)\s*/, '').replace(/^\[[^\]]*\]\s*/, '');
  t = t.split(';')[0].trim();
  if (t.length > 48) t = t.slice(0, 46).replace(/[ ,]+[^ ,]*$/, '') + '…';
  return t || s;
}

export function vocabItem(w: VocabWord): LearnItem {
  const usuallyKana = w.m?.includes('uk');
  const ja = usuallyKana ? w.r : w.w;
  const meanings = [...w.ru, w.en].filter(Boolean);
  return {
    kind: 'word',
    id: w.id ? `w:${w.id}` : `w:${w.w}|${w.r}`,
    ja,
    reading: w.r,
    meaning: cleanMeaning(w.ru[0] ?? w.en),
    meanings,
    accent: w.a || undefined,
    pos: w.pos,
    examples: w.ex,
    details: { written: w.w, en: w.en, ru: w.ru, usuallyKana },
  };
}

export function themeItem(t: ThemeWord): LearnItem {
  return { kind: 'word', id: `w:${t.w}|${t.r}`, ja: t.w, reading: t.r, meaning: t.ru, meanings: [t.ru], details: { ru: [t.ru] } };
}

export function kanjiItem(k: KanjiInfo): LearnItem {
  const note = KANJI_NOTES[k.c];
  const firstReading = (k.kun[0] ?? '').replace(/[.-]/g, '') || katakanaToHiragana(k.on[0] ?? '');
  return {
    kind: 'kanji',
    id: `k:${k.c}`,
    ja: k.c,
    reading: firstReading,
    meaning: note?.m ?? kanjiMeaning(k),
    meanings: [note?.m ?? '', ...(k.ru ?? []), ...(k.en ?? [])].filter(Boolean),
    details: { examples: k.ex ?? [], similar: note?.sim ?? [], info: k, note },
  };
}

export function kanaItem(ch: string): LearnItem {
  const info = KANA_INFO[ch];
  const romaji = info?.romaji ?? kanaToRomaji(ch);
  return { kind: 'kana', id: `kana:${ch}`, ja: ch, reading: katakanaToHiragana(ch), romaji, meaning: romaji, meanings: [romaji] };
}

export async function vocabSlice(level: JlptLevel, slice: [number, number]): Promise<{ items: LearnItem[]; pool: LearnItem[] }> {
  const list = await getVocab(level);
  const pool = list.map(vocabItem);
  return { items: pool.slice(slice[0], slice[1]), pool };
}

export async function kanjiSlice(level: JlptLevel, slice: [number, number]): Promise<{ items: LearnItem[]; pool: LearnItem[] }> {
  const list = await getKanjiByLevel(level);
  const pool = list.map(kanjiItem);
  return { items: pool.slice(slice[0], slice[1]), pool };
}
