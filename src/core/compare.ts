// Сравнение ответов пользователя с эталоном: допуски, выравнивание, поиск различий в звуках.
import { normalizeJa, splitMora, katakanaToHiragana, romajiToHiragana } from './kana';

export function levenshtein<T>(a: ArrayLike<T>, b: ArrayLike<T>): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function similarity(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  const max = Math.max(x.length, y.length);
  if (!max) return 1;
  return 1 - levenshtein(x, y) / max;
}

/** Проверка ответа на японском: принимает кану, кандзи, катакану и ромадзи. */
export function checkJapaneseAnswer(input: string, accepted: string[]): { correct: boolean; close: boolean; best: string; score: number } {
  const variants = new Set<string>();
  const raw = input.trim();
  variants.add(normalizeJa(raw));
  if (/^[a-z' -]+$/i.test(raw)) variants.add(normalizeJa(romajiToHiragana(raw.replace(/\s+/g, ''))));
  let best = accepted[0] ?? '';
  let score = 0;
  for (const acc of accepted) {
    const target = normalizeJa(acc);
    for (const v of variants) {
      const s = similarity(v, target);
      if (s > score) {
        score = s;
        best = acc;
      }
    }
  }
  return { correct: score >= 0.999, close: score >= 0.6, best, score };
}

/** Проверка ответа на русском: нестрогая, игнорирует регистр, знаки и «ё». */
export function checkRussianAnswer(input: string, accepted: string[]): { correct: boolean; close: boolean; score: number } {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/[^a-zа-я0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const u = norm(input);
  if (!u) return { correct: false, close: false, score: 0 };
  let score = 0;
  for (const a of accepted) {
    for (const piece of a.split(/[;,]/)) {
      const t = norm(piece);
      if (!t) continue;
      if (t === u) return { correct: true, close: true, score: 1 };
      score = Math.max(score, similarity(u, t));
      if (t.split(' ').includes(u) && u.length >= 3) score = Math.max(score, 0.9);
    }
  }
  return { correct: score >= 0.85, close: score >= 0.7, score };
}

export interface MoraDiff {
  expected: string | null;
  got: string | null;
  kind: 'same' | 'sub' | 'missing' | 'extra';
}

/** Выравнивает две строки каны по морам и показывает, какие звуки отличаются. */
export function diffMora(expected: string, got: string): MoraDiff[] {
  const a = splitMora(katakanaToHiragana(expected));
  const b = splitMora(katakanaToHiragana(got));
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const out: MoraDiff[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      out.push({ expected: a[i - 1], got: b[j - 1], kind: a[i - 1] === b[j - 1] ? 'same' : 'sub' });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      out.push({ expected: a[i - 1], got: null, kind: 'missing' });
      i--;
    } else {
      out.push({ expected: null, got: b[j - 1], kind: 'extra' });
      j--;
    }
  }
  return out.reverse();
}

const VOWEL_OF: Record<string, string> = {};
for (const [v, row] of Object.entries({
  あ: 'あかさたなはまやらわがざだばぱ', い: 'いきしちにひみりぎじぢびぴ', う: 'うくすつぬふむゆるぐずづぶぷ',
  え: 'えけせてねへめれげぜでべぺ', お: 'おこそとのほもよろをごぞどぼぽ',
})) {
  for (const ch of row) VOWEL_OF[ch] = v;
}

/** Объяснение типичной ошибки произношения для пары мор (на русском). */
export function explainMoraError(d: MoraDiff): string | null {
  if (d.kind === 'same') return null;
  const e = d.expected ?? '';
  const g = d.got ?? '';
  if (d.kind === 'missing') {
    if (e === 'っ') return 'Пропущена пауза っ (удвоение согласной): сделайте короткую остановку перед следующим звуком.';
    if (e === 'ん') return 'Пропущен слоговой ん — он длится целую мору.';
    if (e === 'う' || e === 'い' || e === 'ー') return `Долгий гласный произнесён коротко: тяните «${e}» на одну мору дольше.`;
    return `Пропущен звук «${e}».`;
  }
  if (d.kind === 'extra') {
    if (g === 'っ') return 'Лишняя пауза っ — здесь согласная не удваивается.';
    if (g === 'う' || g === 'い' || g === 'ー') return 'Лишняя долгота: гласный должен быть коротким.';
    return `Лишний звук «${g}».`;
  }
  if ((e === 'つ' && g === 'す') || (e === 'す' && g === 'つ')) return 'Различайте つ [цу] и す [су].';
  if ((e === 'し' && g === 'ひ') || (e === 'ひ' && g === 'し')) return 'Различайте し [си] и ひ [хи].';
  if ('らりるれろ'.includes(e) && !'らりるれろ'.includes(g)) return 'Японский «р» — один лёгкий удар языком по нёбу, между русскими «р» и «л».';
  if ('ざじずぜぞ'.includes(e) && 'さしすせそ'.includes(g)) return `Звонкость: «${e}» звонкий (дакутэн), вы произнесли глухой «${g}».`;
  if ('がぎぐげご'.includes(e) && 'かきくけこ'.includes(g)) return `Звонкость: «${e}» звонкий, у вас глухой «${g}».`;
  if (VOWEL_OF[e] && VOWEL_OF[g] && VOWEL_OF[e] !== VOWEL_OF[g]) return `Гласный: нужно «${VOWEL_OF[e]}», слышно «${VOWEL_OF[g]}» (${e} → ${g}).`;
  return `Звук «${e}» прозвучал как «${g}».`;
}
