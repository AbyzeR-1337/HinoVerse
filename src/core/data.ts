// Загрузка открытых данных из public/data и поиск по ним.
import { deinflect, posMatches } from './deinflect';
import { katakanaToHiragana, romajiToHiragana, isKanaString, hasJapanese } from './kana';

export type JlptLevel = 5 | 4 | 3 | 2 | 1;

export interface VocabWord {
  w: string; // запись
  r: string; // чтение
  ru: string[];
  en: string;
  pos: string[];
  a: string; // ударение, напр. "0" или "1,0"
  ex: [string, string][];
  id?: number;
  m?: string[];
}

/** Строка словаря: [id, кандзи[], чтения[], переводы[], части речи[], частотность, ударение, JLPT, пометы[]] */
export type DictRow = [number, string[], string[], string[], string[], number, string, number, string[]];

export interface DictEntry {
  id: number;
  kanji: string[];
  readings: string[];
  glosses: string[];
  pos: string[];
  score: number;
  accent: string;
  jlpt: number;
  misc: string[];
}

export interface KanjiInfo {
  c: string;
  s: number; // черт
  g: number; // школьный класс (0 — нет)
  f: number; // частотность (0 — нет)
  j: number; // JLPT 5..1 (0 — нет)
  on: string[];
  kun: string[];
  rad: number;
  p: string[]; // составные части (KRADFILE)
  ru?: string[];
  en?: string[];
  ex?: [string, string, string][];
  nan?: string[];
}

export interface DataManifest {
  dictEntries: number;
  dictRussian?: number;
  dictShards: number;
  sentences: number;
  sentenceShards: number;
  vocab: Record<string, number>;
  kanjiCore: number;
  kanjiByLevel?: Record<string, number>;
  kanjiTotal: number;
  strokeChars: number;
  strokeShards: number;
}

const BASE = import.meta.env?.BASE_URL ?? '/';
const cache = new Map<string, Promise<unknown>>();

export function loadJSON<T>(path: string): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(`${BASE}data/${path}`).then((r) => {
      if (!r.ok) throw new Error(`Не удалось загрузить ${path}: ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p as Promise<T>;
}

export const getManifest = () => loadJSON<DataManifest>('manifest.json');
export const getVocab = (level: JlptLevel) => loadJSON<VocabWord[]>(`vocab/n${level}.json`);

export async function getAllVocab(): Promise<Map<JlptLevel, VocabWord[]>> {
  const levels: JlptLevel[] = [5, 4, 3, 2, 1];
  const lists = await Promise.all(levels.map(getVocab));
  return new Map(levels.map((l, i) => [l, lists[i]]));
}

// ───────────────────────── кандзи ─────────────────────────

let kanjiMap: Map<string, KanjiInfo> | null = null;
let kanjiRareLoaded = false;

export async function getKanjiCore(): Promise<KanjiInfo[]> {
  return loadJSON<KanjiInfo[]>('kanji/core.json');
}

export async function getKanji(ch: string): Promise<KanjiInfo | undefined> {
  if (!kanjiMap) {
    kanjiMap = new Map((await getKanjiCore()).map((k) => [k.c, k]));
  }
  if (!kanjiMap.has(ch) && !kanjiRareLoaded) {
    const rare = await loadJSON<KanjiInfo[]>('kanji/rare.json');
    for (const k of rare) kanjiMap.set(k.c, k);
    kanjiRareLoaded = true;
  }
  return kanjiMap.get(ch);
}

export async function getKanjiByLevel(level: JlptLevel): Promise<KanjiInfo[]> {
  return (await getKanjiCore()).filter((k) => k.j === level);
}

export function kanjiMeaning(k: KanjiInfo): string {
  return (k.ru?.length ? k.ru : k.en ?? []).slice(0, 3).join('; ');
}

// ───────────────────────── порядок черт ─────────────────────────

export async function getStrokes(ch: string): Promise<string[] | null> {
  const shard = ch.codePointAt(0)! % 64;
  const data = await loadJSON<Record<string, string[]>>(`strokes/${shard}.json`);
  return data[ch] ?? null;
}

// ───────────────────────── словарь ─────────────────────────

class Dictionary {
  entries: DictEntry[] = [];
  byForm = new Map<string, number[]>();
  byId = new Map<number, number>();
  loadedShards = 0;
  totalShards = 4;
  private loading: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  onProgress(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Загружает словарь по частям: самые частотные слова приходят первыми. */
  load(): Promise<void> {
    if (!this.loading) {
      this.loading = (async () => {
        const manifest = await getManifest().catch(() => null);
        this.totalShards = manifest?.dictShards ?? 4;
        for (let i = 0; i < this.totalShards; i++) {
          const rows = await loadJSON<DictRow[]>(`dict/d${i}.json`);
          this.add(rows);
          this.loadedShards = i + 1;
          this.listeners.forEach((fn) => fn());
        }
      })();
      this.loading.catch(() => (this.loading = null));
    }
    return this.loading;
  }

  /** Ждёт первую (самую частотную) часть словаря; остальные догружаются в фоне. */
  async ready(): Promise<void> {
    void this.load();
    if (this.loadedShards > 0) return;
    await new Promise<void>((res) => {
      const off = this.onProgress(() => {
        off();
        res();
      });
    });
  }

  private add(rows: DictRow[]) {
    for (const row of rows) {
      const idx = this.entries.length;
      const e: DictEntry = {
        id: row[0],
        kanji: row[1],
        readings: row[2],
        glosses: row[3],
        pos: row[4],
        score: row[5],
        accent: row[6],
        jlpt: row[7],
        misc: row[8] ?? [],
      };
      this.entries.push(e);
      this.byId.set(e.id, idx);
      for (const f of [...e.kanji, ...e.readings]) {
        const key = katakanaToHiragana(f);
        const list = this.byForm.get(key);
        if (list) list.push(idx);
        else this.byForm.set(key, [idx]);
      }
    }
  }

  get(id: number): DictEntry | undefined {
    const i = this.byId.get(id);
    return i === undefined ? undefined : this.entries[i];
  }

  exact(form: string): DictEntry[] {
    return (this.byForm.get(katakanaToHiragana(form)) ?? []).map((i) => this.entries[i]);
  }

  /** Поиск по японскому (кана/кандзи), ромадзи или русскому переводу. */
  search(query: string, limit = 50): DictEntry[] {
    const q = query.trim();
    if (!q) return [];
    const out: DictEntry[] = [];
    const seen = new Set<number>();
    const push = (e: DictEntry) => {
      if (!seen.has(e.id) && out.length < limit) {
        seen.add(e.id);
        out.push(e);
      }
    };
    const isLatin = /^[a-z' -]+$/i.test(q);
    const ja = isLatin ? romajiToHiragana(q.toLowerCase().replace(/\s+/g, '')) : q;
    if (hasJapanese(ja)) {
      const key = katakanaToHiragana(ja);
      // точное совпадение, затем словарная форма для спрягаемых слов, затем префикс
      for (const e of this.exact(key)) push(e);
      for (const d of deinflect(key)) {
        if (!d.reasons.length) continue;
        for (const e of this.exact(d.word)) if (posMatches(d.type, e.pos)) push(e);
      }
      if (out.length < limit) {
        for (const e of this.entries) {
          if (out.length >= limit) break;
          if ([...e.kanji, ...e.readings].some((f) => katakanaToHiragana(f).startsWith(key))) push(e);
        }
      }
      if (out.length < limit / 2) {
        for (const e of this.entries) {
          if (out.length >= limit) break;
          if (e.kanji.some((f) => f.includes(key))) push(e);
        }
      }
      return out;
    }
    // русский поиск: сначала слово целиком, затем вхождение
    const lower = q.toLowerCase();
    const wordRe = new RegExp(`(^|[^а-яё])${escapeRe(lower)}([^а-яё]|$)`, 'i');
    for (const e of this.entries) {
      if (out.length >= limit) break;
      if (e.glosses.some((g) => wordRe.test(g.toLowerCase()))) push(e);
    }
    if (out.length < limit) {
      for (const e of this.entries) {
        if (out.length >= limit) break;
        if (e.glosses.some((g) => g.toLowerCase().includes(lower))) push(e);
      }
    }
    return out;
  }

  /**
   * Поиск слова, которое начинается с позиции `start` в тексте (для «нажми на слово»).
   * Возвращает самое длинное совпадение с учётом спряжения.
   */
  lookupAt(text: string, start: number): { length: number; entries: DictEntry[]; reasons: string[] } | null {
    const max = Math.min(14, text.length - start);
    for (let len = max; len > 0; len--) {
      const s = text.slice(start, start + len);
      if (!hasJapanese(s[0])) return null;
      const found: DictEntry[] = [];
      let reasons: string[] = [];
      for (const d of deinflect(s)) {
        for (const e of this.exact(d.word)) {
          if (posMatches(d.type, e.pos) && !found.includes(e)) {
            found.push(e);
            if (!reasons.length) reasons = d.reasons;
          }
        }
        // 勉強します → 勉強する → 勉強 (существительное + する)
        if (d.word.endsWith('する') && d.word.length > 2 && d.reasons.length) {
          for (const e of this.exact(d.word.slice(0, -2))) {
            if (e.pos.includes('vs') && !found.includes(e)) {
              found.push(e);
              reasons = d.reasons;
            }
          }
        }
      }
      if (found.length) {
        found.sort((a, b) => b.score - a.score);
        return { length: len, entries: found.slice(0, 5), reasons };
      }
      // не дробим слово из одной каны на части, если это не частица
      if (len === 1 && isKanaString(s)) return null;
    }
    return null;
  }
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const dictionary = new Dictionary();

// ───────────────────────── предложения (Tatoeba) ─────────────────────────

let sentences: [string, string][] | null = null;
let sentencesLoading: Promise<[string, string][]> | null = null;

export function getSentences(): Promise<[string, string][]> {
  if (sentences) return Promise.resolve(sentences);
  if (!sentencesLoading) {
    sentencesLoading = (async () => {
      const m = await getManifest().catch(() => null);
      const n = m?.sentenceShards ?? 2;
      const parts = await Promise.all(Array.from({ length: n }, (_, i) => loadJSON<[string, string][]>(`sentences/s${i}.json`)));
      sentences = parts.flat();
      return sentences;
    })();
  }
  return sentencesLoading;
}

export async function findSentences(needles: string[], limit = 5): Promise<[string, string][]> {
  const all = await getSentences();
  const out: [string, string][] = [];
  for (const s of all) {
    if (needles.some((n) => n && s[0].includes(n))) {
      out.push(s);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export async function randomSentences(maxLen: number, count: number, seed = Date.now()): Promise<[string, string][]> {
  const all = await getSentences();
  const pool = all.filter((s) => s[0].length <= maxLen);
  const out: [string, string][] = [];
  let x = seed % 2147483647 || 1;
  for (let i = 0; i < count && pool.length; i++) {
    x = (x * 48271) % 2147483647;
    out.push(pool[x % pool.length]);
  }
  return out;
}

export function primaryForm(e: DictEntry): string {
  return e.misc.includes('uk') || !e.kanji.length ? e.readings[0] : e.kanji[0];
}
