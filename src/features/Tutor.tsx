// ИИ-преподаватель: аналитика навыков, журнал ошибок, индивидуальный план повторения.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProgress, snapshot, SKILL_NAMES, accuracy, type Skill } from '../store/progress';
import { buildLocalPlan, statsReport } from '../core/tutor';
import { aiAvailable, tutorPlan } from '../core/ai/client';
import type { TutorPlan } from '../core/ai/requests';
import { mastery } from '../core/srs';
import { useAsync } from '../hooks';

export function TutorPage() {
  const s = useProgress();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => buildLocalPlan(snapshot()), [s.updatedAt]);
  const { data: ai } = useAsync(() => aiAvailable(s.settings), [s.settings.aiMode, s.settings.apiKey]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const saved = useMemo<TutorPlan | null>(() => {
    try {
      return s.plan ? (JSON.parse(s.plan.text) as TutorPlan) : null;
    } catch {
      return null;
    }
  }, [s.plan]);

  const askAi = async () => {
    setBusy(true);
    setErr('');
    try {
      const p = await tutorPlan(s.settings, statsReport(snapshot()));
      s.setPlan(JSON.stringify(p));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const cards = Object.values(s.cards);
  const buckets = [
    { label: 'новые', n: cards.filter((c) => c.state === 'new').length, color: 'var(--text-3)' },
    { label: 'учатся', n: cards.filter((c) => c.state === 'learning' || c.state === 'relearning').length, color: 'var(--amber)' },
    { label: 'молодые', n: cards.filter((c) => c.state === 'review' && c.s < 21).length, color: 'var(--indigo)' },
    { label: 'зрелые (21+ дн.)', n: cards.filter((c) => c.state === 'review' && c.s >= 21).length, color: 'var(--green)' },
  ];
  const avgMastery = cards.length ? cards.reduce((a, c) => a + mastery(c), 0) / cards.length : 0;
  const pron = s.pronunciation.slice(0, 20);
  const pronAvg = pron.length ? pron.reduce((a, p) => a + p.score, 0) / pron.length : 0;

  return (
    <div>
      <div className="page-head">
        <h1>ИИ-преподаватель</h1>
        <p>Анализирует произношение, словарный запас, грамматику, понимание на слух и типичные ошибки — и после каждого занятия обновляет план повторения.</p>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>Навыки</h3>
          {(Object.keys(SKILL_NAMES) as Skill[]).map((k) => {
            const st = s.skills[k];
            const acc = accuracy(st);
            return (
              <div key={k} style={{ marginBottom: 10 }}>
                <div className="row between small">
                  <span>{SKILL_NAMES[k]}</span>
                  <span className="faint">{st?.total ? `${Math.round(acc * 100)}% · ${st.total} отв.` : 'нет данных'}</span>
                </div>
                <div className={`progress ${acc >= 0.8 ? 'green' : ''}`}>
                  <div style={{ width: `${acc * 100}%`, background: acc < 0.6 ? 'var(--accent)' : acc < 0.8 ? 'var(--amber)' : undefined }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="stack">
          <div className="card">
            <h3>Память</h3>
            <div className="row" style={{ height: 14, borderRadius: 9, overflow: 'hidden', gap: 0, flexWrap: 'nowrap' }}>
              {buckets.map((b) => (
                <div key={b.label} style={{ flex: b.n || 0.0001, background: b.color, height: '100%' }} title={`${b.label}: ${b.n}`} />
              ))}
            </div>
            <div className="row small" style={{ marginTop: 8 }}>
              {buckets.map((b) => (
                <span key={b.label}>
                  <span style={{ color: b.color }}>●</span> {b.label}: {b.n}
                </span>
              ))}
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Средняя прочность знаний: {Math.round(avgMastery * 100)}%. Карточек к повторению: {plan.due}.
            </div>
          </div>
          <div className="card">
            <h3>Речь</h3>
            <div className="grid grid-2">
              <div className="stat">
                <span className="v">{Math.round(pronAvg * 100)}</span>
                <span className="l">произношение (ср. за 20 попыток)</span>
              </div>
              <div className="stat">
                <span className="v">{Math.round(accuracy(s.skills.listening) * 100)}%</span>
                <span className="l">понимание на слух</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>📋 План повторения</h3>
        <p className="muted">{plan.summary}</p>
        {plan.steps.map((st, i) => (
          <Link key={i} to={st.route} className="lesson-row">
            <span className="lesson-dot">{i + 1}</span>
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{st.title}</div>
              <div className="small muted">{st.reason}</div>
            </span>
            <span className="small faint nowrap">~{st.minutes} мин</span>
          </Link>
        ))}
        {plan.focusItems.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="small faint">Что чаще всего вызывает ошибки</div>
            <div className="row" style={{ gap: 6 }}>
              {plan.focusItems.map((f) => (
                <Link key={f} to={`/dict?q=${encodeURIComponent(f)}`} className="chip amber ja">
                  {f}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row between">
          <h3 style={{ margin: 0 }}>🤖 Разбор от ИИ</h3>
          <button className="btn primary" onClick={askAi} disabled={!ai || busy}>
            {busy ? 'Анализирую…' : saved ? 'Обновить разбор' : 'Получить разбор'}
          </button>
        </div>
        {!ai && (
          <p className="small muted" style={{ marginTop: 8 }}>
            Подключите ИИ в <Link to="/settings">настройках</Link>, чтобы получить подробный разбор и персональный план от Claude. Локальный план выше работает всегда.
          </p>
        )}
        {err && <div className="feedback bad small">{err}</div>}
        {saved && (
          <div style={{ marginTop: 10 }}>
            <p>{saved.summary_ru}</p>
            <div className="grid grid-2">
              <div>
                <div className="small faint">Сильные стороны</div>
                <ul className="small">{saved.strengths_ru.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
              <div>
                <div className="small faint">Над чем работать</div>
                <ul className="small">{saved.weaknesses_ru.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            </div>
            {saved.steps.map((st, i) => (
              <Link key={i} to={st.route} className="lesson-row">
                <span className="lesson-dot">{i + 1}</span>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{st.title_ru}</div>
                  <div className="small muted">{st.reason_ru}</div>
                </span>
                <span className="small faint nowrap">~{st.minutes} мин</span>
              </Link>
            ))}
            {saved.focus_items.length > 0 && (
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                {saved.focus_items.map((f) => (
                  <span key={f} className="chip violet ja">
                    {f}
                  </span>
                ))}
              </div>
            )}
            <div className="callout tip">{saved.motivation_ru}</div>
            <div className="tiny faint">Составлен: {s.plan ? new Date(s.plan.at).toLocaleString('ru-RU') : ''}</div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Журнал ошибок</h3>
        {s.mistakes.length === 0 ? (
          <p className="muted small">Ошибок пока нет — или вы ещё не начали заниматься 🙂</p>
        ) : (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {s.mistakes.slice(0, 80).map((m) => (
              <div key={m.id} className="row small" style={{ borderBottom: '1px solid var(--line)', padding: '6px 0', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <span className="chip">{SKILL_NAMES[m.skill]}</span>
                <span style={{ flex: 1 }}>
                  <span className="ja">{m.item}</span>
                  {m.expected && (
                    <>
                      {' '}
                      → <span className="ja" style={{ color: 'var(--green)' }}>{m.expected}</span>
                    </>
                  )}
                  {m.got && <span className="faint"> (ваш ответ: {m.got})</span>}
                  {m.note && <div className="tiny faint">{m.note}</div>}
                </span>
                <span className="tiny faint nowrap">{new Date(m.at).toLocaleDateString('ru-RU')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
