// Глобальное состояние: прогресс, интервальные карточки, статистика навыков и настройки.
// Хранится локально (localStorage) и синхронизируется между устройствами (см. core/sync.ts).
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { type Card, type Grade, newCard, review } from '../core/srs';
import type { VoiceProfile } from '../core/speech';
import type { Transcription } from '../core/kana';

export type Skill = 'kana' | 'vocab' | 'kanji' | 'grammar' | 'listening' | 'speaking' | 'reading' | 'writing' | 'pronunciation';

export const SKILL_NAMES: Record<Skill, string> = {
  kana: 'Кана',
  vocab: 'Словарный запас',
  kanji: 'Кандзи',
  grammar: 'Грамматика',
  listening: 'Аудирование',
  speaking: 'Разговор',
  reading: 'Чтение',
  writing: 'Письмо',
  pronunciation: 'Произношение',
};

export interface SkillStat {
  correct: number;
  total: number;
  recent: number[]; // последние 30 ответов: 1 — верно, 0 — ошибка
}

export interface Mistake {
  id: string;
  at: number;
  skill: Skill;
  item: string; // что спрашивали
  expected: string;
  got: string;
  note?: string;
  cardId?: string;
}

export interface CardItem {
  t: 'word' | 'kanji' | 'kana' | 'grammar' | 'sentence';
  f: string; // лицевая сторона (японский)
  r?: string; // чтение
  b: string; // перевод / значение
  a?: string; // ударение
}

export interface Settings {
  theme: 'auto' | 'light' | 'dark';
  transcription: Transcription;
  furigana: boolean;
  voice: VoiceProfile;
  voiceName: string;
  ttsRate: number;
  autoplay: boolean;
  aiMode: 'server' | 'direct' | 'off';
  serverUrl: string;
  apiKey: string;
  syncCode: string;
  autoSync: boolean;
  qte: boolean;
  dailyGoal: number;
  strokeLeniency: number;
  newPerDay: number;
}

export interface LessonResult {
  score: number;
  at: number;
  count: number;
}

export interface PronunciationRecord {
  at: number;
  text: string;
  score: number;
  accent: number;
  issues: string[];
}

export interface ProgressData {
  version: number;
  updatedAt: number;
  name: string;
  startedAt: number;
  xp: number;
  xpByDay: Record<string, number>;
  streak: number;
  lastDay: string;
  lessons: Record<string, LessonResult>;
  cards: Record<string, Card>;
  items: Record<string, CardItem>;
  skills: Record<Skill, SkillStat>;
  mistakes: Mistake[];
  pronunciation: PronunciationRecord[];
  quests: Record<string, number>;
  qteBest: Record<string, number>;
  achievements: string[];
  plan: { at: number; text: string } | null;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  transcription: 'polivanov',
  furigana: true,
  voice: 'female',
  voiceName: '',
  ttsRate: 1,
  autoplay: true,
  aiMode: 'server',
  serverUrl: '',
  apiKey: '',
  syncCode: '',
  autoSync: true,
  qte: true,
  dailyGoal: 50,
  strokeLeniency: 1,
  newPerDay: 15,
};

const emptySkills = (): Record<Skill, SkillStat> =>
  Object.fromEntries((Object.keys(SKILL_NAMES) as Skill[]).map((s) => [s, { correct: 0, total: 0, recent: [] as number[] }])) as unknown as Record<
    Skill,
    SkillStat
  >;

export function initialData(): ProgressData {
  return {
    version: 1,
    updatedAt: 0,
    name: '',
    startedAt: Date.now(),
    xp: 0,
    xpByDay: {},
    streak: 0,
    lastDay: '',
    lessons: {},
    cards: {},
    items: {},
    skills: emptySkills(),
    mistakes: [],
    pronunciation: [],
    quests: {},
    qteBest: {},
    achievements: [],
    plan: null,
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function dayKey(t = Date.now()): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prevDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1).getTime());
}

interface Actions {
  addXp: (n: number) => void;
  recordAnswer: (skill: Skill, correct: boolean, mistake?: Omit<Mistake, 'id' | 'at' | 'skill'>) => void;
  completeLesson: (id: string, score: number, xp: number) => void;
  addCards: (entries: { id: string; item: CardItem }[]) => void;
  gradeCard: (id: string, grade: Grade) => void;
  recordPronunciation: (r: Omit<PronunciationRecord, 'at'>) => void;
  completeQuest: (id: string, xp: number) => void;
  recordQte: (id: string, score: number) => void;
  setSettings: (s: Partial<Settings>) => void;
  setName: (name: string) => void;
  setPlan: (text: string) => void;
  replaceAll: (d: ProgressData) => void;
  resetAll: () => void;
}

export type Store = ProgressData & Actions;

const touch = () => ({ updatedAt: Date.now() });

export const useProgress = create<Store>()(
  persist(
    (set, get) => ({
      ...initialData(),

      addXp: (n) => {
        const today = dayKey();
        const s = get();
        let streak = s.streak;
        if (s.lastDay !== today) streak = s.lastDay === prevDayKey(today) ? streak + 1 : 1;
        set({
          xp: s.xp + n,
          xpByDay: { ...s.xpByDay, [today]: (s.xpByDay[today] ?? 0) + n },
          streak,
          lastDay: today,
          ...touch(),
        });
      },

      recordAnswer: (skill, correct, mistake) => {
        const s = get();
        const st = s.skills[skill] ?? { correct: 0, total: 0, recent: [] };
        const next: SkillStat = {
          correct: st.correct + (correct ? 1 : 0),
          total: st.total + 1,
          recent: [...st.recent, correct ? 1 : 0].slice(-30),
        };
        const mistakes = !correct && mistake
          ? [{ ...mistake, skill, at: Date.now(), id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }, ...s.mistakes].slice(0, 300)
          : s.mistakes;
        set({ skills: { ...s.skills, [skill]: next }, mistakes, ...touch() });
      },

      completeLesson: (id, score, xp) => {
        const s = get();
        const prev = s.lessons[id];
        set({
          lessons: {
            ...s.lessons,
            [id]: { score: Math.max(prev?.score ?? 0, score), at: Date.now(), count: (prev?.count ?? 0) + 1 },
          },
          ...touch(),
        });
        get().addXp(xp);
      },

      addCards: (entries) => {
        const s = get();
        const cards = { ...s.cards };
        const items = { ...s.items };
        let changed = false;
        for (const { id, item } of entries) {
          if (!cards[id]) {
            cards[id] = newCard(id);
            changed = true;
          }
          if (!items[id]) {
            items[id] = item;
            changed = true;
          }
        }
        if (changed) set({ cards, items, ...touch() });
      },

      gradeCard: (id, grade) => {
        const s = get();
        const card = s.cards[id] ?? newCard(id);
        set({ cards: { ...s.cards, [id]: review(card, grade) }, ...touch() });
      },

      recordPronunciation: (r) => {
        const s = get();
        set({ pronunciation: [{ ...r, at: Date.now() }, ...s.pronunciation].slice(0, 200), ...touch() });
      },

      completeQuest: (id, xp) => {
        const s = get();
        set({ quests: { ...s.quests, [id]: Date.now() }, ...touch() });
        get().addXp(xp);
      },

      recordQte: (id, score) => {
        const s = get();
        set({ qteBest: { ...s.qteBest, [id]: Math.max(s.qteBest[id] ?? 0, score) }, ...touch() });
      },

      setSettings: (patch) => set({ settings: { ...get().settings, ...patch }, ...touch() }),
      setName: (name) => set({ name, ...touch() }),
      setPlan: (text) => set({ plan: { at: Date.now(), text }, ...touch() }),
      replaceAll: (d) => set({ ...d }),
      resetAll: () => set({ ...initialData(), settings: get().settings, ...touch() }),
    }),
    {
      name: 'hinoverse-progress',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Чистые данные без функций — для синхронизации и экспорта. */
export function snapshot(): ProgressData {
  const s = useProgress.getState();
  const data = initialData();
  for (const k of Object.keys(data) as (keyof ProgressData)[]) {
    (data as unknown as Record<string, unknown>)[k] = s[k];
  }
  return data;
}

export function dueCards(cards: Record<string, Card>, now = Date.now()): Card[] {
  return Object.values(cards)
    .filter((c) => c.state !== 'new' && c.due <= now)
    .sort((a, b) => a.due - b.due);
}

export function newCards(cards: Record<string, Card>): Card[] {
  return Object.values(cards).filter((c) => c.state === 'new');
}

export function todayXp(xpByDay: Record<string, number>): number {
  return xpByDay[dayKey()] ?? 0;
}

export function accuracy(st: SkillStat | undefined): number {
  if (!st || !st.recent.length) return 0;
  return st.recent.reduce((s, x) => s + x, 0) / st.recent.length;
}
