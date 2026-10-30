// Спряжение глаголов и прилагательных — генератор форм для упражнений.

export type WordClass =
  | 'v1' | 'v5u' | 'v5k' | 'v5k-s' | 'v5g' | 'v5s' | 'v5t' | 'v5n' | 'v5b' | 'v5m' | 'v5r' | 'v5r-i' | 'v5aru'
  | 'vk' | 'vs-i' | 'vs' | 'adj-i' | 'adj-ix' | 'adj-na';

export type Form =
  | 'dict' | 'masu' | 'masen' | 'mashita' | 'masendeshita' | 'mashou'
  | 'te' | 'ta' | 'nai' | 'nakatta' | 'potential' | 'passive' | 'causative'
  | 'volitional' | 'imperative' | 'ba' | 'tara' | 'tai' | 'teiru';

export const FORM_NAMES: Record<Form, string> = {
  dict: 'словарная форма',
  masu: 'вежливая форма (〜ます)',
  masen: 'вежливое отрицание (〜ません)',
  mashita: 'вежливое прошедшее (〜ました)',
  masendeshita: 'вежливое прошедшее отрицание (〜ませんでした)',
  mashou: 'предложение «давайте» (〜ましょう)',
  te: 'て-форма',
  ta: 'простое прошедшее (〜た)',
  nai: 'простое отрицание (〜ない)',
  nakatta: 'прошедшее отрицание (〜なかった)',
  potential: 'потенциальная форма («могу»)',
  passive: 'страдательный залог',
  causative: 'побудительный залог («заставить / позволить»)',
  volitional: 'волевая форма («давай…»)',
  imperative: 'повелительное наклонение',
  ba: 'условная форма (〜ば)',
  tara: 'условная форма (〜たら)',
  tai: 'желание (〜たい)',
  teiru: 'длительный вид (〜ている)',
};

// u-dan → [a, i, e, o, te, ta]
const GODAN: Record<string, [string, string, string, string, string, string]> = {
  う: ['わ', 'い', 'え', 'お', 'って', 'った'],
  く: ['か', 'き', 'け', 'こ', 'いて', 'いた'],
  ぐ: ['が', 'ぎ', 'げ', 'ご', 'いで', 'いだ'],
  す: ['さ', 'し', 'せ', 'そ', 'して', 'した'],
  つ: ['た', 'ち', 'て', 'と', 'って', 'った'],
  ぬ: ['な', 'に', 'ね', 'の', 'んで', 'んだ'],
  ぶ: ['ば', 'び', 'べ', 'ぼ', 'んで', 'んだ'],
  む: ['ま', 'み', 'め', 'も', 'んで', 'んだ'],
  る: ['ら', 'り', 'れ', 'ろ', 'って', 'った'],
};

export function wordClassFromPos(pos: string[]): WordClass | null {
  for (const p of pos) {
    if (p === 'v1' || p === 'v1-s') return 'v1';
    if (p.startsWith('v5') && p in { v5u: 1, 'v5k': 1, 'v5k-s': 1, v5g: 1, v5s: 1, v5t: 1, v5n: 1, v5b: 1, v5m: 1, v5r: 1, 'v5r-i': 1, v5aru: 1 })
      return p as WordClass;
    if (p === 'vk') return 'vk';
    if (p === 'vs-i' || p === 'vs-s') return 'vs-i';
    if (p === 'adj-i') return 'adj-i';
    if (p === 'adj-ix') return 'adj-ix';
    if (p === 'adj-na') return 'adj-na';
  }
  if (pos.includes('vs')) return 'vs';
  return null;
}

export function isVerbClass(c: WordClass | null): boolean {
  return !!c && (c.startsWith('v') || c === 'vk');
}

function masuStem(word: string, cls: WordClass): string | null {
  if (cls === 'v1') return word.slice(0, -1);
  if (cls === 'vk') return word.endsWith('来る') ? word.slice(0, -2) + '来' : word.slice(0, -2) + 'き';
  if (cls === 'vs-i') return word.slice(0, -2) + 'し';
  if (cls === 'vs') return word + 'し';
  if (cls === 'v5aru') return word.slice(0, -1) + 'い';
  if (cls.startsWith('v5')) {
    const row = GODAN[word.slice(-1)];
    return row ? word.slice(0, -1) + row[1] : null;
  }
  return null;
}

function verbForm(word: string, cls: WordClass, form: Form): string | null {
  const stem = masuStem(word, cls);
  if (stem === null) return null;
  const last = word.slice(-1);
  const base = word.slice(0, -1);
  const isKuru = cls === 'vk';
  const isSuru = cls === 'vs-i' || cls === 'vs';
  const suruBase = cls === 'vs' ? word : word.slice(0, -2);
  const kuruBase = word.endsWith('来る') ? word.slice(0, -2) : word.slice(0, -2);
  const kuruK = (kana: string) => (word.endsWith('来る') ? kuruBase + '来' : kuruBase + kana);

  switch (form) {
    case 'dict':
      return cls === 'vs' ? word + 'する' : word;
    case 'masu':
      return stem + 'ます';
    case 'masen':
      return stem + 'ません';
    case 'mashita':
      return stem + 'ました';
    case 'masendeshita':
      return stem + 'ませんでした';
    case 'mashou':
      return stem + 'ましょう';
    case 'tai':
      return stem + 'たい';
    case 'te':
    case 'ta':
    case 'tara':
    case 'teiru': {
      let te: string;
      if (cls === 'v1' || isKuru || isSuru) te = stem + 'て';
      else if ((word === '行く' || word === 'いく' || word.endsWith('行く')) && cls === 'v5k-s') te = base + 'って';
      else if (cls === 'v5aru') te = base + 'って';
      else te = base + GODAN[last][4];
      if (form === 'te') return te;
      if (form === 'teiru') return te + 'いる';
      const ta = te.slice(0, -1) + (te.endsWith('で') ? 'だ' : 'た');
      return form === 'ta' ? ta : ta + 'ら';
    }
    case 'nai':
    case 'nakatta': {
      let nai: string;
      if (cls === 'v1') nai = base + 'ない';
      else if (isKuru) nai = kuruK('こ') + 'ない';
      else if (isSuru) nai = suruBase + 'しない';
      else if (cls === 'v5r-i') nai = 'ない';
      else nai = base + GODAN[last][0] + 'ない';
      return form === 'nai' ? nai : nai.slice(0, -1) + 'かった';
    }
    case 'potential':
      if (cls === 'v1') return base + 'られる';
      if (isKuru) return kuruK('こ') + 'られる';
      if (isSuru) return suruBase + 'できる';
      return base + GODAN[last][2] + 'る';
    case 'passive':
      if (cls === 'v1') return base + 'られる';
      if (isKuru) return kuruK('こ') + 'られる';
      if (isSuru) return suruBase + 'される';
      return base + GODAN[last][0] + 'れる';
    case 'causative':
      if (cls === 'v1') return base + 'させる';
      if (isKuru) return kuruK('こ') + 'させる';
      if (isSuru) return suruBase + 'させる';
      return base + GODAN[last][0] + 'せる';
    case 'volitional':
      if (cls === 'v1') return base + 'よう';
      if (isKuru) return kuruK('こ') + 'よう';
      if (isSuru) return suruBase + 'しよう';
      return base + GODAN[last][3] + 'う';
    case 'imperative':
      if (cls === 'v1') return base + 'ろ';
      if (isKuru) return kuruK('こ') + 'い';
      if (isSuru) return suruBase + 'しろ';
      if (cls === 'v5aru') return base + 'い';
      return base + GODAN[last][2];
    case 'ba':
      if (cls === 'v1') return base + 'れば';
      if (isKuru) return kuruK('く') + 'れば';
      if (isSuru) return suruBase + 'すれば';
      return base + GODAN[last][2] + 'ば';
  }
}

function adjForm(word: string, cls: WordClass, form: Form): string | null {
  if (cls === 'adj-na') {
    const map: Partial<Record<Form, string>> = {
      dict: word + 'だ', masu: word + 'です', masen: word + 'ではありません', mashita: word + 'でした',
      masendeshita: word + 'ではありませんでした', te: word + 'で', ta: word + 'だった',
      nai: word + 'ではない', nakatta: word + 'ではなかった', ba: word + 'なら', tara: word + 'だったら',
    };
    return map[form] ?? null;
  }
  const stem = cls === 'adj-ix' ? word.slice(0, -2) + 'よ' : word.slice(0, -1);
  const map: Partial<Record<Form, string>> = {
    dict: word, masu: word + 'です', masen: stem + 'くないです', mashita: stem + 'かったです',
    masendeshita: stem + 'くなかったです', te: stem + 'くて', ta: stem + 'かった',
    nai: stem + 'くない', nakatta: stem + 'くなかった', ba: stem + 'ければ', tara: stem + 'かったら',
  };
  return map[form] ?? null;
}

/** Ставит слово в нужную форму. Возвращает null, если форма неприменима. */
export function conjugate(word: string, cls: WordClass, form: Form): string | null {
  if (cls === 'adj-i' || cls === 'adj-ix' || cls === 'adj-na') return adjForm(word, cls, form);
  return verbForm(word, cls, form);
}

export const VERB_FORMS: Form[] = [
  'masu', 'masen', 'mashita', 'masendeshita', 'mashou', 'te', 'ta', 'nai', 'nakatta', 'tai',
  'potential', 'passive', 'causative', 'volitional', 'imperative', 'ba', 'tara', 'teiru',
];
export const ADJ_FORMS: Form[] = ['masu', 'masen', 'mashita', 'masendeshita', 'te', 'ta', 'nai', 'nakatta', 'ba', 'tara'];

export const CLASS_NAMES: Record<WordClass, string> = {
  v1: 'глагол II спряжения (ichidan, 〜る)',
  v5u: 'глагол I спряжения на 〜う', v5k: 'глагол I спряжения на 〜く', 'v5k-s': 'глагол I спряжения 行く (исключение)',
  v5g: 'глагол I спряжения на 〜ぐ', v5s: 'глагол I спряжения на 〜す', v5t: 'глагол I спряжения на 〜つ',
  v5n: 'глагол I спряжения на 〜ぬ', v5b: 'глагол I спряжения на 〜ぶ', v5m: 'глагол I спряжения на 〜む',
  v5r: 'глагол I спряжения на 〜る', 'v5r-i': 'глагол ある (исключение)', v5aru: 'вежливый глагол на 〜る (ござる, なさる…)',
  vk: 'неправильный глагол 来る', 'vs-i': 'неправильный глагол する', vs: 'существительное + する',
  'adj-i': 'い-прилагательное', 'adj-ix': 'прилагательное いい/よい', 'adj-na': 'な-прилагательное',
};
