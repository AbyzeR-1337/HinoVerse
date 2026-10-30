// Чтение мини-истории: нажмите на слово — перевод; озвучка каждого предложения и всей истории.
import { useRef, useState } from 'react';
import type { Story } from '../../content/types';
import { Furigana, stripFurigana } from '../../components/Furigana';
import { AudioButton, useSpeak } from '../../components/AudioButton';
import { TapText } from '../../components/TapText';
import { stopSpeaking } from '../../core/speech';

export function StoryReader({ story }: { story: Story }) {
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [allRu, setAllRu] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const say = useSpeak();
  const stopRef = useRef(false);

  const playAll = async () => {
    for (let i = 0; i < story.sentences.length; i++) {
      setPlaying(i);
      await say(story.sentences[i].ja);
      if (stopRef.current) break;
    }
    stopRef.current = false;
    setPlaying(null);
  };
  const stop = () => {
    stopRef.current = true;
    stopSpeaking();
    setPlaying(null);
  };

  return (
    <div>
      <div className="row" style={{ gap: 6 }}>
        <span className="chip red">N{story.level}</span>
        <span className="chip">мини-история</span>
      </div>
      <h1 className="ja" style={{ marginTop: 8 }}>
        <Furigana text={story.titleJa} />
      </h1>
      <p className="muted">
        {story.title}. {story.summary}
      </p>
      <div className="row" style={{ marginBottom: 14 }}>
        {playing === null ? (
          <button className="btn" onClick={playAll}>
            ▶ Слушать всю историю
          </button>
        ) : (
          <button className="btn" onClick={stop}>
            ■ Стоп
          </button>
        )}
        <label className="switch small">
          <input type="checkbox" checked={allRu} onChange={(e) => setAllRu(e.target.checked)} /> показать весь перевод
        </label>
        <span className="small faint">Нажмите на любое слово, чтобы увидеть перевод.</span>
      </div>
      <div className="card">
        {story.sentences.map((s, i) => (
          <div key={i} style={{ padding: '6px 0', borderBottom: i < story.sentences.length - 1 ? '1px solid var(--line)' : 'none', background: playing === i ? 'var(--accent-soft)' : undefined, borderRadius: 8 }}>
            <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, fontSize: '1.25rem' }}>
                <TapText text={s.ja} />
              </div>
              <AudioButton text={s.ja} small />
              <button
                className="btn small ghost"
                title="Перевод"
                onClick={() => {
                  const n = new Set(shown);
                  if (n.has(i)) n.delete(i);
                  else n.add(i);
                  setShown(n);
                }}
              >
                RU
              </button>
            </div>
            {(allRu || shown.has(i)) && <div className="muted small">{s.ru}</div>}
          </div>
        ))}
      </div>
      <p className="tiny faint" style={{ marginTop: 8 }}>
        Символов в тексте: {story.sentences.reduce((n, s) => n + stripFurigana(s.ja).length, 0)}
      </p>
    </div>
  );
}

