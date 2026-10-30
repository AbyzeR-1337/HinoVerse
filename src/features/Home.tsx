import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProgress, todayXp, dayKey, snapshot } from '../store/progress';
import { useCourse, useNextLesson, lessonPath, useManifest } from '../hooks';
import { useDueCount } from '../components/Layout';
import { buildLocalPlan } from '../core/tutor';
import { courseStats } from '../content/curriculum';
import { useQte } from '../components/Qte';
import { pluralN } from '../core/format';

function Ring({ value, max, label }: { value: number; max: number; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / Math.max(1, max));
  return (
    <svg width={86} height={86} viewBox="0 0 86 86" aria-label={label}>
      <circle cx={43} cy={43} r={r} fill="none" stroke="var(--bg-sunk)" strokeWidth={9} />
      <circle cx={43} cy={43} r={r} fill="none" stroke={pct >= 1 ? 'var(--green)' : 'var(--accent)'} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 43 43)" />
      <text x={43} y={41} textAnchor="middle" fontSize={17} fontWeight={700} fill="var(--text)">
        {value}
      </text>
      <text x={43} y={57} textAnchor="middle" fontSize={10} fill="var(--text-3)">
        из {max}
      </text>
    </svg>
  );
}

function Onboarding() {
  const setName = useProgress((s) => s.setName);
  const setSettings = useProgress((s) => s.setSettings);
  const settings = useProgress((s) => s.settings);
  const [name, setN] = useState('');
  return (
    <div className="card" style={{ marginBottom: 18, borderColor: 'var(--accent)' }}>
      <h2>ようこそ！ Добро пожаловать в HinoVerse</h2>
      <p className="muted">Платформа проведёт вас от первого символа до свободного общения. Пара вопросов для начала:</p>
      <div className="grid grid-3">
        <label className="field">
          Как вас зовут?
          <input className="input" value={name} onChange={(e) => setN(e.target.value)} placeholder="Например, Анна" />
        </label>
        <label className="field">
          Цель в день
          <select className="input" value={settings.dailyGoal} onChange={(e) => setSettings({ dailyGoal: Number(e.target.value) })}>
            <option value={30}>Лёгкая — 30 XP (~10 мин)</option>
            <option value={50}>Обычная — 50 XP (~15 мин)</option>
            <option value={100}>Серьёзная — 100 XP (~30 мин)</option>
            <option value={200}>Интенсив — 200 XP (~1 час)</option>
          </select>
        </label>
        <label className="field">
          Подсказка произношения
          <select className="input" value={settings.transcription} onChange={(e) => setSettings({ transcription: e.target.value as 'romaji' | 'polivanov' | 'none' })}>
            <option value="polivanov">Кириллица (Поливанов): сэнсэй</option>
            <option value="romaji">Латиница (ромадзи): sensei</option>
            <option value="none">Не показывать</option>
          </select>
        </label>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={() => setName(name.trim() || 'ученик')}>
          Начать обучение
        </button>
        <span className="small faint">Всё можно изменить в настройках.</span>
      </div>
    </div>
  );
}

export function Home() {
  const s = useProgress();
  const next = useNextLesson();
  const due = useDueCount();
  const { stages } = useCourse();
  const manifest = useManifest();
  const qte = useQte();
  const today = todayXp(s.xpByDay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => buildLocalPlan(snapshot()), [s.updatedAt]);
  const stats = courseStats(stages);
  const words = Object.values(s.items).filter((i) => i.t === 'word').length;
  const kanji = Object.values(s.items).filter((i) => i.t === 'kanji').length;
  const kana = Object.values(s.items).filter((i) => i.t === 'kana').length;
  const week = Array.from({ length: 7 }, (_, i) => {
    const t = Date.now() - (6 - i) * 86_400_000;
    const k = dayKey(t);
    return { k, xp: s.xpByDay[k] ?? 0, d: new Date(t).toLocaleDateString('ru-RU', { weekday: 'short' }) };
  });
  const maxXp = Math.max(s.settings.dailyGoal, ...week.map((w) => w.xp));
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'こんばんは' : hour < 11 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'こんばんは';

  return (
    <div>
      {!s.name && <Onboarding />}
      <div className="page-head">
        <div className="ja muted">{greet}</div>
        <h1>{s.name ? `${s.name}, продолжим!` : 'Изучение японского с нуля'}</h1>
        <p>«Не просто учить язык. Начать думать на японском.»</p>
      </div>

      <div className="grid grid-3">
        <div className="card row" style={{ flexWrap: 'nowrap' }}>
          <Ring value={today} max={s.settings.dailyGoal} label="Цель дня" />
          <div>
            <div style={{ fontWeight: 700 }}>Цель дня</div>
            <div className="small muted">{today >= s.settings.dailyGoal ? 'Выполнена! お疲れさま！' : `Осталось ${s.settings.dailyGoal - today} XP`}</div>
          </div>
        </div>
        <div className="card">
          <div className="stat">
            <span className="v">🔥 {s.streak}</span>
            <span className="l">{pluralN(s.streak, ['день', 'дня', 'дней'])} подряд</span>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>Всего опыта: {s.xp} XP</div>
        </div>
        <Link to="/review" className="card link">
          <div className="stat">
            <span className="v" style={{ color: due ? 'var(--accent)' : 'var(--green)' }}>🔁 {due}</span>
            <span className="l">карточек ждут повторения</span>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>{due ? 'Самое время повторить →' : 'Всё повторено ✓'}</div>
        </Link>
      </div>

      {next && (
        <Link to={lessonPath(next)} className="card link" style={{ marginTop: 14, borderLeft: '5px solid var(--accent)' }}>
          <div className="row between">
            <div>
              <div className="small faint">Продолжить курс</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{next.title}</div>
              {next.subtitle && <div className="small muted ja">{next.subtitle}</div>}
            </div>
            <span className="btn primary">Начать →</span>
          </div>
        </Link>
      )}

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="row between">
            <h3 style={{ margin: 0 }}>🧑‍🏫 План на сегодня</h3>
            <Link to="/tutor" className="small">
              ИИ-разбор →
            </Link>
          </div>
          <p className="small muted" style={{ margin: '6px 0' }}>
            {plan.summary}
          </p>
          {plan.steps.slice(0, 4).map((st, i) => (
            <Link key={i} to={st.route} className="lesson-row" style={{ padding: '8px 6px' }}>
              <span className="lesson-dot" style={{ width: 28, height: 28 }}>
                {i + 1}
              </span>
              <span style={{ flex: 1 }}>{st.title}</span>
              <span className="tiny faint nowrap">{st.minutes} мин</span>
            </Link>
          ))}
        </div>
        <div className="card">
          <h3>📈 Неделя</h3>
          <div className="row" style={{ alignItems: 'flex-end', gap: 8, height: 120, flexWrap: 'nowrap' }}>
            {week.map((w) => (
              <div key={w.k} className="col" style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <div className="tiny faint">{w.xp || ''}</div>
                <div
                  style={{
                    width: '100%',
                    maxWidth: 30,
                    height: `${Math.max(4, (w.xp / maxXp) * 80)}px`,
                    background: w.xp >= s.settings.dailyGoal ? 'var(--green)' : w.xp ? 'var(--accent)' : 'var(--bg-sunk)',
                    borderRadius: 6,
                  }}
                />
                <div className="tiny faint">{w.d}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-3" style={{ marginTop: 12 }}>
            <div className="stat">
              <span className="v" style={{ fontSize: '1.2rem' }}>{kana}</span>
              <span className="l">знаков каны</span>
            </div>
            <div className="stat">
              <span className="v" style={{ fontSize: '1.2rem' }}>{words}</span>
              <span className="l">слов</span>
            </div>
            <div className="stat">
              <span className="v" style={{ fontSize: '1.2rem' }}>{kanji}</span>
              <span className="l">кандзи</span>
            </div>
          </div>
        </div>
      </div>

      <h2 className="section">Практика</h2>
      <div className="grid grid-4">
        {[
          { to: '/speak', icon: '🎙️', t: 'Произношение', d: 'Тон, ритм, звуки' },
          { to: '/talk', icon: '💬', t: 'Разговор', d: 'ИИ-собеседники и сцены' },
          { to: '/city', icon: '🏙️', t: 'Виртуальная Япония', d: 'Город, где все говорят по-японски' },
          { to: '/write', icon: '✍️', t: 'Письмо', d: 'От руки и тексты с проверкой' },
          { to: '/exam', icon: '🎓', t: 'JLPT', d: 'Пробные экзамены N5–N1' },
          { to: '/read', icon: '📖', t: 'Чтение', d: 'Истории с переводом по нажатию' },
          { to: '/kanji', icon: '漢', t: 'Кандзи', d: `${manifest?.kanjiTotal ?? '13 000'}+ иероглифов` },
          { to: '/dict', icon: '📚', t: 'Словарь', d: `${manifest?.dictEntries?.toLocaleString('ru-RU') ?? '65 000'} статей` },
        ].map((x) => (
          <Link key={x.to} to={x.to} className="card link">
            <div style={{ fontSize: '1.7rem' }} className="ja">
              {x.icon}
            </div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>{x.t}</div>
            <div className="small muted">{x.d}</div>
          </Link>
        ))}
      </div>
      <div className="card row between" style={{ marginTop: 14 }}>
        <div>
          <strong>⚡ Испытание реакции</strong>
          <div className="small muted">Внезапная ситуация: официант, объявление, звонок. Ответьте быстро!</div>
        </div>
        <button className="btn" onClick={() => void qte.trigger()}>
          Начать
        </button>
      </div>
      <p className="small faint" style={{ marginTop: 20 }}>
        В курсе: {stats.stages} ступеней, {stats.chapters} глав, {stats.lessons} уроков
        {manifest ? `; словарь ${manifest.dictEntries.toLocaleString('ru-RU')} статей, ${manifest.sentences.toLocaleString('ru-RU')} предложений с переводом, ${manifest.kanjiTotal.toLocaleString('ru-RU')} иероглифов.` : '.'}
      </p>
    </div>
  );
}
