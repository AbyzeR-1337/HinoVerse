import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { STORIES } from '../content/stories';
import { Furigana } from '../components/Furigana';
import { StoryReader } from './lesson/StoryReader';
import { randomSentences } from '../core/data';
import { useAsync } from '../hooks';
import { TapText } from '../components/TapText';
import { AudioButton } from '../components/AudioButton';
import { Spinner } from '../components/Modal';

function SentenceTrainer() {
  const [maxLen, setMaxLen] = useState(15);
  const [seed, setSeed] = useState(() => Date.now());
  const [shown, setShown] = useState<Set<number>>(new Set());
  const { data, loading } = useAsync(() => randomSentences(maxLen, 8, seed), [maxLen, seed]);
  return (
    <div className="card">
      <div className="row between">
        <h3 style={{ margin: 0 }}>🎲 Реальные предложения (Tatoeba)</h3>
        <div className="row">
          <div className="seg">
            {[
              [12, 'короткие'],
              [25, 'средние'],
              [70, 'длинные'],
            ].map(([n, l]) => (
              <button key={n} className={maxLen === n ? 'on' : ''} onClick={() => setMaxLen(n as number)}>
                {l}
              </button>
            ))}
          </div>
          <button className="btn small" onClick={() => { setSeed(Date.now()); setShown(new Set()); }}>
            ↻ Ещё
          </button>
        </div>
      </div>
      <p className="small muted">Попробуйте понять фразу сами, затем проверьте перевод. Нажмите на слово — словарь.</p>
      {loading || !data ? (
        <Spinner />
      ) : (
        data.map(([jp, ru], i) => (
          <div key={i} className="example">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <div style={{ flex: 1, fontSize: '1.2rem' }}>
                <TapText text={jp} />
              </div>
              <AudioButton text={jp} small />
              <button className="btn small ghost" onClick={() => setShown(new Set(shown).add(i))}>
                RU
              </button>
            </div>
            {shown.has(i) && <div className="ru-line small">{ru}</div>}
          </div>
        ))
      )}
    </div>
  );
}

export function ReadPage() {
  return (
    <div>
      <div className="page-head">
        <h1>Чтение</h1>
        <p>Мини-истории по уровням и десятки тысяч реальных предложений с переводом.</p>
      </div>
      <div className="grid grid-auto">
        {STORIES.map((s) => (
          <Link key={s.id} to={`/read/${s.id}`} className="card link">
            <span className="chip red">N{s.level}</span>
            <div className="ja" style={{ fontSize: '1.3rem', margin: '8px 0 2px' }}>
              <Furigana text={s.titleJa} show={false} />
            </div>
            <div style={{ fontWeight: 600 }}>{s.title}</div>
            <div className="small muted">{s.summary}</div>
          </Link>
        ))}
      </div>
      <div style={{ marginTop: 18 }}>
        <SentenceTrainer />
      </div>
    </div>
  );
}

export function StoryPage() {
  const { id } = useParams();
  const story = STORIES.find((s) => s.id === id);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  if (!story) return <div className="empty-state">История не найдена.</div>;
  return (
    <div style={{ maxWidth: 820 }}>
      <Link to="/read" className="small">
        ← Все истории
      </Link>
      <StoryReader story={story} />
      <h3 style={{ marginTop: 20 }}>Вопросы</h3>
      {story.questions.map((q, qi) => (
        <div key={qi} className="card flat" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{q.q}</div>
          <div className="options">
            {q.options.map((o, oi) => {
              const chosen = answers[qi];
              const cls = chosen === undefined ? '' : oi === q.answer ? 'right' : chosen === oi ? 'wrong' : '';
              return (
                <button key={oi} className={`option ${cls}`} disabled={chosen !== undefined} onClick={() => setAnswers({ ...answers, [qi]: oi })}>
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
