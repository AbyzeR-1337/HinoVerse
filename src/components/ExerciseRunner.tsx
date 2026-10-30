// Проигрыватель упражнений всех типов: выбор, ввод, сборка фразы, пары, речь, письмо.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Exercise } from '../core/exercises';
import { checkJapaneseAnswer, checkRussianAnswer } from '../core/compare';
import { transcribe } from '../core/kana';
import { useProgress } from '../store/progress';
import { AudioButton, useSpeak } from './AudioButton';
import { Furigana, stripFurigana } from './Furigana';
import { KanaInput } from './KanaInput';
import { SpeakCheck } from './SpeakCheck';
import { DrawPad } from './Strokes';
import { asrSupported } from '../core/speech';
import { useQte } from './Qte';

export interface RunResult {
  correct: number;
  total: number;
  perItem: Record<string, boolean>; // itemId → все ли ответы верны
  xp: number;
}

type Verdict = { ok: boolean; skipped?: boolean; answer?: string; note?: string };

function Feedback({ v, explain, onNext }: { v: Verdict; explain?: string; onNext: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onNext();
      }
    };
    const t = setTimeout(() => window.addEventListener('keydown', onKey), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [onNext]);
  return (
    <div>
      <div className={`feedback ${v.ok ? 'good' : 'bad'}`}>
        <span style={{ fontSize: '1.3rem' }}>{v.skipped ? '⏭' : v.ok ? '✓' : '✗'}</span>
        <div className="fb-body">
          <strong style={{ color: v.ok ? 'var(--green)' : 'var(--accent)' }}>{v.skipped ? 'Пропущено' : v.ok ? 'Верно!' : 'Неверно'}</strong>
          {v.answer && !v.ok && (
            <div>
              Правильный ответ: <span className="ja" style={{ fontSize: '1.1rem' }}><Furigana text={v.answer} /></span>
            </div>
          )}
          {v.note && <div className="small">{v.note}</div>}
          {explain && <div className="small">{explain}</div>}
        </div>
      </div>
      <button className="btn primary block big" style={{ marginTop: 12 }} onClick={onNext} autoFocus>
        Далее <span className="kbd" style={{ color: 'inherit', background: 'transparent' }}>Enter</span>
      </button>
    </div>
  );
}

function ChoiceEx({ ex, onAnswer }: { ex: Extract<Exercise, { type: 'choice' }>; onAnswer: (v: Verdict) => void }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const mode = useProgress((s) => s.settings.transcription);
  const pick = (i: number) => {
    if (chosen !== null) return;
    setChosen(i);
    onAnswer({ ok: i === ex.answer, answer: ex.options[ex.answer] });
  };
  useEffect(() => {
    setChosen(null);
  }, [ex]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= ex.options.length && chosen === null) pick(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const big = ex.ja && stripFurigana(ex.ja).length <= 2;
  return (
    <div>
      {ex.context && (
        <div className="chat" style={{ marginBottom: 14 }}>
          {ex.context.map((c, i) => (
            <div key={i} className="bubble npc">
              <div className="small faint">{c.speaker}</div>
              <div className="ja-line">
                <Furigana text={c.ja} />
              </div>
              {c.ru && <div className="ru-line">{c.ru}</div>}
            </div>
          ))}
        </div>
      )}
      {ex.ja && (!ex.hideText || chosen !== null) && (
        <div className={`ex-ja ${big ? 'huge' : ''}`}>
          <Furigana text={ex.ja} />
          {ex.reading && chosen !== null && ex.reading !== stripFurigana(ex.ja) && <div className="reading">{ex.reading}</div>}
          {ex.reading && chosen !== null && mode !== 'none' && <div className="translit">{transcribe(ex.reading, mode)}</div>}
        </div>
      )}
      {ex.audio && (
        <div className="row" style={{ justifyContent: 'center', marginBottom: 14 }}>
          <AudioButton text={ex.audio} autoPlay={!!ex.hideText} label={ex.hideText ? 'Слушать' : undefined} />
          {ex.hideText && <AudioButton text={ex.audio} profile="slow" label="Медленно" />}
        </div>
      )}
      <div className="options">
        {ex.options.map((o, i) => (
          <button
            key={i}
            className={`option ${ex.optionsJa ? 'ja-opt' : ''} ${chosen !== null && i === ex.answer ? 'right' : ''} ${chosen === i && i !== ex.answer ? 'wrong' : ''}`}
            onClick={() => pick(i)}
            disabled={chosen !== null}
          >
            <span className="key">{i + 1}</span>
            <span>
              <Furigana text={o} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function InputEx({ ex, onAnswer }: { ex: Extract<Exercise, { type: 'input' }>; onAnswer: (v: Verdict) => void }) {
  const [val, setVal] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    setVal('');
    setDone(false);
  }, [ex]);
  const submit = () => {
    if (done || !val.trim()) return;
    setDone(true);
    if (ex.lang === 'ru') {
      const r = checkRussianAnswer(val, ex.answers);
      onAnswer({ ok: r.correct, answer: ex.answers[0], note: !r.correct && r.close ? 'Почти! Проверьте написание.' : undefined });
    } else if (ex.lang === 'romaji') {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
      const alt: Record<string, string[]> = { shi: ['si'], chi: ['ti'], tsu: ['tu'], fu: ['hu'], ji: ['zi', 'di'], zu: ['du'], wo: ['o'], o: ['wo'] };
      const ok = ex.answers.some((a) => norm(a) === norm(val) || (alt[norm(a)] ?? []).includes(norm(val)));
      onAnswer({ ok, answer: ex.answers[0] });
    } else {
      const r = checkJapaneseAnswer(val, ex.answers);
      onAnswer({ ok: r.correct, answer: ex.answers[0], note: !r.correct && r.close ? `Почти! Ваш ответ: ${val}` : undefined });
    }
  };
  return (
    <div>
      {ex.ja && (!ex.hideText || done) && (
        <div className={`ex-ja ${stripFurigana(ex.ja).length <= 2 ? 'huge' : ''}`}>
          <Furigana text={ex.ja} />
        </div>
      )}
      {ex.audio && (
        <div className="row" style={{ justifyContent: 'center', marginBottom: 14 }}>
          <AudioButton text={ex.audio} autoPlay={!!ex.hideText} label="Слушать" />
          <AudioButton text={ex.audio} profile="slow" label="Медленно" />
        </div>
      )}
      <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div style={{ flex: 1 }}>
          {ex.lang === 'ja' ? (
            <KanaInput value={val} onChange={setVal} onEnter={submit} placeholder={ex.placeholder} autoFocus disabled={done} />
          ) : (
            <input
              className="input"
              value={val}
              autoFocus
              disabled={done}
              placeholder={ex.lang === 'romaji' ? 'латиницей, например: ka' : 'перевод на русском'}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              autoCapitalize="off"
            />
          )}
        </div>
        {!done && (
          <button className="btn primary" onClick={submit} disabled={!val.trim()}>
            Проверить
          </button>
        )}
      </div>
    </div>
  );
}

function BuildEx({ ex, onAnswer }: { ex: Extract<Exercise, { type: 'build' }>; onAnswer: (v: Verdict) => void }) {
  const [order, setOrder] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  useEffect(() => {
    setOrder([]);
    setDone(false);
  }, [ex]);
  const check = () => {
    setDone(true);
    const built = order.map((i) => ex.tokens[i]).join('');
    onAnswer({ ok: built === ex.answer.join(''), answer: ex.answer.join(' ') });
  };
  return (
    <div>
      <div className="muted" style={{ marginBottom: 10 }}>
        Перевод: <strong style={{ color: 'var(--text)' }}>{ex.translation}</strong>
      </div>
      <div className="tokens">
        {order.map((i, k) => (
          <button key={k} className="token" disabled={done} onClick={() => setOrder(order.filter((_, j) => j !== k))}>
            {ex.tokens[i]}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        {ex.tokens.map((t, i) => (
          <button key={i} className={`token ${order.includes(i) ? 'used' : ''}`} disabled={done} onClick={() => setOrder([...order, i])}>
            {t}
          </button>
        ))}
      </div>
      {!done && (
        <button className="btn primary block" disabled={order.length !== ex.tokens.length} onClick={check}>
          Проверить
        </button>
      )}
      {done && ex.audio && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
          <AudioButton text={ex.audio} autoPlay label="Прослушать фразу" />
        </div>
      )}
    </div>
  );
}

function MatchEx({ ex, onAnswer }: { ex: Extract<Exercise, { type: 'match' }>; onAnswer: (v: Verdict) => void }) {
  const right = useMemo(() => [...ex.pairs.keys()].sort(() => Math.random() - 0.5), [ex]);
  const [sel, setSel] = useState<number | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [errs, setErrs] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  const say = useSpeak();
  useEffect(() => {
    setSel(null);
    setDone(new Set());
    setErrs(0);
  }, [ex]);
  const choose = (r: number) => {
    if (sel === null) return;
    if (r === sel) {
      const next = new Set(done).add(r);
      setDone(next);
      setSel(null);
      if (next.size === ex.pairs.length) onAnswer({ ok: errs <= 1, note: errs ? `Ошибок: ${errs}` : undefined });
    } else {
      setErrs((e) => e + 1);
      setFlash(r);
      setTimeout(() => setFlash(null), 350);
    }
  };
  return (
    <div className="match-grid">
      <div className="col">
        {ex.pairs.map(([l], i) => (
          <button
            key={i}
            className={`match-item ${ex.leftJa ? 'ja' : ''} ${sel === i ? 'sel' : ''} ${done.has(i) ? 'done' : ''}`}
            style={ex.leftJa ? { fontSize: '1.3rem' } : undefined}
            onClick={() => {
              setSel(i);
              if (ex.leftJa) void say(l);
            }}
          >
            <Furigana text={l} />
          </button>
        ))}
      </div>
      <div className="col">
        {right.map((r) => (
          <button key={r} className={`match-item ${done.has(r) ? 'done' : ''} ${flash === r ? 'err' : ''}`} onClick={() => choose(r)}>
            {ex.pairs[r][1]}
          </button>
        ))}
      </div>
    </div>
  );
}

function SpeakEx({ ex, onAnswer }: { ex: Extract<Exercise, { type: 'speak' }>; onAnswer: (v: Verdict) => void }) {
  const record = useProgress((s) => s.recordPronunciation);
  return (
    <div>
      <div className="ex-ja">
        <Furigana text={ex.ja} />
        {ex.reading !== stripFurigana(ex.ja) && <div className="reading">{ex.reading}</div>}
        <div className="muted" style={{ fontSize: '1rem' }}>{ex.translation}</div>
      </div>
      <SpeakCheck
        text={ex.ja}
        reading={ex.reading}
        accent={ex.accent}
        onResult={(r) => {
          record({ text: stripFurigana(ex.ja), score: r.score, accent: r.pitch?.accentScore ?? 0, issues: r.issues.slice(0, 3) });
          if (r.score >= 0.6) onAnswer({ ok: true, note: r.issues[0] });
        }}
      />
      <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
        <button className="btn small ghost" onClick={() => onAnswer({ ok: true, skipped: true, note: asrSupported() ? undefined : 'Распознавание речи недоступно в этом браузере.' })}>
          Не могу говорить сейчас →
        </button>
      </div>
    </div>
  );
}

function DrawEx({ ex, onAnswer }: { ex: Extract<Exercise, { type: 'draw' }>; onAnswer: (v: Verdict) => void }) {
  return (
    <div>
      <DrawPad ch={ex.char} onDone={(r) => onAnswer({ ok: r.score >= 0.5, note: r.mistakes[0]?.message })} />
      <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
        <button className="btn small ghost" onClick={() => onAnswer({ ok: true, skipped: true })}>
          Пропустить →
        </button>
      </div>
    </div>
  );
}

export function ExerciseView({ ex, onAnswer }: { ex: Exercise; onAnswer: (v: Verdict) => void }) {
  switch (ex.type) {
    case 'choice':
      return <ChoiceEx ex={ex} onAnswer={onAnswer} />;
    case 'input':
      return <InputEx ex={ex} onAnswer={onAnswer} />;
    case 'build':
      return <BuildEx ex={ex} onAnswer={onAnswer} />;
    case 'match':
      return <MatchEx ex={ex} onAnswer={onAnswer} />;
    case 'speak':
      return <SpeakEx ex={ex} onAnswer={onAnswer} />;
    case 'draw':
      return <DrawEx ex={ex} onAnswer={onAnswer} />;
  }
}

function describe(ex: Exercise): string {
  switch (ex.type) {
    case 'choice':
      return stripFurigana(ex.ja ?? ex.audio ?? ex.prompt);
    case 'input':
      return stripFurigana(ex.ja ?? ex.audio ?? ex.prompt);
    case 'build':
      return ex.translation;
    case 'match':
      return ex.prompt;
    case 'speak':
      return stripFurigana(ex.ja);
    case 'draw':
      return ex.char;
  }
}

export function ExerciseRunner({ exercises, onFinish, header }: { exercises: Exercise[]; onFinish: (r: RunResult) => void; header?: ReactNode }) {
  const [queue, setQueue] = useState<Exercise[]>(exercises);
  const [idx, setIdx] = useState(0);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0, xp: 0 });
  const [perItem, setPerItem] = useState<Record<string, boolean>>({});
  const [retried, setRetried] = useState<Set<Exercise>>(new Set());
  const recordAnswer = useProgress((s) => s.recordAnswer);
  const qte = useQte();

  useEffect(() => {
    setQueue(exercises);
    setIdx(0);
    setVerdict(null);
    setStats({ correct: 0, total: 0, xp: 0 });
    setPerItem({});
    setRetried(new Set());
  }, [exercises]);

  const ex = queue[idx];

  const answer = (v: Verdict) => {
    if (verdict) return;
    setVerdict(v);
    if (v.skipped) return;
    const first = !retried.has(ex);
    recordAnswer(ex.skill, v.ok, v.ok ? undefined : {
      item: describe(ex),
      expected: v.answer ? stripFurigana(v.answer) : '',
      got: '',
      note: ex.prompt,
      cardId: ex.itemId,
    });
    if (ex.itemId) setPerItem((p) => ({ ...p, [ex.itemId!]: (p[ex.itemId!] ?? true) && v.ok }));
    setStats((s) => ({ correct: s.correct + (v.ok && first ? 1 : 0), total: s.total + (first ? 1 : 0), xp: s.xp + (v.ok ? (first ? 10 : 4) : 0) }));
    if (!v.ok && first) {
      // ошибочное задание повторяется в конце урока
      setRetried((r) => new Set(r).add(ex));
      setQueue((q) => [...q, ex]);
    }
  };

  const next = async () => {
    const wasOk = verdict?.ok;
    setVerdict(null);
    if (idx + 1 >= queue.length) {
      onFinish({ ...stats, perItem });
      return;
    }
    if (wasOk) await qte.maybeTrigger(0.08);
    setIdx(idx + 1);
  };

  if (!ex) return null;
  const pct = (idx / queue.length) * 100;
  return (
    <div className="ex-wrap">
      {header}
      <div className="row" style={{ marginBottom: 18, flexWrap: 'nowrap' }}>
        <div className="progress" style={{ flex: 1 }}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <span className="small faint nowrap">
          {idx + 1} / {queue.length}
        </span>
      </div>
      <div className="card">
        <div className="ex-prompt">
          <Furigana text={ex.prompt} />
        </div>
        <ExerciseView key={idx} ex={ex} onAnswer={answer} />
        {verdict && <Feedback v={verdict} explain={ex.explain} onNext={next} />}
      </div>
    </div>
  );
}

