// Озвучка (синтез речи), распознавание речи и запись с микрофона.
// В браузере и PWA — Web Speech API и Web Audio; в приложении для Android/iOS (Capacitor)
// озвучка и распознавание идут через системные движки устройства.
import { Capacitor } from '@capacitor/core';

/** Запущено ли приложение как нативное (Capacitor). */
export const isNative = () => Capacitor.isNativePlatform();

export type VoiceProfile = 'female' | 'male' | 'child' | 'elder' | 'fast' | 'slow' | 'formal' | 'casual';

export const VOICE_PROFILES: { id: VoiceProfile; label: string; hint: string }[] = [
  { id: 'female', label: 'Женский голос', hint: 'обычный темп' },
  { id: 'male', label: 'Мужской голос', hint: 'обычный темп' },
  { id: 'child', label: 'Ребёнок', hint: 'высокий голос' },
  { id: 'elder', label: 'Пожилой человек', hint: 'низкий, медленный' },
  { id: 'fast', label: 'Быстрая речь', hint: 'как в жизни' },
  { id: 'slow', label: 'Медленная речь', hint: 'для разбора' },
  { id: 'formal', label: 'Официальная речь', hint: 'диктор, чётко' },
  { id: 'casual', label: 'Разговорная речь', hint: 'живо, чуть быстрее' },
];

const FEMALE_HINTS = ['kyoko', 'haruka', 'ayumi', 'nanami', 'sayaka', 'mizuki', 'female', '女性', 'o-ren', 'aoi', 'shiori', 'mayu'];
const MALE_HINTS = ['otoya', 'ichiro', 'keita', 'hattori', 'male', '男性', 'daichi', 'naoki'];

let voicesCache: SpeechSynthesisVoice[] = [];

function webTts(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function ttsSupported(): boolean {
  return isNative() || webTts();
}

export function japaneseVoices(): SpeechSynthesisVoice[] {
  if (!webTts()) return [];
  const all = window.speechSynthesis.getVoices();
  if (all.length) voicesCache = all.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('ja'));
  return voicesCache;
}

if (webTts()) {
  window.speechSynthesis.onvoiceschanged = () => japaneseVoices();
}

function pickVoice(profile: VoiceProfile, preferredName?: string): SpeechSynthesisVoice | undefined {
  const voices = japaneseVoices();
  if (preferredName) {
    const v = voices.find((x) => x.name === preferredName);
    if (v) return v;
  }
  const byHint = (hints: string[]) => voices.find((v) => hints.some((h) => v.name.toLowerCase().includes(h)));
  const female = byHint(FEMALE_HINTS);
  const male = byHint(MALE_HINTS);
  if (profile === 'male' || profile === 'elder') return male ?? voices[1] ?? voices[0];
  if (profile === 'female' || profile === 'child') return female ?? voices[0];
  return voices.find((v) => v.name.toLowerCase().includes('google')) ?? female ?? voices[0];
}

const PROFILE_PARAMS: Record<VoiceProfile, { rate: number; pitch: number }> = {
  female: { rate: 1, pitch: 1.05 },
  male: { rate: 0.98, pitch: 0.8 },
  child: { rate: 1.05, pitch: 1.6 },
  elder: { rate: 0.8, pitch: 0.7 },
  fast: { rate: 1.45, pitch: 1 },
  slow: { rate: 0.6, pitch: 1 },
  formal: { rate: 0.92, pitch: 0.95 },
  casual: { rate: 1.15, pitch: 1.1 },
};

export interface SpeakOptions {
  profile?: VoiceProfile;
  rate?: number; // множитель
  voiceName?: string;
  onEnd?: () => void;
  onBoundary?: (charIndex: number) => void;
  interrupt?: boolean;
}

/** Озвучивает японский текст. Возвращает промис, который завершается по окончании речи. */
export function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!ttsSupported() || !text.trim()) {
    opts.onEnd?.();
    return Promise.resolve();
  }
  if (isNative()) return speakNative(text, opts);
  const synth = window.speechSynthesis;
  if (opts.interrupt !== false) synth.cancel();
  const profile = opts.profile ?? 'female';
  const params = PROFILE_PARAMS[profile];
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  const voice = pickVoice(profile, opts.voiceName);
  if (voice) u.voice = voice;
  u.rate = Math.min(2, Math.max(0.3, params.rate * (opts.rate ?? 1)));
  u.pitch = params.pitch;
  return new Promise((resolve) => {
    u.onend = () => {
      opts.onEnd?.();
      resolve();
    };
    u.onerror = () => {
      opts.onEnd?.();
      resolve();
    };
    if (opts.onBoundary) u.onboundary = (e) => opts.onBoundary?.(e.charIndex);
    synth.speak(u);
  });
}

async function speakNative(text: string, opts: SpeakOptions): Promise<void> {
  const { TextToSpeech, QueueStrategy } = await import('@capacitor-community/text-to-speech');
  const params = PROFILE_PARAMS[opts.profile ?? 'female'];
  try {
    await TextToSpeech.speak({
      text,
      lang: 'ja-JP',
      rate: Math.min(2, Math.max(0.3, params.rate * (opts.rate ?? 1))),
      pitch: params.pitch,
      volume: 1,
      category: 'playback',
      queueStrategy: opts.interrupt === false ? QueueStrategy.Add : QueueStrategy.Flush,
    });
  } catch {
    /* нет японского голоса в системе — молча пропускаем */
  } finally {
    opts.onEnd?.();
  }
}

export function stopSpeaking() {
  if (isNative()) {
    void import('@capacitor-community/text-to-speech').then(({ TextToSpeech }) => TextToSpeech.stop()).catch(() => {});
    return;
  }
  if (webTts()) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return !isNative() && webTts() && window.speechSynthesis.speaking;
}

// ───────────────────────── распознавание речи ─────────────────────────

interface RecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string; confidence: number };
}
interface RecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResultLike };
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
}

function recognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function asrSupported(): boolean {
  return isNative() || recognitionCtor() !== null;
}

export interface RecognitionResult {
  transcript: string;
  alternatives: string[];
  confidence: number;
}

export interface RecognitionHandle {
  result: Promise<RecognitionResult>;
  stop: () => void;
  abort: () => void;
}

/** Слушает одну фразу на японском. onInterim получает промежуточный текст. */
export function listen(opts: { onInterim?: (t: string) => void; onSpeechStart?: () => void; lang?: string } = {}): RecognitionHandle {
  if (isNative()) return listenNative(opts);
  const Ctor = recognitionCtor();
  if (!Ctor) {
    return {
      result: Promise.reject(new Error('Распознавание речи не поддерживается этим браузером. Попробуйте Chrome, Edge или Safari.')),
      stop: () => {},
      abort: () => {},
    };
  }
  const rec = new Ctor();
  rec.lang = opts.lang ?? 'ja-JP';
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  let final: RecognitionResult | null = null;
  let interim = '';
  const result = new Promise<RecognitionResult>((resolve, reject) => {
    rec.onspeechstart = () => opts.onSpeechStart?.();
    rec.onresult = (e) => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const alts: string[] = [];
          for (let k = 0; k < res.length; k++) alts.push(res[k].transcript);
          final = { transcript: res[0].transcript, alternatives: alts, confidence: res[0].confidence || 0.5 };
        } else interim += res[0].transcript;
      }
      if (interim) opts.onInterim?.(interim);
    };
    rec.onerror = (e) => {
      const msg: Record<string, string> = {
        'not-allowed': 'Нет доступа к микрофону. Разрешите его в настройках браузера.',
        'no-speech': 'Речь не услышана. Попробуйте ещё раз.',
        network: 'Распознавание речи требует подключения к интернету в этом браузере.',
        'audio-capture': 'Микрофон не найден.',
        aborted: 'Остановлено.',
      };
      reject(new Error(msg[e.error] ?? `Ошибка распознавания: ${e.error}`));
    };
    rec.onend = () => {
      if (final) resolve(final);
      else if (interim) resolve({ transcript: interim, alternatives: [interim], confidence: 0.3 });
      else reject(new Error('Речь не услышана. Попробуйте ещё раз.'));
    };
  });
  rec.start();
  return { result, stop: () => rec.stop(), abort: () => rec.abort() };
}

/** Распознавание через системный движок Android/iOS (плагин Capacitor). Промежуточных результатов нет. */
function listenNative(opts: { onSpeechStart?: () => void; lang?: string }): RecognitionHandle {
  let stopFn = () => {};
  const result = (async (): Promise<RecognitionResult> => {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
    const { available } = await SpeechRecognition.available();
    if (!available) throw new Error('На устройстве нет службы распознавания речи (установите Google или включите голосовой ввод).');
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted') throw new Error('Нет доступа к микрофону. Разрешите его в настройках приложения.');
    stopFn = () => void SpeechRecognition.stop().catch(() => {});
    opts.onSpeechStart?.();
    let matches: string[] = [];
    try {
      const r = await SpeechRecognition.start({ language: opts.lang ?? 'ja-JP', maxResults: 5, partialResults: false, popup: false });
      matches = r.matches ?? [];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(/no match|no speech|timeout/i.test(msg) ? 'Речь не распознана. Попробуйте ещё раз.' : `Ошибка распознавания: ${msg}`);
    }
    if (!matches.length) throw new Error('Речь не услышана. Попробуйте ещё раз.');
    return { transcript: matches[0], alternatives: matches, confidence: 0.6 };
  })();
  return { result, stop: () => stopFn(), abort: () => stopFn() };
}

// ───────────────────────── запись с микрофона (для анализа тона) ─────────────────────────

export interface Recording {
  samples: Float32Array;
  sampleRate: number;
}

export interface RecorderHandle {
  stop: () => Promise<Recording>;
  level: () => number; // текущая громкость 0..1
}

export async function startRecording(maxSeconds = 6): Promise<RecorderHandle> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Запись звука не поддерживается на этом устройстве.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const chunks: Float32Array[] = [];
  const frame = new Float32Array(analyser.fftSize);
  let lastLevel = 0;
  let stopped = false;
  // ScriptProcessor устарел, но поддерживается всеми движками и не требует отдельного файла воркера.
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  proc.onaudioprocess = (e) => {
    if (stopped) return;
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  source.connect(proc);
  proc.connect(ctx.destination);

  let resolveStop: ((r: Recording) => void) | null = null;
  const finished = new Promise<Recording>((res) => (resolveStop = res));
  const finish = async () => {
    if (stopped) return finished;
    stopped = true;
    proc.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const samples = new Float32Array(total);
    let off = 0;
    for (const c of chunks) {
      samples.set(c, off);
      off += c.length;
    }
    const rate = ctx.sampleRate;
    await ctx.close().catch(() => {});
    resolveStop?.({ samples, sampleRate: rate });
    return finished;
  };
  const timer = setTimeout(() => void finish(), maxSeconds * 1000);
  return {
    stop: () => {
      clearTimeout(timer);
      return finish();
    },
    level: () => {
      if (stopped) return 0;
      analyser.getFloatTimeDomainData(frame);
      let s = 0;
      for (let i = 0; i < frame.length; i++) s += frame[i] * frame[i];
      lastLevel = Math.min(1, Math.sqrt(s / frame.length) * 6);
      return lastLevel;
    },
  };
}

/** Проигрывает записанный голос пользователя. */
export async function playRecording(rec: Recording): Promise<void> {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const buf = ctx.createBuffer(1, rec.samples.length, rec.sampleRate);
  buf.copyToChannel(new Float32Array(rec.samples), 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  await new Promise<void>((res) => {
    src.onended = () => res();
    src.start();
  });
  await ctx.close().catch(() => {});
}
