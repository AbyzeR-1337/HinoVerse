// Интервальное повторение (FSRS): карточки возвращаются ровно тогда, когда начинают забываться.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useProgress, dueCards, newCards, dayKey, type CardItem } from '../store/progress';
import { previewIntervals, formatInterval, type Grade, type Card } from '../core/srs';
import { transcribe } from '../core/kana';
import { AudioButton } from '../components/AudioButton';
import { PitchPattern } from '../components/PitchGraph';
import { KanaInput } from '../components/KanaInput';
import { checkJapaneseAnswer } from '../core/compare';
import { pluralN } from '../core/format';

const GRADES: { g: Grade; label: string; cls: string }[] = [
  { g: 1, label: 'Забыл', cls: '' },
  { g: 2, label: 'Трудно', cls: '' },
  { g: 3, label: 'Хорошо', cls: 'primary' },
  { g: 4, label: 'Легко', cls: 'good' },
];

function CardFace({ item, back, mode }: { item: CardItem; back: boolean; mode: 'romaji' | 'polivanov' | 'none' }) {
  const big = item.t === 'kanji' || item.t === 'kana';
  return (
    <div className="learn-card">
      <div className="small faint">{item.t === 'kanji' ? 'иероглиф' : item.t === 'kana' ? 'кана' : item.t === 'grammar' ? 'грамматика' : 'слово'}</div>
      <div className={`big-ja ${item.t === 'kanji' ? 'kanji' : ''}`} style={item.t === 'grammar' ? { fontSize: '1.6rem' } : big ? undefined : { fontSize: '2.6rem' }}>
        {item.f}
      </div>
      {back && (
        <div style={{ animation: 'fade .2s' }}>
          {item.r && <div className="reading">{item.r}</div>}
          {mode !== 'none' && item.t !== 'grammar' && <div className="translit">{transcribe(item.r ?? item.f, mode)}</div>}
          {item.a && item.r && (
            <div style={{ margin: '6px 0' }}>
              <PitchPattern reading={item.r} accent={item.a} compact />
            </div>
          )}
          {item.a && !item.r && (
            <div style={{ margin: '6px 0' }}>
              <PitchPattern reading={item.f} accent={item.a} compact />
            </div>
          )}
          <div style={{ fontSize: '1.3rem', fontWeight: 700, marginTop: 8 }}>{item.b}</div>
          {item.t !== 'grammar' && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
              <AudioButton text={item.r ?? item.f} autoPlay />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ReviewPage() {
  const [params] = useSearchParams();
  const leechMode = params.get('mode') === 'leeches';
  const cards = useProgress((s) => s.cards);
  const items = useProgress((s) => s.items);
  const gradeCard = useProgress((s) => s.gradeCard);
  const addXp = useProgress((s) => s.addXp);
  const recordAnswer = useProgress((s) => s.recordAnswer);
  const settings = useProgress((s) => s.settings);
  const [inputMode, setInputMode] = useState(false);

  // очередь фиксируется при старте сессии
  const [queue, setQueue] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [back, setBack] = useState(false);
  const [typed, setTyped] = useState('');
  const [typedResult, setTypedResult] = useState<boolean | null>(null);
  const [done, setDone] = useState({ count: 0, good: 0 });

  const due = useMemo(() => dueCards(cards), [cards]);
  const fresh = useMemo(() => newCards(cards), [cards]);
  const leeches = useMemo(() => Object.values(cards).filter((c) => c.lapses >= 3), [cards]);
  const today = dayKey();
  const introducedToday = useMemo(() => Object.values(cards).filter((c) => c.reps > 0 && dayKey(c.last) === today && c.reps === 1).length, [cards, today]);
  const newLimit = Math.max(0, settings.newPerDay - introducedToday);

  const start = () => {
    const base: Card[] = leechMode ? leeches : [...due.slice(0, 100), ...fresh.slice(0, newLimit)];
    setQueue(base.map((c) => c.id).filter((id) => items[id]));
    setStarted(true);
    setI(0);
    setBack(false);
    setDone({ count: 0, good: 0 });
  };

  const id = queue[i];
  const item = id ? items[id] : undefined;
  const card = id ? cards[id] : undefined;
  const preview = card ? previewIntervals(card) : null;

  const grade = (g: Grade) => {
    if (!id) return;
    gradeCard(id, g);
    recordAnswer(item?.t === 'kanji' ? 'kanji' : item?.t === 'kana' ? 'kana' : item?.t === 'grammar' ? 'grammar' : 'vocab', g > 1, g > 1 ? undefined : { item: item?.f ?? id, expected: item?.b ?? '', got: '', note: 'повторение', cardId: id });
    addXp(g > 1 ? 3 : 1);
    if (g === 1) setQueue((q) => [...q, id]); // забытое — ещё раз в этой сессии
    setDone((d) => ({ count: d.count + 1, good: d.good + (g > 1 ? 1 : 0) }));
    setI(i + 1);
    setBack(false);
    setTyped('');
    setTypedResult(null);
  };

  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!back) setBack(true);
        else grade(3);
      }
      if (back && ['1', '2', '3', '4'].includes(e.key)) grade(Number(e.key) as Grade);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const checkTyped = () => {
    if (!item) return;
    const ok = checkJapaneseAnswer(typed, [item.r ?? item.f, item.f]).correct;
    setTypedResult(ok);
    setBack(true);
  };

  if (!started) {
    const total = leechMode ? leeches.length : due.length + Math.min(fresh.length, newLimit);
    return (
      <div className="ex-wrap">
        <div className="page-head">
          <h1>{leechMode ? 'Трудные карточки' : 'Повторение'}</h1>
          <p>Алгоритм FSRS рассчитывает для каждой карточки момент, когда вероятность вспомнить падает до 90%.</p>
        </div>
        <div className="grid grid-3">
          <div className="card stat">
            <span className="v" style={{ color: 'var(--accent)' }}>{due.length}</span>
            <span className="l">к повторению</span>
          </div>
          <div className="card stat">
            <span className="v">{Math.min(fresh.length, newLimit)}</span>
            <span className="l">новых сегодня (из {fresh.length})</span>
          </div>
          <div className="card stat">
            <span className="v">{Object.keys(cards).length}</span>
            <span className="l">всего карточек</span>
          </div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row between">
            <div className="seg">
              <button className={!inputMode ? 'on' : ''} onClick={() => setInputMode(false)}>
                Карточки
              </button>
              <button className={inputMode ? 'on' : ''} onClick={() => setInputMode(true)}>
                Ввод ответа
              </button>
            </div>
            <button className="btn primary big" disabled={!total} onClick={start}>
              {total ? `Начать (${total})` : 'Нечего повторять'}
            </button>
          </div>
          {!total && (
            <p className="muted small" style={{ marginTop: 10 }}>
              Карточки появляются после уроков и при добавлении слов из словаря. <Link to="/course">Пройти урок →</Link>
            </p>
          )}
          {leeches.length > 0 && !leechMode && (
            <p className="small" style={{ marginTop: 10 }}>
              <Link to="/review?mode=leeches">Трудные карточки ({leeches.length}) — забывались 3+ раза →</Link>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!item || !card) {
    return (
      <div className="ex-wrap card center" style={{ padding: 30 }}>
        <div style={{ fontSize: '3rem' }}>✨</div>
        <h2>Сессия завершена</h2>
        <p className="muted">
          Повторено {pluralN(done.count, ['карточка', 'карточки', 'карточек'])}, вспомнили {done.count ? Math.round((done.good / done.count) * 100) : 0}%.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to="/" className="btn">
            На главную
          </Link>
          <Link to="/course" className="btn primary">
            Новый урок
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ex-wrap">
      <div className="row" style={{ marginBottom: 14, flexWrap: 'nowrap' }}>
        <div className="progress" style={{ flex: 1 }}>
          <div style={{ width: `${(i / queue.length) * 100}%` }} />
        </div>
        <span className="small faint">
          {i + 1}/{queue.length}
        </span>
      </div>
      <div className="card">
        {inputMode && !back && item.t !== 'grammar' ? (
          <div className="learn-card">
            <div className="small faint">Напишите по-японски</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '12px 0' }}>{item.b}</div>
            <KanaInput value={typed} onChange={setTyped} onEnter={checkTyped} autoFocus />
            <button className="btn primary" style={{ marginTop: 10 }} onClick={checkTyped}>
              Проверить
            </button>
          </div>
        ) : (
          <CardFace item={item} back={back} mode={settings.transcription} />
        )}
        {typedResult !== null && (
          <div className={`feedback ${typedResult ? 'good' : 'bad'}`}>{typedResult ? '✓ Верно' : `✗ Ваш ответ: ${typed}`}</div>
        )}
        {!back ? (
          <button className="btn primary block big" onClick={() => setBack(true)}>
            Показать ответ <span className="kbd" style={{ background: 'transparent', color: 'inherit' }}>Пробел</span>
          </button>
        ) : (
          <div className="grid grid-4" style={{ marginTop: 10 }}>
            {GRADES.map(({ g, label, cls }) => (
              <button key={g} className={`btn ${cls}`} onClick={() => grade(g)} style={{ flexDirection: 'column', gap: 0 }}>
                <span>{label}</span>
                <span className="tiny" style={{ opacity: 0.75 }}>
                  {preview ? formatInterval(preview[g]) : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="tiny faint center" style={{ marginTop: 8 }}>
        Клавиши: пробел — показать, 1–4 — оценка
      </p>
    </div>
  );
}
