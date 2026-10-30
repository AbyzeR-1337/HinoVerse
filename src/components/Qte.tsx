// Quick Time Events: внезапные ситуации посреди урока. Отвечать нужно быстро — голосом или выбором.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { QTE_EVENTS, type QteEvent } from '../content/qte';
import { useProgress } from '../store/progress';
import { Furigana, readingOf } from './Furigana';
import { useSpeak } from './AudioButton';
import { asrSupported, listen, stopSpeaking } from '../core/speech';
import { normalizeJa } from '../core/kana';

interface QteApi {
  maybeTrigger: (probability: number) => Promise<void>;
  trigger: (ev?: QteEvent) => Promise<void>;
}

const Ctx = createContext<QteApi>({ maybeTrigger: async () => {}, trigger: async () => {} });
export const useQte = () => useContext(Ctx);

function QteModal({ ev, onClose }: { ev: QteEvent; onClose: (score: number) => void }) {
  const [left, setLeft] = useState(ev.seconds * 1000);
  const [result, setResult] = useState<{ ok: boolean; why?: string; score: number } | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const start = useRef(Date.now());
  const say = useSpeak();
  const recordQte = useProgress((s) => s.recordQte);
  const addXp = useProgress((s) => s.addXp);
  const recordAnswer = useProgress((s) => s.recordAnswer);

  useEffect(() => {
    void say(ev.line);
    start.current = Date.now();
    const t = setInterval(() => {
      const l = ev.seconds * 1000 - (Date.now() - start.current);
      setLeft(Math.max(0, l));
    }, 100);
    return () => {
      clearInterval(t);
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev]);

  const finish = useCallback(
    (ok: boolean, why?: string) => {
      if (result) return;
      const speed = Math.max(0, 1 - (Date.now() - start.current) / (ev.seconds * 1000));
      const score = ok ? Math.round(50 + 50 * speed) : 0;
      setResult({ ok, why, score });
      recordQte(ev.id, score);
      recordAnswer('listening', ok, ok ? undefined : { item: readingOf(ev.line), expected: ev.options.find((o) => o.ok)?.ja ?? '', got: '', note: 'Быстрое событие' });
      if (ok) addXp(10 + Math.round(15 * speed));
    },
    [result, ev, recordQte, addXp, recordAnswer],
  );

  useEffect(() => {
    if (left === 0 && !result) finish(false, 'Время вышло!');
  }, [left, result, finish]);

  const voice = async () => {
    setListening(true);
    try {
      const r = await listen().result;
      setHeard(r.transcript);
      const h = normalizeJa(r.transcript);
      const accepted = [...(ev.accept ?? []), ...ev.options.filter((o) => o.ok).map((o) => readingOf(o.ja))].map(normalizeJa);
      const ok = accepted.some((a) => a && (h.includes(a) || a.includes(h)));
      finish(ok, ok ? undefined : `Распознано: «${r.transcript}»`);
    } catch (e) {
      setHeard(e instanceof Error ? e.message : '');
    } finally {
      setListening(false);
    }
  };

  return (
    <div className="modal-back">
      <div className="modal qte">
        <div className="row between">
          <span className="chip red">⚡ Быстрое событие</span>
          <span className="small faint">{(left / 1000).toFixed(1)} с</span>
        </div>
        <div className="qte-timer" style={{ margin: '10px 0 14px' }}>
          <div style={{ width: `${(left / (ev.seconds * 1000)) * 100}%` }} />
        </div>
        <div className="muted">
          {ev.icon} {ev.situation}
        </div>
        <div className="bubble npc" style={{ margin: '12px 0', maxWidth: '100%' }}>
          <div className="small faint">{ev.speaker}</div>
          <div className="ja-line" style={{ fontSize: '1.3rem' }}>
            <Furigana text={ev.line} />
          </div>
          {result && <div className="ru-line">{ev.lineRu}</div>}
        </div>
        {!result ? (
          <>
            <div className="options">
              {ev.options.map((o, i) => (
                <button key={i} className="option ja-opt" onClick={() => finish(o.ok, o.why)}>
                  <span className="key">{i + 1}</span>
                  <Furigana text={o.ja} />
                </button>
              ))}
            </div>
            {asrSupported() && (
              <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
                <button className="btn" onClick={voice} disabled={listening}>
                  {listening ? '🎙 Слушаю…' : '🎙 Ответить голосом'}
                </button>
                {heard && <span className="small muted">{heard}</span>}
              </div>
            )}
          </>
        ) : (
          <div>
            <div className={`feedback ${result.ok ? 'good' : 'bad'}`}>
              <span>{result.ok ? '✓' : '✗'}</span>
              <div className="fb-body">
                <strong>{result.ok ? `Отлично! +${result.score} очков реакции` : 'Не получилось'}</strong>
                {result.why && <div className="small">{result.why}</div>}
                <div className="small">
                  Подходящий ответ: <span className="ja">{readingOf(ev.options.find((o) => o.ok)?.ja ?? '')}</span> — {ev.options.find((o) => o.ok)?.ru}
                </div>
              </div>
            </div>
            <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => onClose(result.score)} autoFocus>
              Вернуться к уроку
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function QteProvider({ children }: { children: ReactNode }) {
  const enabled = useProgress((s) => s.settings.qte);
  const [ev, setEv] = useState<QteEvent | null>(null);
  const resolver = useRef<(() => void) | null>(null);
  const lastAt = useRef(0);

  const trigger = useCallback((e?: QteEvent) => {
    const pick = e ?? QTE_EVENTS[Math.floor(Math.random() * QTE_EVENTS.length)];
    lastAt.current = Date.now();
    setEv(pick);
    return new Promise<void>((res) => (resolver.current = res));
  }, []);

  const maybeTrigger = useCallback(
    async (p: number) => {
      // не чаще раза в 3 минуты
      if (!enabled || Date.now() - lastAt.current < 180_000 || Math.random() > p) return;
      await trigger();
    },
    [enabled, trigger],
  );

  return (
    <Ctx.Provider value={{ maybeTrigger, trigger }}>
      {children}
      {ev && (
        <QteModal
          ev={ev}
          onClose={() => {
            setEv(null);
            resolver.current?.();
            resolver.current = null;
          }}
        />
      )}
    </Ctx.Provider>
  );
}
