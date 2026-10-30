import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { dictionary, primaryForm, type DictEntry } from '../core/data';
import { WordCard, posLabel } from '../components/WordCard';
import { Spinner } from '../components/Modal';
import { TapText } from '../components/TapText';
import { hasJapanese } from '../core/kana';

export function DictionaryPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [results, setResults] = useState<DictEntry[]>([]);
  const [selected, setSelected] = useState<DictEntry | null>(null);
  const [progress, setProgress] = useState(dictionary.loadedShards);
  const [ready, setReady] = useState(dictionary.loadedShards > 0);
  const [text, setText] = useState('');

  useEffect(() => {
    const off = dictionary.onProgress(() => {
      setProgress(dictionary.loadedShards);
      setReady(true);
    });
    void dictionary.load();
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    const query = params.get('q') ?? '';
    setQ(query);
  }, [params]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      const r = dictionary.search(q, 60);
      setResults(r);
      setSelected(r[0] ?? null);
    }, 150);
    return () => clearTimeout(t);
  }, [q, ready, progress]);

  return (
    <div>
      <div className="page-head">
        <h1>Словарь</h1>
        <p>Японско-русский словарь: ищите по-японски, латиницей (taberu) или по-русски. Глаголы находятся в любой форме: 食べなかった → 食べる.</p>
      </div>
      <input
        className="input ja-input"
        placeholder="猫, neko, кошка, 食べました…"
        value={q}
        autoFocus
        onChange={(e) => {
          setQ(e.target.value);
          setParams(e.target.value ? { q: e.target.value } : {}, { replace: true });
        }}
      />
      {progress < dictionary.totalShards && (
        <div className="small faint" style={{ marginTop: 6 }}>
          Загрузка словаря: {progress}/{dictionary.totalShards}… поиск уже работает по самым частотным словам.
        </div>
      )}
      {!ready ? (
        <Spinner label="Загружаю словарь…" />
      ) : q.trim() ? (
        <div className="grid grid-2" style={{ marginTop: 16, alignItems: 'start' }}>
          <div className="card" style={{ padding: 6, maxHeight: '70vh', overflowY: 'auto' }}>
            {results.length === 0 && <div className="empty-state">Ничего не найдено.</div>}
            {results.map((e) => (
              <button
                key={e.id}
                className="lesson-row"
                style={{ width: '100%', border: 'none', background: selected?.id === e.id ? 'var(--accent-soft)' : 'transparent', textAlign: 'left' }}
                onClick={() => setSelected(e)}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="ja" style={{ fontSize: '1.2rem' }}>
                    {primaryForm(e)}
                  </span>
                  {primaryForm(e) !== e.readings[0] && (
                    <span className="ja muted" style={{ marginLeft: 8 }}>
                      {e.readings[0]}
                    </span>
                  )}
                  <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.glosses.slice(0, 2).join('; ')}
                  </div>
                </span>
                {e.jlpt > 0 && <span className="chip red">N{e.jlpt}</span>}
                <span className="tiny faint">{posLabel(e.pos)[0] ?? ''}</span>
              </button>
            ))}
          </div>
          <div className="card" style={{ position: 'sticky', top: 16 }}>{selected ? <WordCard entry={selected} /> : <div className="muted">Выберите слово</div>}</div>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>🔍 Разбор текста</h3>
          <p className="small muted">Вставьте любой японский текст — с сайта, из манги, из сообщения. Нажмите на слово, чтобы увидеть перевод и словарную форму.</p>
          <textarea className="input ja" placeholder="例：昨日、友達と新しいラーメン屋に行きました。" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 100 }} />
          {hasJapanese(text) && (
            <div className="card flat" style={{ marginTop: 10, fontSize: '1.3rem' }}>
              <TapText text={text} />
            </div>
          )}
          <hr className="sep" />
          <div className="small muted">
            Данные: JMdict/EDRDG (русские переводы на основе словаря Warodai), Tatoeba, kanjium. Подробнее — в разделе «О платформе».
          </div>
        </div>
      )}
    </div>
  );
}
