// Тональное ударение (pitch accent) и анализ высоты голоса.
import { splitMora, katakanaToHiragana } from './kana';

export type Level = 'H' | 'L';

export interface AccentPattern {
  morae: string[];
  levels: Level[]; // по морам
  particle: Level; // тон следующей частицы (が, は…)
  accent: number;
  name: string;
  description: string;
}

/** Строит тональный рисунок по номеру ударения (система NHK/Daijirin). */
export function accentPattern(reading: string, accent: number): AccentPattern {
  const morae = splitMora(katakanaToHiragana(reading));
  const n = morae.length;
  const levels: Level[] = [];
  for (let i = 0; i < n; i++) {
    const pos = i + 1;
    if (accent === 0) levels.push(pos === 1 ? 'L' : 'H');
    else if (accent === 1) levels.push(pos === 1 ? 'H' : 'L');
    else levels.push(pos === 1 ? 'L' : pos <= accent ? 'H' : 'L');
  }
  if (n === 1 && accent === 0) levels[0] = 'L';
  const particle: Level = accent === 0 ? 'H' : 'L';
  let name: string;
  let description: string;
  if (accent === 0) {
    name = 'хэйбан (平板)';
    description = 'Ровный тон: первая мора низкая, дальше высоко и без падения — даже на частице.';
  } else if (accent === 1) {
    name = 'атамадака (頭高)';
    description = 'Высокая первая мора, затем падение тона.';
  } else if (accent === n) {
    name = 'одака (尾高)';
    description = `Подъём после первой моры, высоко до конца слова; падение происходит на частице.`;
  } else {
    name = 'накадака (中高)';
    description = `Подъём после первой моры, падение после ${accent}-й моры.`;
  }
  return { morae, levels, particle, accent, name, description };
}

export function parseAccent(a: string | undefined): number[] {
  if (!a) return [];
  return a
    .split(',')
    .map((x) => parseInt(x, 10))
    .filter((x) => !Number.isNaN(x));
}

// ───────────────────────── определение высоты тона (YIN) ─────────────────────────

/** Оценка основной частоты кадра алгоритмом YIN. Возвращает Гц или 0, если звук невокализован. */
export function yin(buf: Float32Array, sampleRate: number, threshold = 0.15, minHz = 70, maxHz = 500): number {
  const maxTau = Math.min(Math.floor(sampleRate / minHz), Math.floor(buf.length / 2));
  const minTau = Math.floor(sampleRate / maxHz);
  if (maxTau <= minTau + 2) return 0;
  // энергия кадра — отбрасываем тишину
  let energy = 0;
  for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
  if (Math.sqrt(energy / buf.length) < 0.01) return 0;

  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < maxTau; i++) {
      const diff = buf[i] - buf[i + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }
  // кумулятивная нормированная разность
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return 0;
  // параболическая интерполяция
  const x0 = tau > 1 ? cmnd[tau - 1] : cmnd[tau];
  const x2 = tau + 1 <= maxTau ? cmnd[tau + 1] : cmnd[tau];
  const denom = 2 * (2 * cmnd[tau] - x2 - x0);
  const better = denom !== 0 ? tau + (x2 - x0) / denom : tau;
  return sampleRate / better;
}

export interface PitchTrack {
  times: number[]; // секунды
  hz: number[]; // 0 — нет голоса
  rms: number[];
  duration: number;
}

export function trackPitch(samples: Float32Array, sampleRate: number, frameMs = 40, hopMs = 10): PitchTrack {
  const frame = Math.floor((sampleRate * frameMs) / 1000);
  const hop = Math.floor((sampleRate * hopMs) / 1000);
  const times: number[] = [];
  const hz: number[] = [];
  const rms: number[] = [];
  for (let start = 0; start + frame <= samples.length; start += hop) {
    const buf = samples.subarray(start, start + frame);
    let e = 0;
    for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
    rms.push(Math.sqrt(e / buf.length));
    hz.push(yin(buf, sampleRate));
    times.push(start / sampleRate);
  }
  // медианный фильтр от октавных скачков
  const smooth = hz.map((_, i) => {
    const win = hz.slice(Math.max(0, i - 2), i + 3).filter((v) => v > 0);
    if (!hz[i] || win.length < 2) return hz[i];
    win.sort((a, b) => a - b);
    return win[Math.floor(win.length / 2)];
  });
  return { times, hz: smooth, rms, duration: samples.length / sampleRate };
}

const toSemitones = (hz: number, ref: number) => 12 * Math.log2(hz / ref);

export interface PitchAnalysis {
  moraLevels: (Level | null)[];
  moraSemitones: (number | null)[];
  expected: Level[];
  matches: boolean[];
  accentScore: number; // 0..1
  speechStart: number;
  speechEnd: number;
  speechDuration: number;
  morasPerSecond: number;
  rhythmEvenness: number; // 0..1
  voicedRatio: number;
  feedback: string[];
}

/**
 * Делит фразу на равные по времени моры (приближение японского изохронного ритма),
 * находит относительную высоту каждой моры и сравнивает с ожидаемым рисунком.
 */
export function analyzePitch(track: PitchTrack, pattern: AccentPattern): PitchAnalysis {
  const n = pattern.morae.length;
  const peak = Math.max(...track.rms, 0.0001);
  const active = track.rms.map((r) => r > peak * 0.12);
  let first = active.indexOf(true);
  let last = active.lastIndexOf(true);
  if (first < 0) {
    first = 0;
    last = track.rms.length - 1;
  }
  const speechStart = track.times[first] ?? 0;
  const speechEnd = (track.times[last] ?? track.duration) + 0.04;
  const speechDuration = Math.max(0.05, speechEnd - speechStart);

  const voiced = track.hz.slice(first, last + 1).filter((v) => v > 0);
  const ref = voiced.length ? [...voiced].sort((a, b) => a - b)[Math.floor(voiced.length / 2)] : 150;
  const moraSemitones: (number | null)[] = [];
  const moraEnergy: number[] = [];
  for (let m = 0; m < n; m++) {
    const a = first + Math.floor(((last - first + 1) * m) / n);
    const b = first + Math.floor(((last - first + 1) * (m + 1)) / n);
    const seg = track.hz.slice(a, Math.max(a + 1, b)).filter((v) => v > 0);
    const segRms = track.rms.slice(a, Math.max(a + 1, b));
    moraEnergy.push(segRms.reduce((s, x) => s + x, 0) / Math.max(1, segRms.length));
    if (seg.length === 0) moraSemitones.push(null);
    else {
      // берём центральную часть моры — края искажены переходами
      const core = seg.slice(Math.floor(seg.length * 0.25), Math.ceil(seg.length * 0.75)) || seg;
      const avg = (core.length ? core : seg).reduce((s, x) => s + x, 0) / (core.length || seg.length);
      moraSemitones.push(toSemitones(avg, ref));
    }
  }
  const known = moraSemitones.filter((x): x is number => x !== null);
  const mid = known.length ? (Math.max(...known) + Math.min(...known)) / 2 : 0;
  const range = known.length ? Math.max(...known) - Math.min(...known) : 0;
  const moraLevels = moraSemitones.map((s) => (s === null ? null : range < 1.2 ? null : s >= mid ? 'H' : 'L'));

  const matches = pattern.levels.map((lv, i) => moraLevels[i] === lv);
  const scored = moraLevels.filter((x) => x !== null).length;
  let accentScore = scored ? matches.filter(Boolean).length / n : 0;
  if (range < 1.2 && known.length >= 2) accentScore = Math.min(accentScore, 0.3);

  const meanE = moraEnergy.reduce((s, x) => s + x, 0) / Math.max(1, n);
  const sd = Math.sqrt(moraEnergy.reduce((s, x) => s + (x - meanE) ** 2, 0) / Math.max(1, n));
  const rhythmEvenness = meanE > 0 ? Math.max(0, 1 - sd / meanE) : 0;
  const voicedRatio = track.hz.slice(first, last + 1).filter((v) => v > 0).length / Math.max(1, last - first + 1);
  const morasPerSecond = n / speechDuration;

  const feedback: string[] = [];
  if (!voiced.length) feedback.push('Голос не распознан. Говорите ближе к микрофону и громче.');
  else {
    if (range < 1.2) feedback.push('Тон почти не меняется. В японском слоги звучат выше или ниже — попробуйте «пропеть» рисунок.');
    const expDrop = pattern.levels.findIndex((lv, i) => i > 0 && lv === 'L' && pattern.levels[i - 1] === 'H');
    const userDrop = moraLevels.findIndex((lv, i) => i > 0 && lv === 'L' && moraLevels[i - 1] === 'H');
    if (pattern.accent === 0 && userDrop >= 0)
      feedback.push(`Слово ровное (хэйбан), а у вас тон падает после ${userDrop}-й моры. Держите тон высоким до конца.`);
    else if (pattern.accent > 0 && expDrop >= 0 && userDrop !== expDrop && range >= 1.2)
      feedback.push(
        userDrop < 0
          ? `Не слышно падения тона после ${expDrop}-й моры «${pattern.morae[expDrop - 1]}».`
          : `Падение тона должно быть после ${expDrop}-й моры «${pattern.morae[expDrop - 1]}», а у вас — после ${userDrop}-й.`,
      );
    if (pattern.levels[0] === 'L' && moraLevels[0] === 'H' && n > 1)
      feedback.push('Первая мора звучит слишком высоко: начните ниже и поднимитесь на второй море.');
    if (pattern.levels[0] === 'H' && moraLevels[0] === 'L')
      feedback.push('Первая мора должна быть самой высокой, затем тон опускается.');
    if (morasPerSecond > 9) feedback.push('Слишком быстро — моры «съедаются». Замедлитесь.');
    else if (morasPerSecond < 2.5 && n > 1) feedback.push('Слишком медленно: в обычной речи около 6–8 мор в секунду.');
    if (rhythmEvenness < 0.45 && n > 2) feedback.push('Ритм неровный: каждая мора (включая っ, ん и долгие гласные) звучит примерно одинаково долго.');
    if (!feedback.length) feedback.push('Тональный рисунок совпадает с образцом. Отлично!');
  }
  return {
    moraLevels,
    moraSemitones,
    expected: pattern.levels,
    matches,
    accentScore,
    speechStart,
    speechEnd,
    speechDuration,
    morasPerSecond,
    rhythmEvenness,
    voicedRatio,
    feedback,
  };
}
