import { describe, expect, it } from 'vitest';
import {
  romajiToHiragana,
  kanaToRomaji,
  kanaToPolivanov,
  splitMora,
  hiraganaToKatakana,
  katakanaToHiragana,
  normalizeJa,
} from '../src/core/kana';
import { newCard, review, intervalDays, retrievability } from '../src/core/srs';
import { conjugate } from '../src/core/conjugate';
import { deinflect, posMatches } from '../src/core/deinflect';
import { pathToPoints, checkStroke, resample } from '../src/core/strokes';
import { accentPattern, yin, trackPitch, analyzePitch } from '../src/core/pitch';
import { checkJapaneseAnswer, checkRussianAnswer, diffMora } from '../src/core/compare';
import { mergeProgress, isValidSyncCode } from '../src/core/sync';
import { initialData } from '../src/store/progress';

describe('кана', () => {
  it('ромадзи → хирагана', () => {
    expect(romajiToHiragana('konnichiha')).toBe('こんにちは');
    expect(romajiToHiragana('gakkou')).toBe('がっこう');
    expect(romajiToHiragana('kyou')).toBe('きょう');
    expect(romajiToHiragana("kon'ya")).toBe('こんや');
    expect(romajiToHiragana('shinbun')).toBe('しんぶん');
    expect(romajiToHiragana('matcha')).toBe('まっちゃ');
    expect(romajiToHiragana('tsukue')).toBe('つくえ');
    expect(romajiToHiragana('ka-do')).toBe('かーど');
    expect(romajiToHiragana('n', true)).toBe('n');
    expect(romajiToHiragana('hon')).toBe('ほん');
    expect(romajiToHiragana('minna')).toBe('みんな');
    expect(romajiToHiragana('honn')).toBe('ほん');
  });
  it('кана → ромадзи', () => {
    expect(kanaToRomaji('がっこう')).toBe('gakkou');
    expect(kanaToRomaji('しんぶん')).toBe('shinbun');
    expect(kanaToRomaji('きょう')).toBe('kyou');
    expect(kanaToRomaji('こんや')).toBe("kon'ya");
    expect(kanaToRomaji('コーヒー')).toBe('koohii');
    expect(kanaToRomaji('まっちゃ')).toBe('matcha');
  });
  it('система Поливанова', () => {
    expect(kanaToPolivanov('せんせい')).toBe('сэнсэй');
    expect(kanaToPolivanov('すし')).toBe('суси');
    expect(kanaToPolivanov('つなみ')).toBe('цунами');
    expect(kanaToPolivanov('しんぶん')).toBe('симбун');
    expect(kanaToPolivanov('きょうと')).toBe('кёуто');
    expect(kanaToPolivanov('がっこう')).toBe('гаккоу');
    expect(kanaToPolivanov('じゅうどう')).toBe('дзюудоу');
    expect(kanaToPolivanov('コーヒー')).toBe('ко:хи:');
  });
  it('моры и преобразования', () => {
    expect(splitMora('きょうと')).toEqual(['きょ', 'う', 'と']);
    expect(splitMora('がっこう')).toEqual(['が', 'っ', 'こ', 'う']);
    expect(hiraganaToKatakana('すし')).toBe('スシ');
    expect(katakanaToHiragana('テレビ')).toBe('てれび');
    expect(normalizeJa('テレビ。')).toBe('てれび');
  });
});

describe('интервальные повторения (FSRS)', () => {
  it('новая карточка проходит шаги заучивания', () => {
    const now = 1_000_000_000_000;
    let c = newCard('x', now);
    c = review(c, 3, now);
    expect(c.state).toBe('learning');
    expect(c.due - now).toBe(10 * 60_000);
    c = review(c, 3, c.due);
    expect(c.state).toBe('review');
    expect(c.due).toBeGreaterThan(now + 86_400_000 * 0.9);
  });
  it('«легко» сразу переводит в повторение, «забыл» — в переучивание', () => {
    const now = 1_000_000_000_000;
    let c = review(newCard('y', now), 4, now);
    expect(c.state).toBe('review');
    const later = c.due;
    c = review(c, 1, later);
    expect(c.state).toBe('relearning');
    expect(c.lapses).toBe(1);
  });
  it('интервал растёт при успешных ответах', () => {
    let now = 1_000_000_000_000;
    let c = review(newCard('z', now), 4, now);
    const intervals: number[] = [];
    for (let i = 0; i < 4; i++) {
      now = c.due;
      c = review(c, 3, now);
      intervals.push(c.due - now);
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });
  it('формулы FSRS', () => {
    expect(intervalDays(10)).toBe(10);
    expect(retrievability(0, 5)).toBeCloseTo(1);
    expect(retrievability(5, 5)).toBeCloseTo(0.9, 2);
  });
});

describe('спряжение', () => {
  it('глаголы', () => {
    expect(conjugate('食べる', 'v1', 'masu')).toBe('食べます');
    expect(conjugate('食べる', 'v1', 'te')).toBe('食べて');
    expect(conjugate('書く', 'v5k', 'te')).toBe('書いて');
    expect(conjugate('行く', 'v5k-s', 'ta')).toBe('行った');
    expect(conjugate('泳ぐ', 'v5g', 'te')).toBe('泳いで');
    expect(conjugate('読む', 'v5m', 'ta')).toBe('読んだ');
    expect(conjugate('話す', 'v5s', 'nai')).toBe('話さない');
    expect(conjugate('買う', 'v5u', 'nai')).toBe('買わない');
    expect(conjugate('待つ', 'v5t', 'potential')).toBe('待てる');
    expect(conjugate('する', 'vs-i', 'te')).toBe('して');
    expect(conjugate('勉強', 'vs', 'masu')).toBe('勉強します');
    expect(conjugate('来る', 'vk', 'nai')).toBe('来ない');
    expect(conjugate('くる', 'vk', 'nai')).toBe('こない');
    expect(conjugate('ある', 'v5r-i', 'nai')).toBe('ない');
    expect(conjugate('帰る', 'v5r', 'volitional')).toBe('帰ろう');
    expect(conjugate('いらっしゃる', 'v5aru', 'masu')).toBe('いらっしゃいます');
  });
  it('прилагательные', () => {
    expect(conjugate('高い', 'adj-i', 'nakatta')).toBe('高くなかった');
    expect(conjugate('いい', 'adj-ix', 'ta')).toBe('よかった');
    expect(conjugate('静か', 'adj-na', 'mashita')).toBe('静かでした');
  });
});

describe('деинфлексия', () => {
  const has = (word: string, target: string, pos: string[]) =>
    deinflect(word).some((d) => d.word === target && posMatches(d.type, pos));
  it('находит словарную форму', () => {
    expect(has('食べなかった', '食べる', ['v1'])).toBe(true);
    expect(has('食べています', '食べる', ['v1'])).toBe(true);
    expect(has('書いた', '書く', ['v5k'])).toBe(true);
    expect(has('行った', '行く', ['v5k-s'])).toBe(true);
    expect(has('読んでいる', '読む', ['v5m'])).toBe(true);
    expect(has('高くなかった', '高い', ['adj-i'])).toBe(true);
    expect(has('しました', 'する', ['vs-i'])).toBe(true);
    expect(has('来ない', '来る', ['vk'])).toBe(true);
    expect(has('話せる', '話す', ['v5s'])).toBe(true);
    expect(has('飲みたい', '飲む', ['v5m'])).toBe(true);
  });
  it('не принимает неподходящую часть речи', () => {
    expect(has('書いた', '書く', ['n'])).toBe(false);
  });
});

describe('черты', () => {
  const horizontal = 'M20,50 L90,50';
  const vertical = 'M54,10 L54,100';
  it('разбирает пути SVG', () => {
    const pts = pathToPoints('M10,10c10,0,20,0,30,0');
    expect(pts[0]).toEqual({ x: 10, y: 10 });
    expect(pts[pts.length - 1].x).toBeCloseTo(40);
    expect(resample(pts, 8)).toHaveLength(8);
  });
  it('принимает правильную черту и находит ошибки', () => {
    const strokes = [pathToPoints(horizontal), pathToPoints(vertical)];
    const good = checkStroke([{ x: 22, y: 52 }, { x: 55, y: 51 }, { x: 88, y: 49 }], strokes, 0);
    expect(good.ok).toBe(true);
    const reversed = checkStroke([{ x: 88, y: 50 }, { x: 20, y: 50 }], strokes, 0);
    expect(reversed.issue).toBe('direction');
    const wrongOrder = checkStroke([{ x: 54, y: 12 }, { x: 54, y: 98 }], strokes, 0);
    expect(wrongOrder.issue).toBe('order');
  });
});

describe('тональное ударение', () => {
  it('рисунки по номеру ударения', () => {
    expect(accentPattern('さくら', 0).levels).toEqual(['L', 'H', 'H']);
    expect(accentPattern('いのち', 1).levels).toEqual(['H', 'L', 'L']);
    expect(accentPattern('おかし', 2).levels).toEqual(['L', 'H', 'L']);
    expect(accentPattern('はし', 2).particle).toBe('L');
    expect(accentPattern('きょうと', 1).morae).toEqual(['きょ', 'う', 'と']);
  });
  it('YIN определяет частоту', () => {
    const sr = 16000;
    const buf = new Float32Array(1024);
    for (let i = 0; i < buf.length; i++) buf[i] = 0.5 * Math.sin((2 * Math.PI * 200 * i) / sr);
    expect(yin(buf, sr)).toBeGreaterThan(195);
    expect(yin(buf, sr)).toBeLessThan(205);
  });
  it('анализ находит падение тона', () => {
    const sr = 16000;
    const dur = 0.9;
    const samples = new Float32Array(Math.floor(sr * dur));
    let phase = 0;
    for (let i = 0; i < samples.length; i++) {
      const t = i / samples.length;
      const f = t < 1 / 3 ? 260 : 170; // высоко → низко (атамадака)
      phase += (2 * Math.PI * f) / sr;
      samples[i] = 0.4 * Math.sin(phase);
    }
    const res = analyzePitch(trackPitch(samples, sr), accentPattern('いのち', 1));
    expect(res.moraLevels).toEqual(['H', 'L', 'L']);
    expect(res.accentScore).toBe(1);
  });
});

describe('проверка ответов', () => {
  it('японский: кана, катакана, ромадзи', () => {
    expect(checkJapaneseAnswer('たべる', ['たべる']).correct).toBe(true);
    expect(checkJapaneseAnswer('taberu', ['たべる']).correct).toBe(true);
    expect(checkJapaneseAnswer('タベル', ['たべる']).correct).toBe(true);
    expect(checkJapaneseAnswer('たべろ', ['たべる']).close).toBe(true);
  });
  it('русский: допускает варианты', () => {
    expect(checkRussianAnswer('Школа', ['школа, училище; учебное заведение']).correct).toBe(true);
    expect(checkRussianAnswer('ёлка', ['елка']).correct).toBe(true);
    expect(checkRussianAnswer('кошка', ['собака']).correct).toBe(false);
  });
  it('выравнивание мор', () => {
    const d = diffMora('おばあさん', 'おばさん');
    expect(d.filter((x) => x.kind !== 'same')).toEqual([{ expected: 'あ', got: null, kind: 'missing' }]);
  });
});

describe('синхронизация', () => {
  it('сливает прогресс двух устройств', () => {
    const a = initialData();
    const b = initialData();
    a.cards.x = { id: 'x', state: 'review', due: 5, s: 1, d: 5, reps: 2, lapses: 0, last: 100 };
    b.cards.x = { id: 'x', state: 'review', due: 9, s: 3, d: 5, reps: 3, lapses: 0, last: 200 };
    b.cards.y = { id: 'y', state: 'new', due: 0, s: 0, d: 0, reps: 0, lapses: 0, last: 0 };
    a.lessons.l1 = { score: 0.5, at: 1, count: 1 };
    b.lessons.l1 = { score: 0.9, at: 2, count: 1 };
    a.xpByDay = { '2026-01-01': 10 };
    b.xpByDay = { '2026-01-01': 5, '2026-01-02': 7 };
    a.settings.apiKey = 'secret';
    const m = mergeProgress(a, b);
    expect(m.cards.x.last).toBe(200);
    expect(m.cards.y).toBeDefined();
    expect(m.lessons.l1.score).toBe(0.9);
    expect(m.xp).toBe(17);
    expect(m.settings.apiKey).toBe('secret');
  });
  it('проверяет формат кода', () => {
    expect(isValidSyncCode('HV-ABCDE-23456')).toBe(true);
    expect(isValidSyncCode('hv-1')).toBe(false);
  });
});
