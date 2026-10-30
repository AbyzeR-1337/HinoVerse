import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getKanji, getKanjiCore, kanjiMeaning, type KanjiInfo } from '../core/data';
import { useAsync } from '../hooks';
import { useProgress } from '../store/progress';
import { mastery } from '../core/srs';
import { KanjiPanel } from '../components/Panels';
import { Spinner } from '../components/Modal';
import { KANJI_NOTES } from '../content/kanjiNotes';
import { katakanaToHiragana } from '../core/kana';
import { kanjiItem } from './items';

const LEVELS = [5, 4, 3, 2, 1, 0] as const;

export function KanjiPage() {
  const { data, loading } = useAsync(getKanjiCore, []);
  const [level, setLevel] = useState<number>(5);
  const [q, setQ] = useState('');
  const cards = useProgress((s) => s.cards);
  const navigate = useNavigate();

  const list = useMemo(() => {
    if (!data) return [];
    const query = q.trim().toLowerCase();
    if (query) {
      const hira = katakanaToHiragana(query);
      return data
        .filter(
          (k) =>
            k.c === query ||
            (KANJI_NOTES[k.c]?.m ?? '').toLowerCase().includes(query) ||
            (k.ru ?? []).some((m) => m.toLowerCase().includes(query)) ||
            (k.en ?? []).some((m) => m.toLowerCase().includes(query)) ||
            k.on.some((r) => katakanaToHiragana(r) === hira) ||
            k.kun.some((r) => r.replace(/[.-]/g, '').startsWith(hira)),
        )
        .slice(0, 120);
    }
    return data.filter((k) => (level ? k.j === level : !k.j));
  }, [data, level, q]);

  if (loading || !data) return <Spinner label="Загружаю иероглифы…" />;
  return (
    <div>
      <div className="page-head">
        <h1>Кандзи</h1>
        <p>
          {data.length.toLocaleString('ru-RU')} основных иероглифов с чтениями, составом и примерами; ещё около 10 000 редких — через поиск по иероглифу и словарь.
        </p>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <input
          className="input"
          style={{ maxWidth: 360 }}
          placeholder="Поиск: 山, гора, やま, サン…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && [...q.trim()].length === 1) navigate(`/kanji/${encodeURIComponent(q.trim())}`);
          }}
        />
        {!q && (
          <div className="seg">
            {LEVELS.map((l) => (
              <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
                {l ? `N${l}` : 'вне JLPT'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="small faint" style={{ marginBottom: 8 }}>
        Показано: {list.length}. Полоска под знаком — насколько хорошо вы его знаете.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
        {list.slice(0, 600).map((k) => {
          const m = mastery(cards[`k:${k.c}`]);
          return (
            <Link key={k.c} to={`/kanji/${encodeURIComponent(k.c)}`} className="kana-cell" style={{ aspectRatio: 'auto', padding: '10px 4px', color: 'var(--text)' }}>
              <span className="ja-serif" style={{ fontSize: '2rem', lineHeight: 1.2 }}>
                {k.c}
              </span>
              <span className="tiny faint" style={{ textAlign: 'center', lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
                {(KANJI_NOTES[k.c]?.m ?? kanjiMeaning(k)).split(/[;,]/)[0]}
              </span>
              <span className="mastery-bar">
                <div style={{ width: `${m * 100}%` }} />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function KanjiDetailPage() {
  const { ch = '' } = useParams();
  const c = decodeURIComponent(ch);
  const { data, loading } = useAsync<KanjiInfo | undefined>(() => getKanji(c), [c]);
  const addCards = useProgress((s) => s.addCards);
  const inSrs = useProgress((s) => !!s.cards[`k:${c}`]);
  if (loading) return <Spinner />;
  if (!data)
    return (
      <div className="empty-state">
        Иероглиф «{c}» не найден. <Link to="/kanji">К списку</Link>
      </div>
    );
  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <Link to="/kanji" className="small">
          ← Все кандзи
        </Link>
        <button
          className="btn small"
          disabled={inSrs}
          onClick={() => {
            const it = kanjiItem(data);
            addCards([{ id: it.id, item: { t: 'kanji', f: it.ja, b: it.meaning } }]);
          }}
        >
          {inSrs ? '✓ В повторении' : '＋ В повторение'}
        </button>
      </div>
      <div className="card">
        <KanjiPanel k={data} />
      </div>
    </div>
  );
}
