// Работа с каной: ввод ромадзи → кана (как IME), кана → ромадзи (Хэпбёрн),
// кана → кириллица (система Поливанова), разбиение на моры.

const ROMAJI_TO_HIRA: Record<string, string> = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ',
  ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  la: 'ら', li: 'り', lu: 'る', le: 'れ', lo: 'ろ',
  wa: 'わ', wi: 'うぃ', we: 'うぇ', wo: 'を', nn: 'ん', "n'": 'ん', xn: 'ん',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  da: 'だ', di: 'ぢ', du: 'づ', dzu: 'づ', de: 'で', do: 'ど',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', fyu: 'ふゅ',
  kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ', kye: 'きぇ',
  sha: 'しゃ', shu: 'しゅ', sho: 'しょ', she: 'しぇ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
  cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', che: 'ちぇ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',
  cya: 'ちゃ', cyu: 'ちゅ', cyo: 'ちょ',
  nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ',
  mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  ja: 'じゃ', ju: 'じゅ', jo: 'じょ', je: 'じぇ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ',
  zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ',
  dya: 'ぢゃ', dyu: 'ぢゅ', dyo: 'ぢょ',
  bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  tsa: 'つぁ', tsi: 'つぃ', tse: 'つぇ', tso: 'つぉ',
  thi: 'てぃ', thu: 'てゅ', dhi: 'でぃ', dhu: 'でゅ', twu: 'とぅ', dwu: 'どぅ',
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
  xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtu: 'っ', xtsu: 'っ', xwa: 'ゎ', xka: 'ゕ', xke: 'ゖ',
  '-': 'ー', '.': '。', ',': '、', '?': '？', '!': '！', '~': '〜', '[': '「', ']': '」',
};

const MAX_KEY = Math.max(...Object.keys(ROMAJI_TO_HIRA).map((k) => k.length));
const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

/**
 * Преобразует ромадзи в хирагану так, как это делает японская раскладка.
 * Если `imeMode` включён, одиночная «n» в конце строки остаётся латиницей
 * (пользователь ещё может набрать «na», «ni» и т. п.).
 */
export function romajiToHiragana(input: string, imeMode = false): string {
  const src = input.toLowerCase();
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    // удвоенная согласная → маленькая っ
    if (next && c === next && !VOWELS.has(c) && c !== 'n' && /[a-z]/.test(c)) {
      out += 'っ';
      i += 1;
      continue;
    }
    if (c === 't' && next === 'c' && src[i + 2] === 'h') {
      out += 'っ';
      i += 1;
      continue;
    }
    if (c === 'n') {
      if (next === 'n') {
        // «konna» → こんな: вторая n начинает следующий слог; «honn» → ほん
        const after = src[i + 2];
        out += 'ん';
        i += after && (VOWELS.has(after) || after === 'y') ? 1 : 2;
        continue;
      }
      if (next === "'") {
        out += 'ん';
        i += 2;
        continue;
      }
      if (next === undefined) {
        out += imeMode ? 'n' : 'ん';
        i += 1;
        continue;
      }
      if (!VOWELS.has(next) && next !== 'y') {
        out += 'ん';
        i += 1;
        continue;
      }
    }
    let matched = false;
    for (let len = Math.min(MAX_KEY, src.length - i); len > 0; len--) {
      const chunk = src.slice(i, i + len);
      const kana = ROMAJI_TO_HIRA[chunk];
      if (kana) {
        out += kana;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += input[i];
      i += 1;
    }
  }
  return out;
}

export function hiraganaToKatakana(s: string): string {
  return s.replace(/[ぁ-ゖゝゞ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

export function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶヽヾ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function romajiToKatakana(input: string, imeMode = false): string {
  return hiraganaToKatakana(romajiToHiragana(input, imeMode));
}

export const isHiragana = (ch: string) => /^[ぁ-ゟ]$/.test(ch);
export const isKatakana = (ch: string) => /^[゠-ヿ]$/.test(ch);
export const isKana = (ch: string) => isHiragana(ch) || isKatakana(ch);
export const isKanji = (ch: string) => /^[㐀-䶿一-鿿豈-﫿々]$/.test(ch);
export const hasKanji = (s: string) => /[㐀-䶿一-鿿豈-﫿々]/.test(s);
export const isKanaString = (s: string) => /^[぀-ヿー]+$/.test(s);
export const hasJapanese = (s: string) => /[぀-ヿ㐀-鿿]/.test(s);

const SMALL = new Set(['ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゎ', 'ャ', 'ュ', 'ョ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ヮ']);

/** Делит кану на моры: きょう → [きょ, う], がっこう → [が, っ, こ, う]. */
export function splitMora(kana: string): string[] {
  const out: string[] = [];
  for (const ch of kana) {
    if (SMALL.has(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

// ─────────── кана → ромадзи (модифицированная система Хэпбёрна) ───────────

const HIRA_ROMAJI: Record<string, string> = {};
for (const [r, k] of Object.entries(ROMAJI_TO_HIRA)) {
  if (!/^[a-z]+$/.test(r) || r.startsWith('x') || r.startsWith('l')) continue;
  // предпочитаем Хэпбёрна: shi, chi, tsu, fu, ji
  const prefer = ['shi', 'chi', 'tsu', 'fu', 'ji', 'sha', 'shu', 'sho', 'cha', 'chu', 'cho', 'ja', 'ju', 'jo', 'zu', 'wo'];
  if (!HIRA_ROMAJI[k] || prefer.includes(r)) HIRA_ROMAJI[k] = r;
}
Object.assign(HIRA_ROMAJI, {
  ぢ: 'ji', づ: 'zu', ん: 'n', を: 'o', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa', ゔ: 'vu', ー: '-',
  '。': '.', '、': ',', '？': '?', '！': '!', '「': '"', '」': '"', '　': ' ',
});

export function kanaToRomaji(kana: string): string {
  const hira = katakanaToHiragana(kana);
  let out = '';
  const chars = [...hira];
  for (let i = 0; i < chars.length; i++) {
    const two = chars[i] + (chars[i + 1] ?? '');
    if (chars[i] === 'っ') {
      const nextRomaji = HIRA_ROMAJI[(chars[i + 1] ?? '') + (chars[i + 2] ?? '')] ?? HIRA_ROMAJI[chars[i + 1] ?? ''] ?? '';
      out += nextRomaji.startsWith('ch') ? 't' : (nextRomaji[0] ?? '');
      continue;
    }
    if (chars[i] === 'ー') {
      const m = out.match(/[aiueo]$/);
      out += m ? m[0] : '-';
      continue;
    }
    if (chars[i] === 'ん') {
      const nextR = HIRA_ROMAJI[chars[i + 1] ?? ''] ?? '';
      out += /^[aiueoy]/.test(nextR) ? "n'" : 'n';
      continue;
    }
    if (HIRA_ROMAJI[two] && chars[i + 1] && SMALL.has(chars[i + 1])) {
      out += HIRA_ROMAJI[two];
      i++;
      continue;
    }
    out += HIRA_ROMAJI[chars[i]] ?? chars[i];
  }
  return out;
}

// ─────────── кана → кириллица (система Поливанова) ───────────

const POLIVANOV: Record<string, string> = {
  あ: 'а', い: 'и', う: 'у', え: 'э', お: 'о',
  か: 'ка', き: 'ки', く: 'ку', け: 'кэ', こ: 'ко',
  さ: 'са', し: 'си', す: 'су', せ: 'сэ', そ: 'со',
  た: 'та', ち: 'ти', つ: 'цу', て: 'тэ', と: 'то',
  な: 'на', に: 'ни', ぬ: 'ну', ね: 'нэ', の: 'но',
  は: 'ха', ひ: 'хи', ふ: 'фу', へ: 'хэ', ほ: 'хо',
  ま: 'ма', み: 'ми', む: 'му', め: 'мэ', も: 'мо',
  や: 'я', ゆ: 'ю', よ: 'ё',
  ら: 'ра', り: 'ри', る: 'ру', れ: 'рэ', ろ: 'ро',
  わ: 'ва', を: 'о', ん: 'н',
  が: 'га', ぎ: 'ги', ぐ: 'гу', げ: 'гэ', ご: 'го',
  ざ: 'дза', じ: 'дзи', ず: 'дзу', ぜ: 'дзэ', ぞ: 'дзо',
  だ: 'да', ぢ: 'дзи', づ: 'дзу', で: 'дэ', ど: 'до',
  ば: 'ба', び: 'би', ぶ: 'бу', べ: 'бэ', ぼ: 'бо',
  ぱ: 'па', ぴ: 'пи', ぷ: 'пу', ぺ: 'пэ', ぽ: 'по',
  ゔ: 'ву', ぁ: 'а', ぃ: 'и', ぅ: 'у', ぇ: 'э', ぉ: 'о',
  きゃ: 'кя', きゅ: 'кю', きょ: 'кё', しゃ: 'ся', しゅ: 'сю', しょ: 'сё', しぇ: 'сэ',
  ちゃ: 'тя', ちゅ: 'тю', ちょ: 'тё', ちぇ: 'тэ', にゃ: 'ня', にゅ: 'ню', にょ: 'нё',
  ひゃ: 'хя', ひゅ: 'хю', ひょ: 'хё', みゃ: 'мя', みゅ: 'мю', みょ: 'мё',
  りゃ: 'ря', りゅ: 'рю', りょ: 'рё', ぎゃ: 'гя', ぎゅ: 'гю', ぎょ: 'гё',
  じゃ: 'дзя', じゅ: 'дзю', じょ: 'дзё', じぇ: 'дзэ', ぢゃ: 'дзя', ぢゅ: 'дзю', ぢょ: 'дзё',
  びゃ: 'бя', びゅ: 'бю', びょ: 'бё', ぴゃ: 'пя', ぴゅ: 'пю', ぴょ: 'пё',
  ふぁ: 'фа', ふぃ: 'фи', ふぇ: 'фэ', ふぉ: 'фо', てぃ: 'ти', でぃ: 'ди', とぅ: 'ту', どぅ: 'ду',
  うぃ: 'уи', うぇ: 'уэ', うぉ: 'уо', つぁ: 'ца', ゔぁ: 'ва', ゔぃ: 'ви', ゔぇ: 'вэ', ゔぉ: 'во',
  '。': '.', '、': ',', '？': '?', '！': '!', '「': '«', '」': '»', '　': ' ',
};

/** Кириллическая транскрипция по системе Поливанова: せんせい → сэнсэй. */
export function kanaToPolivanov(kana: string): string {
  const morae = splitMora(katakanaToHiragana(kana));
  let out = '';
  for (let i = 0; i < morae.length; i++) {
    const m = morae[i];
    if (m === 'っ') {
      const next = POLIVANOV[morae[i + 1] ?? ''] ?? '';
      out += next ? next[0] : '';
      continue;
    }
    if (m === 'ー') {
      const v = out.match(/[аиуэояюё]$/);
      out += v ? ':' : '';
      continue;
    }
    if (m === 'ん') {
      const next = POLIVANOV[morae[i + 1] ?? ''] ?? '';
      out += /^[бпм]/.test(next) ? 'м' : /^[аиуэояюё]/.test(next) ? 'нъ' : 'н';
      continue;
    }
    if (m === 'い' && i > 0 && /[аэоуяюё]$/.test(out)) {
      out += 'й';
      continue;
    }
    out += POLIVANOV[m] ?? m;
  }
  return out;
}

export type Transcription = 'romaji' | 'polivanov' | 'none';

export function transcribe(kana: string, mode: Transcription): string {
  if (mode === 'romaji') return kanaToRomaji(kana);
  if (mode === 'polivanov') return kanaToPolivanov(kana);
  return '';
}

/** Нормализация для сравнения ответов: катакана → хирагана, без пробелов и знаков. */
export function normalizeJa(s: string): string {
  return katakanaToHiragana(
    s
      .normalize('NFKC')
      .replace(/[\s。、，．,.!?！？「」『』（）()・~〜…:：;；"'`]/g, '')
      .toLowerCase(),
  );
}
