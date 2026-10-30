import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useProgress, dueCards } from '../store/progress';
import { useEffect, useMemo } from 'react';

export const NAV: { section: string; items: { to: string; icon: string; label: string; badge?: 'due' }[] }[] = [
  {
    section: '',
    items: [
      { to: '/', icon: '🏠', label: 'Главная' },
      { to: '/course', icon: '🗺️', label: 'Курс' },
      { to: '/review', icon: '🔁', label: 'Повторение', badge: 'due' },
    ],
  },
  {
    section: 'Учить',
    items: [
      { to: '/kana', icon: 'あ', label: 'Кана' },
      { to: '/kanji', icon: '漢', label: 'Кандзи' },
      { to: '/grammar', icon: '📐', label: 'Грамматика' },
      { to: '/dict', icon: '📚', label: 'Словарь' },
      { to: '/read', icon: '📖', label: 'Чтение' },
    ],
  },
  {
    section: 'Практика',
    items: [
      { to: '/speak', icon: '🎙️', label: 'Произношение' },
      { to: '/talk', icon: '💬', label: 'Разговор' },
      { to: '/write', icon: '✍️', label: 'Письмо' },
      { to: '/city', icon: '🏙️', label: 'Виртуальная Япония' },
      { to: '/exam', icon: '🎓', label: 'Экзамены JLPT' },
      { to: '/dialects', icon: '🗾', label: 'Диалекты и сленг' },
    ],
  },
  {
    section: 'Я',
    items: [
      { to: '/tutor', icon: '🧑‍🏫', label: 'ИИ-преподаватель' },
      { to: '/settings', icon: '⚙️', label: 'Настройки' },
      { to: '/about', icon: 'ℹ️', label: 'О платформе' },
    ],
  },
];

const TABS = [
  { to: '/', icon: '🏠', label: 'Главная' },
  { to: '/course', icon: '🗺️', label: 'Курс' },
  { to: '/review', icon: '🔁', label: 'Повтор' },
  { to: '/talk', icon: '💬', label: 'Разговор' },
  { to: '/menu', icon: '☰', label: 'Ещё' },
];

export function useDueCount() {
  const cards = useProgress((s) => s.cards);
  return useMemo(() => dueCards(cards).length, [cards]);
}

export function Layout() {
  const due = useDueCount();
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <div className="app">
      <nav className="sidebar" aria-label="Навигация">
        <NavLink to="/" className="brand">
          <span className="brand-mark">日</span>
          <span>HinoVerse</span>
        </NavLink>
        {NAV.map((sec) => (
          <div key={sec.section}>
            {sec.section && <div className="nav-section">{sec.section}</div>}
            {sec.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="nav-icon ja">{it.icon}</span>
                <span>{it.label}</span>
                {it.badge === 'due' && due > 0 && <span className="nav-badge">{due}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <main className="main">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Нижняя навигация">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">{t.icon}</span>
            <span>
              {t.label}
              {t.to === '/review' && due > 0 ? ` ${due}` : ''}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function MenuPage() {
  const due = useDueCount();
  return (
    <div>
      <div className="page-head">
        <h1>Все разделы</h1>
      </div>
      {NAV.map((sec) => (
        <div key={sec.section} className="section">
          {sec.section && <h3 className="muted">{sec.section}</h3>}
          <div className="grid grid-2">
            {sec.items.map((it) => (
              <NavLink key={it.to} to={it.to} className="card link row" style={{ padding: 14 }}>
                <span className="nav-icon ja" style={{ fontSize: '1.4rem' }}>
                  {it.icon}
                </span>
                <span style={{ fontWeight: 600 }}>{it.label}</span>
                {it.badge === 'due' && due > 0 && <span className="nav-badge">{due}</span>}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
