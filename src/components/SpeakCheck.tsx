// Проверка произношения: распознавание речи + анализ тона голоса + разбор ошибок по морам.
import { useRef, useState } from 'react';
import { asrSupported, listen, startRecording, playRecording, type Recording, type RecorderHandle } from '../core/speech';
import { accentPattern, analyzePitch, parseAccent, trackPitch, type PitchAnalysis } from '../core/pitch';
import { diffMora, explainMoraError, similarity } from '../core/compare';
import { normalizeJa, isKanaString, katakanaToHiragana } from '../core/kana';
import { PitchCompare } from './PitchGraph';
import { AudioButton } from './AudioButton';
import { readingOf, stripFurigana } from './Furigana';

export interface SpeakResult {
  score: number; // 0..1 итоговая оценка
  recognized: string;
  textScore: number;
  pitch?: PitchAnalysis;
  issues: string[];
}

function bestRecognized(alts: string[], targets: string[]): { text: string; score: number } {
  let best = { text: alts[0] ?? '', score: 0 };
  for (const a of alts) {
    for (const t of targets) {
      const s = similarity(normalizeJa(a), normalizeJa(t));
      if (s > best.score) best = { text: a, score: s };
    }
  }
  return best;
}

export function SpeakCheck({ text, reading, accent, onResult, compact }: { text: string; reading?: string; accent?: string; onResult?: (r: SpeakResult) => void; compact?: boolean }) {
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const [interim, setInterim] = useState('');
  const [result, setResult] = useState<SpeakResult | null>(null);
  const [error, setError] = useState('');
  const recRef = useRef<RecorderHandle | null>(null);
  const audioRef = useRef<Recording | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const kana = katakanaToHiragana(reading ?? readingOf(text));
  const plain = stripFurigana(text);
  const accentNum = parseAccent(accent)[0];

  const start = async () => {
    setError('');
    setResult(null);
    setInterim('');
    try {
      // запись звука для анализа тона идёт параллельно с распознаванием
      recRef.current = await startRecording(6).catch(() => null);
      setState('rec');
      const handle = asrSupported() ? listen({ onInterim: setInterim }) : null;
      stopRef.current = () => handle?.stop();
      let recognized = '';
      let alts: string[] = [];
      if (handle) {
        try {
          const r = await handle.result;
          recognized = r.transcript;
          alts = r.alternatives;
        } catch (e) {
          if (!recRef.current) throw e;
        }
      } else {
        await new Promise((res) => setTimeout(res, 2500));
      }
      setState('busy');
      const audio = recRef.current ? await recRef.current.stop() : null;
      audioRef.current = audio;
      const best = alts.length ? bestRecognized(alts, [plain, kana]) : { text: recognized, score: 0 };
      const issues: string[] = [];
      let textScore = best.score;
      if (!handle) issues.push('Ваш браузер не распознаёт речь — оценивается только тон голоса.');
      else if (!recognized) issues.push('Речь не распознана.');
      else if (textScore < 0.999 && isKanaString(normalizeJa(best.text))) {
        for (const d of diffMora(kana, normalizeJa(best.text))) {
          const msg = explainMoraError(d);
          if (msg && !issues.includes(msg)) issues.push(msg);
        }
      } else if (textScore < 0.75) {
        issues.push(`Распознано: «${best.text}». Попробуйте произнести чётче.`);
      }
      let pitch: PitchAnalysis | undefined;
      if (audio && audio.samples.length > audio.sampleRate * 0.2 && accentNum !== undefined && kana) {
        pitch = analyzePitch(trackPitch(audio.samples, audio.sampleRate), accentPattern(kana, accentNum));
        issues.push(...pitch.feedback.filter((f) => !f.startsWith('Тональный рисунок совпадает')));
      }
      if (!handle) textScore = pitch ? pitch.accentScore : 0;
      const score = pitch ? textScore * 0.7 + pitch.accentScore * 0.3 : textScore;
      const res: SpeakResult = { score, recognized: best.text || recognized, textScore, pitch, issues };
      setResult(res);
      onResult?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await recRef.current?.stop().catch(() => null);
    } finally {
      setState('idle');
      recRef.current = null;
    }
  };

  const stop = () => {
    stopRef.current?.();
  };

  return (
    <div className="col" style={{ alignItems: 'center', gap: 12 }}>
      {!compact && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <AudioButton text={text} label="Образец" />
          <AudioButton text={text} profile="slow" label="Медленно" />
        </div>
      )}
      <button
        className={`mic ${state === 'rec' ? 'rec' : ''}`}
        onClick={state === 'rec' ? stop : start}
        disabled={state === 'busy'}
        aria-label={state === 'rec' ? 'Остановить' : 'Говорить'}
      >
        {state === 'rec' ? '■' : state === 'busy' ? '…' : '🎙'}
      </button>
      <div className="small muted" style={{ minHeight: 20 }}>
        {state === 'rec' ? interim || 'Говорите…' : state === 'busy' ? 'Анализ…' : 'Нажмите и произнесите'}
      </div>
      {error && <div className="feedback bad small">{error}</div>}
      {result && (
        <div className="card flat" style={{ width: '100%' }}>
          <div className="row between">
            <div>
              <div className="small faint">Распознано</div>
              <div className="ja" style={{ fontSize: '1.3rem' }}>
                {result.recognized || '—'}
              </div>
            </div>
            <div className="stat" style={{ textAlign: 'right' }}>
              <span className="v" style={{ color: result.score >= 0.8 ? 'var(--green)' : result.score >= 0.5 ? 'var(--amber)' : 'var(--accent)' }}>
                {Math.round(result.score * 100)}
              </span>
              <span className="l">баллов</span>
            </div>
          </div>
          {result.pitch && (
            <div style={{ marginTop: 10 }}>
              <div className="small faint">Тон: пунктир — образец, красная линия — ваш голос</div>
              <PitchCompare analysis={result.pitch} morae={accentPattern(kana, accentNum ?? 0).morae} />
              <div className="row tiny faint">
                <span>скорость: {result.pitch.morasPerSecond.toFixed(1)} мор/с</span>
                <span>ровность ритма: {Math.round(result.pitch.rhythmEvenness * 100)}%</span>
                <span>длительность: {result.pitch.speechDuration.toFixed(2)} с</span>
              </div>
            </div>
          )}
          {result.issues.length > 0 && (
            <ul className="small" style={{ margin: '10px 0 0', paddingLeft: '1.2em' }}>
              {result.issues.map((i, k) => (
                <li key={k}>{i}</li>
              ))}
            </ul>
          )}
          {audioRef.current && (
            <button className="btn small" style={{ marginTop: 10 }} onClick={() => audioRef.current && playRecording(audioRef.current)}>
              ▶ Мой голос
            </button>
          )}
        </div>
      )}
    </div>
  );
}
