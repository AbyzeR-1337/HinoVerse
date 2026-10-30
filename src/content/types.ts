// Типы учебного контента. Японский текст может содержать фуригану в записи 漢字{かんじ}.

export type Block =
  | { t: 'p'; text: string }
  | { t: 'h'; text: string }
  | { t: 'ex'; ja: string; ru: string; note?: string }
  | { t: 'tip'; text: string }
  | { t: 'warn'; text: string }
  | { t: 'table'; head: string[]; rows: string[][]; ja?: boolean }
  | { t: 'list'; items: string[] }
  | { t: 'compare'; ru: string; ja: string; literal: string; note?: string }
  | { t: 'scheme'; parts: { text: string; role: string; kind?: 'topic' | 'subject' | 'object' | 'verb' | 'particle' | 'time' | 'place' | 'other' }[]; ru?: string }
  | { t: 'quiz'; q: string; options: string[]; answer: number; explain: string };

export interface Article {
  id: string;
  title: string;
  subtitle?: string;
  minutes: number;
  blocks: Block[];
}

export interface GrammarExample {
  ja: string; // с фуриганой
  ru: string;
  tokens?: string; // «わたし|は|がくせい|です» — для упражнения «собери предложение»
}

export interface GrammarQuestion {
  q: string; // японское предложение с пропуском ＿＿
  ru?: string;
  options: string[];
  answer: number;
  explain?: string;
}

export interface GrammarTopic {
  id: string;
  level: 5 | 4 | 3 | 2 | 1;
  title: string;
  pattern: string; // схема конструкции
  meaning: string; // кратко по-русски
  explanation: Block[];
  russian?: string; // сравнение с русским языком
  examples: GrammarExample[];
  mistakes?: string[];
  questions?: GrammarQuestion[];
}

export interface ThemeWord {
  w: string;
  r: string;
  ru: string;
}

export interface Theme {
  id: string;
  title: string;
  icon: string;
  level: 5 | 4 | 3 | 2 | 1;
  words: ThemeWord[];
}

export interface StorySentence {
  ja: string; // с фуриганой
  ru: string;
}

export interface Story {
  id: string;
  title: string;
  titleJa: string;
  level: 5 | 4 | 3 | 2 | 1;
  summary: string;
  sentences: StorySentence[];
  questions: { q: string; options: string[]; answer: number }[];
}

export interface DialogueOption {
  ja: string;
  ru: string;
  next: string | null; // id следующего узла (null — конец сцены)
  ok?: boolean; // уместный ли ответ (false — с объяснением)
  note?: string;
}

export interface DialogueNode {
  id: string;
  npc: string; // реплика персонажа (японский)
  npcRu: string;
  options: DialogueOption[];
}

export interface Scene {
  id: string;
  title: string;
  icon: string;
  level: 5 | 4 | 3 | 2 | 1;
  location: string; // id места в виртуальном городе
  persona: {
    nameJa: string;
    roleRu: string;
    setting: string;
    register: 'keigo' | 'teinei' | 'casual';
    goal: string;
  };
  phrases: { ja: string; ru: string }[]; // полезные фразы перед сценой
  nodes: DialogueNode[]; // первый узел — начало
}
