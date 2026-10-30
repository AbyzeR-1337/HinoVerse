import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useProgress, snapshot } from '../../store/progress';
import { buildLocalPlan } from '../../core/tutor';

export function ResultView({
  score,
  correct,
  total,
  xp,
  nextHref,
  onRetry,
  title,
}: {
  score: number;
  correct: number;
  total: number;
  xp: number;
  nextHref?: string;
  onRetry?: () => void;
  title?: string;
}) {
  const streak = useProgress((s) => s.streak);
  const updatedAt = useProgress((s) => s.updatedAt);
  // план повторения пересчитывается после каждого занятия
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => buildLocalPlan(snapshot()), [updatedAt]);
  const pct = Math.round(score * 100);
  const mood = pct >= 90 ? '🏆' : pct >= 70 ? '🎉' : pct >= 40 ? '💪' : '🌱';
  return (
    <div className="ex-wrap">
      <div className="card center" style={{ padding: 28 }}>
        <div style={{ fontSize: '3rem' }}>{mood}</div>
        <h2>{title ?? (pct >= 70 ? 'Урок пройден!' : 'Урок завершён')}</h2>
        <div className="grid grid-3" style={{ margin: '18px 0' }}>
          <div className="stat">
            <span className="v">{pct}%</span>
            <span className="l">точность</span>
          </div>
          <div className="stat">
            <span className="v">
              {correct}/{total}
            </span>
            <span className="l">верных ответов</span>
          </div>
          <div className="stat">
            <span className="v" style={{ color: 'var(--amber)' }}>+{xp}</span>
            <span className="l">опыта · серия {streak} дн.</span>
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          {onRetry && (
            <button className="btn" onClick={onRetry}>
              ↺ Повторить
            </button>
          )}
          {nextHref && (
            <Link className="btn primary big" to={nextHref}>
              Следующий урок →
            </Link>
          )}
          <Link className="btn ghost" to="/course">
            К курсу
          </Link>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="row between">
          <h3 style={{ margin: 0 }}>🧑‍🏫 План повторения</h3>
          <Link to="/tutor" className="small">
            подробнее →
          </Link>
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>
          {plan.summary}
        </p>
        {plan.steps.slice(0, 3).map((s, i) => (
          <Link key={i} to={s.route} className="lesson-row">
            <span className="lesson-dot">{i + 1}</span>
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{s.title}</div>
              <div className="small muted">{s.reason}</div>
            </span>
            <span className="small faint nowrap">~{s.minutes} мин</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
