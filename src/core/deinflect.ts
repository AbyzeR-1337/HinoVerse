// Обратное спряжение (деинфлексия): 食べなかった → 食べる («прошедшее отрицание»).
// Нужна, чтобы по нажатию на любое слово в тексте найти его в словаре.

export const T = {
  V1: 1,
  V5: 2,
  VK: 4,
  VS: 8,
  ADJ: 16,
  TE: 32,
  INIT: 64, // только исходная строка (без предыдущих преобразований)
} as const;
const ANY_IN = T.V1 | T.V5 | T.VK | T.VS | T.ADJ | T.TE | T.INIT;

interface Rule {
  from: string;
  to: string;
  tin: number;
  tout: number;
  reason: string;
}

const rules: Rule[] = [];
const r = (from: string, to: string, tin: number, tout: number, reason: string) =>
  rules.push({ from, to, tin, tout, reason });

// окончание u-ряда → [a, i, e, o, te, ta]
const GODAN: [string, string, string, string, string, string, string][] = [
  ['う', 'わ', 'い', 'え', 'お', 'って', 'った'],
  ['く', 'か', 'き', 'け', 'こ', 'いて', 'いた'],
  ['ぐ', 'が', 'ぎ', 'げ', 'ご', 'いで', 'いだ'],
  ['す', 'さ', 'し', 'せ', 'そ', 'して', 'した'],
  ['つ', 'た', 'ち', 'て', 'と', 'って', 'った'],
  ['ぬ', 'な', 'に', 'ね', 'の', 'んで', 'んだ'],
  ['ぶ', 'ば', 'び', 'べ', 'ぼ', 'んで', 'んだ'],
  ['む', 'ま', 'み', 'め', 'も', 'んで', 'んだ'],
  ['る', 'ら', 'り', 'れ', 'ろ', 'って', 'った'],
];

const MASU_SUFFIXES: [string, number, string][] = [
  ['ます', T.INIT, 'вежливая форма'],
  ['ました', T.INIT, 'вежливое прошедшее'],
  ['ません', T.INIT, 'вежливое отрицание'],
  ['ませんでした', T.INIT, 'вежливое прошедшее отрицание'],
  ['ましょう', T.INIT, '«давайте»'],
  ['たい', T.ADJ, 'желание (〜たい)'],
  ['ながら', T.INIT, 'одновременность (〜ながら)'],
  ['なさい', T.INIT, 'мягкий приказ (〜なさい)'],
  ['そう', T.INIT, '«похоже» (〜そう)'],
  ['すぎる', T.V1, 'чрезмерность (〜すぎる)'],
  ['やすい', T.ADJ, '«легко» (〜やすい)'],
  ['にくい', T.ADJ, '«трудно» (〜にくい)'],
  ['方', T.INIT, 'способ (〜方)'],
  ['かた', T.INIT, 'способ (〜かた)'],
];

for (const [u, a, i, e, o, te, ta] of GODAN) {
  for (const [suf, tin, reason] of MASU_SUFFIXES) r(i + suf, u, tin, T.V5, reason);
  r(a + 'ない', u, T.ADJ, T.V5, 'отрицание');
  r(a + 'ず', u, T.INIT, T.V5, 'отрицание (〜ず)');
  r(a + 'ずに', u, T.INIT, T.V5, '«не делая» (〜ずに)');
  r(a + 'なければ', u, T.INIT, T.V5, '«если не…» / «надо»');
  r(a + 'れる', u, T.V1, T.V5, 'страдательный залог');
  r(a + 'せる', u, T.V1, T.V5, 'побудительный залог');
  r(a + 'せられる', u, T.V1, T.V5, 'побудительно-страдательный залог');
  r(e + 'る', u, T.V1, T.V5, 'потенциальная форма');
  r(e + 'ば', u, T.INIT, T.V5, 'условная форма (〜ば)');
  r(e, u, T.INIT, T.V5, 'повелительное наклонение');
  r(o + 'う', u, T.INIT, T.V5, 'волевая форма');
  r(te, u, T.TE, T.V5, 'て-форма');
  r(ta, u, T.INIT, T.V5, 'прошедшее время');
  r(ta + 'ら', u, T.INIT, T.V5, 'условная форма (〜たら)');
  r(ta + 'り', u, T.INIT, T.V5, 'перечисление (〜たり)');
  const chau = te.endsWith('で') ? te.slice(0, -1) + 'じゃう' : te.slice(0, -1) + 'ちゃう';
  r(chau, u, T.V5, T.V5, '«нечаянно / до конца» (〜ちゃう)');
}
// 行く — исключение
for (const [form, reason, tin] of [
  ['って', 'て-форма', T.TE], ['った', 'прошедшее время', T.INIT], ['ったら', 'условная форма (〜たら)', T.INIT],
] as const) {
  r('行' + form, '行く', tin, T.V5, reason);
  r('い' + form, 'いく', tin, T.V5, reason);
}

// ichidan (II спряжение)
for (const [suf, tin, reason] of MASU_SUFFIXES) r(suf, 'る', tin, T.V1, reason);
r('ない', 'る', T.ADJ, T.V1, 'отрицание');
r('ず', 'る', T.INIT, T.V1, 'отрицание (〜ず)');
r('ずに', 'る', T.INIT, T.V1, '«не делая» (〜ずに)');
r('なければ', 'る', T.INIT, T.V1, '«если не…» / «надо»');
r('られる', 'る', T.V1, T.V1, 'потенциальная / страдательная форма');
r('れる', 'る', T.V1, T.V1, 'разговорная потенциальная форма (ら-抜き)');
r('させる', 'る', T.V1, T.V1, 'побудительный залог');
r('させられる', 'る', T.V1, T.V1, 'побудительно-страдательный залог');
r('よう', 'る', T.INIT, T.V1, 'волевая форма');
r('ろ', 'る', T.INIT, T.V1, 'повелительное наклонение');
r('れば', 'る', T.INIT, T.V1, 'условная форма (〜ば)');
r('て', 'る', T.TE, T.V1, 'て-форма');
r('た', 'る', T.INIT, T.V1, 'прошедшее время');
r('たら', 'る', T.INIT, T.V1, 'условная форма (〜たら)');
r('たり', 'る', T.INIT, T.V1, 'перечисление (〜たり)');
r('ちゃう', 'る', T.V5, T.V1, '«нечаянно / до конца» (〜ちゃう)');

// する
const SURU: [string, number, string][] = [
  ['します', T.INIT, 'вежливая форма'], ['しました', T.INIT, 'вежливое прошедшее'],
  ['しません', T.INIT, 'вежливое отрицание'], ['しませんでした', T.INIT, 'вежливое прошедшее отрицание'],
  ['しましょう', T.INIT, '«давайте»'], ['しない', T.ADJ, 'отрицание'], ['した', T.INIT, 'прошедшее время'],
  ['して', T.TE, 'て-форма'], ['しよう', T.INIT, 'волевая форма'], ['しろ', T.INIT, 'повелительное наклонение'],
  ['せよ', T.INIT, 'повелительное наклонение (книжн.)'], ['すれば', T.INIT, 'условная форма (〜ば)'],
  ['したら', T.INIT, 'условная форма (〜たら)'], ['される', T.V1, 'страдательный залог'],
  ['させる', T.V1, 'побудительный залог'], ['したい', T.ADJ, 'желание (〜たい)'], ['しちゃう', T.V5, '〜ちゃう'],
  ['しながら', T.INIT, 'одновременность'], ['しなさい', T.INIT, 'мягкий приказ'], ['せず', T.INIT, 'отрицание (〜ず)'],
];
for (const [from, tin, reason] of SURU) r(from, 'する', tin, T.VS, reason);

// 来る
const KURU: [string, string, number, string][] = [
  ['きます', 'ます', T.INIT, 'вежливая форма'], ['きました', 'ました', T.INIT, 'вежливое прошедшее'],
  ['きません', 'ません', T.INIT, 'вежливое отрицание'], ['きませんでした', 'ませんでした', T.INIT, 'вежливое прошедшее отрицание'],
  ['きましょう', 'ましょう', T.INIT, '«давайте»'], ['こない', 'ない', T.ADJ, 'отрицание'],
  ['きた', 'た', T.INIT, 'прошедшее время'], ['きて', 'て', T.TE, 'て-форма'], ['こよう', 'よう', T.INIT, 'волевая форма'],
  ['こい', 'い', T.INIT, 'повелительное наклонение'], ['くれば', 'れば', T.INIT, 'условная форма (〜ば)'],
  ['きたら', 'たら', T.INIT, 'условная форма (〜たら)'], ['こられる', 'られる', T.V1, 'потенциальная / страдательная форма'],
  ['こさせる', 'させる', T.V1, 'побудительный залог'], ['きたい', 'たい', T.ADJ, 'желание (〜たい)'],
];
for (const [kana, suf, tin, reason] of KURU) {
  r(kana, 'くる', tin, T.VK, reason);
  r('来' + suf, '来る', tin, T.VK, reason);
}

// い-прилагательные
r('くない', 'い', T.ADJ, T.ADJ, 'отрицание');
r('かった', 'い', T.INIT, T.ADJ, 'прошедшее время');
r('かったら', 'い', T.INIT, T.ADJ, 'условная форма (〜たら)');
r('くて', 'い', T.TE, T.ADJ, 'て-форма');
r('ければ', 'い', T.INIT, T.ADJ, 'условная форма (〜ば)');
r('く', 'い', T.INIT, T.ADJ, 'наречная форма');
r('さ', 'い', T.INIT, T.ADJ, 'существительное (〜さ)');
r('そう', 'い', T.INIT, T.ADJ, '«выглядит» (〜そう)');
r('すぎる', 'い', T.V1, T.ADJ, 'чрезмерность (〜すぎる)');
r('くなる', 'い', T.V5, T.ADJ, '«становиться» (〜くなる)');
r('かろう', 'い', T.INIT, T.ADJ, 'предположение (〜かろう)');
r('よくない', 'いい', T.ADJ, T.ADJ, 'отрицание');
r('よかった', 'いい', T.INIT, T.ADJ, 'прошедшее время');
r('よくて', 'いい', T.TE, T.ADJ, 'て-форма');
r('よければ', 'いい', T.INIT, T.ADJ, 'условная форма');

// вспомогательные конструкции после て-формы
const TE_AUX: [string, string, number, string][] = [
  ['いる', '', T.V1, 'длительный вид (〜ている)'], ['る', '', T.V1, 'длительный вид (〜てる, разг.)'],
  ['おく', '', T.V5, 'заранее (〜ておく)'], ['とく', '', T.V5, 'заранее (〜とく, разг.)'],
  ['しまう', '', T.V5, 'завершённость / сожаление (〜てしまう)'], ['ある', '', T.V5, 'результат (〜てある)'],
  ['いく', '', T.V5, 'движение от говорящего (〜ていく)'], ['くる', '', T.VK, 'движение к говорящему (〜てくる)'],
  ['ください', '', T.INIT, 'просьба (〜てください)'], ['くれる', '', T.V1, 'кто-то делает для меня (〜てくれる)'],
  ['もらう', '', T.V5, 'получить услугу (〜てもらう)'], ['あげる', '', T.V1, 'сделать для кого-то (〜てあげる)'],
  ['みる', '', T.V1, 'попробовать (〜てみる)'], ['も', '', T.INIT, 'уступка (〜ても)'], ['は', '', T.INIT, '〜ては'],
];
for (const [aux, , tin, reason] of TE_AUX) {
  r('て' + aux, 'て', tin, T.TE, reason);
  r('で' + aux, 'で', tin, T.TE, reason);
}

export interface Deinflection {
  word: string;
  type: number; // какие классы слов допустимы для найденной формы
  reasons: string[];
}

/** Все возможные словарные формы для строки (включая её саму). */
export function deinflect(source: string): Deinflection[] {
  const results: Deinflection[] = [{ word: source, type: ANY_IN, reasons: [] }];
  const seen = new Map<string, number>([[source, 0]]);
  for (let i = 0; i < results.length; i++) {
    const cur = results[i];
    if (cur.reasons.length > 5) continue;
    for (const rule of rules) {
      if (!(cur.type & rule.tin)) continue;
      if (!cur.word.endsWith(rule.from)) continue;
      const word = cur.word.slice(0, cur.word.length - rule.from.length) + rule.to;
      if (!word || word.length < 1) continue;
      const key = `${word}|${rule.tout}`;
      if (seen.has(key)) continue;
      seen.set(key, results.length);
      results.push({ word, type: rule.tout, reasons: [rule.reason, ...cur.reasons] });
    }
  }
  return results;
}

/** Подходит ли часть речи словарной статьи к результату деинфлексии. */
export function posMatches(type: number, pos: string[]): boolean {
  if (type === ANY_IN) return true;
  for (const p of pos) {
    if ((type & T.V1) && (p === 'v1' || p === 'v1-s')) return true;
    if ((type & T.V5) && p.startsWith('v5')) return true;
    if ((type & T.VK) && p === 'vk') return true;
    if ((type & T.VS) && (p === 'vs-i' || p === 'vs-s' || p === 'vs')) return true;
    if ((type & T.ADJ) && (p === 'adj-i' || p === 'adj-ix')) return true;
  }
  return false;
}
