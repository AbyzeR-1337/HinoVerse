import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ALL_GRAMMAR, grammarById } from '../content/curriculum';
import { useProgress } from '../store/progress';
import { GrammarView, grammarExercises } from './lesson/GrammarView';
import { ExerciseRunner } from '../components/ExerciseRunner';

export function GrammarPage() {
  const [level, setLevel] = useState(5);
  const [q, setQ] = useState('');
  const lessons = useProgress((s) => s.lessons);
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return ALL_GRAMMAR.filter((g) => (query ? `${g.title} ${g.pattern} ${g.meaning}`.toLowerCase().includes(query) : g.level === level));
  }, [level, q]);
  return (
    <div>
      <div className="page-head">
        <h1>Грамматика</h1>
        <p>{ALL_GRAMMAR.length} конструкций от N5 до N1: простыми словами, со схемами, сравнением с русским, примерами и упражнениями.</p>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Поиск: て-форма, условие, ので…" value={q} onChange={(e) => setQ(e.target.value)} />
        {!q && (
          <div className="seg">
            {[5, 4, 3, 2, 1].map((l) => (
              <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
                N{l}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-auto">
        {list.map((g) => (
          <Link key={g.id} to={`/grammar/${g.id}`} className="card link">
            <div className="row between">
              <span className="chip red">N{g.level}</span>
              {lessons[`g:${g.id}`] && <span className="chip green">✓ {Math.round(lessons[`g:${g.id}`].score * 100)}%</span>}
            </div>
            <div style={{ fontWeight: 700, margin: '8px 0 4px' }}>{g.title}</div>
            <div className="ja small muted">{g.pattern}</div>
            <div className="small faint">{g.meaning}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function GrammarTopicPage() {
  const { id = '' } = useParams();
  const topic = grammarById(id);
  const [practice, setPractice] = useState(false);
  const exercises = useMemo(() => (topic && practice ? grammarExercises(topic) : []), [topic, practice]);
  const completeLesson = useProgress((s) => s.completeLesson);
  if (!topic) return <div className="empty-state">Тема не найдена.</div>;
  const idx = ALL_GRAMMAR.indexOf(topic);
  const prev = ALL_GRAMMAR[idx - 1];
  const next = ALL_GRAMMAR[idx + 1];
  return (
    <div style={{ maxWidth: 820 }}>
      <Link to="/grammar" className="small">
        ← Вся грамматика
      </Link>
      {practice ? (
        <ExerciseRunner
          exercises={exercises}
          onFinish={(r) => {
            completeLesson(`g:${topic.id}`, r.total ? r.correct / r.total : 1, r.xp);
            setPractice(false);
          }}
        />
      ) : (
        <>
          <GrammarView topic={topic} />
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn primary big" onClick={() => setPractice(true)}>
              Упражнения →
            </button>
            <span className="spacer" />
            {prev && (
              <Link className="btn small" to={`/grammar/${prev.id}`}>
                ← {prev.title.slice(0, 24)}
              </Link>
            )}
            {next && (
              <Link className="btn small" to={`/grammar/${next.id}`}>
                {next.title.slice(0, 24)} →
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
