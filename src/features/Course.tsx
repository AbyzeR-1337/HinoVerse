import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCourse, useNextLesson, lessonPath } from '../hooks';
import { useProgress } from '../store/progress';
import type { LessonKind } from '../content/curriculum';

const KIND_ICON: Record<LessonKind, string> = {
  article: '📘',
  kana: 'あ',
  vocab: '🗂️',
  theme: '🏷️',
  kanji: '漢',
  grammar: '📐',
  story: '📖',
  scene: '💬',
  exam: '🏁',
};

const PAGE = 12;

export function CoursePage() {
  const { stages } = useCourse();
  const done = useProgress((s) => s.lessons);
  const next = useNextLesson();
  const initialStage = useMemo(() => stages.find((st) => st.chapters.some((c) => c.lessons.some((l) => l.id === next?.id)))?.id ?? stages[0]?.id, [stages, next]);
  const [stageId, setStageId] = useState(initialStage);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setStageId(initialStage), [initialStage]);
  useEffect(() => setShown(PAGE), [stageId]);
  const stage = stages.find((s) => s.id === stageId) ?? stages[0];
  if (!stage) return null;

  const stageProgress = (id: string) => {
    const st = stages.find((s) => s.id === id)!;
    const all = st.chapters.flatMap((c) => c.lessons);
    return all.length ? all.filter((l) => done[l.id]).length / all.length : 0;
  };

  return (
    <div>
      <div className="page-head">
        <h1>Курс</h1>
        <p>От полного нуля до N1. Можно идти по порядку или открыть любой урок.</p>
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 18 }}>
        {stages.map((st) => (
          <button key={st.id} className={`btn small ${st.id === stage.id ? 'primary' : ''}`} onClick={() => setStageId(st.id)}>
            {st.title.split('·')[0].trim()}
            <span className="tiny" style={{ opacity: 0.8 }}>
              {Math.round(stageProgress(st.id) * 100)}%
            </span>
          </button>
        ))}
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 4 }}>{stage.title}</h2>
        <div className="muted small">{stage.subtitle}</div>
        <div className="progress green" style={{ marginTop: 10 }}>
          <div style={{ width: `${stageProgress(stage.id) * 100}%` }} />
        </div>
        <div className="tiny faint" style={{ marginTop: 4 }}>
          Глав: {stage.chapters.length} · уроков: {stage.chapters.reduce((n, c) => n + c.lessons.length, 0)}
        </div>
      </div>
      {stage.chapters.slice(0, shown).map((ch) => {
        const total = ch.lessons.length;
        const finished = ch.lessons.filter((l) => done[l.id]).length;
        const containsNext = ch.lessons.some((l) => l.id === next?.id);
        const isOpen = open === ch.id || (open === null && containsNext) || stage.chapters.length <= 2;
        return (
          <div key={ch.id} className="card" style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
            <button className="row between" style={{ width: '100%', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }} onClick={() => setOpen(isOpen ? '' : ch.id)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{ch.title}</div>
                <div className="small faint">
                  {finished}/{total} уроков {finished === total ? '· ✓ пройдено' : ''}
                </div>
              </div>
              <span className="faint">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div style={{ padding: '0 8px 8px' }}>
                {ch.lessons.map((l) => {
                  const isDone = !!done[l.id];
                  const isNext = l.id === next?.id;
                  return (
                    <Link key={l.id} to={lessonPath(l)} className="lesson-row">
                      <span className={`lesson-dot ${isDone ? 'done' : isNext ? 'next' : ''} ja`}>{isDone ? '✓' : KIND_ICON[l.kind]}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: isNext ? 700 : 500 }}>{l.title}</div>
                        {l.subtitle && <div className="small muted ja" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.subtitle}</div>}
                      </span>
                      {isDone && <span className="chip green">{Math.round(done[l.id].score * 100)}%</span>}
                      {isNext && <span className="chip red">далее</span>}
                      <span className="tiny faint nowrap">{l.minutes} мин</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {shown < stage.chapters.length && (
        <button className="btn block" onClick={() => setShown(shown + PAGE * 2)}>
          Показать ещё главы ({stage.chapters.length - shown})
        </button>
      )}
    </div>
  );
}
