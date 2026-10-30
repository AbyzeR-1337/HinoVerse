// «Спросить ИИ-преподавателя» — вопрос по теме урока, ответ на русском с примерами.
import { useState } from 'react';
import { useProgress } from '../store/progress';
import { aiAvailable, streamChat } from '../core/ai/client';
import { Markdown } from './Markdown';

export function AskTeacher({ topic, level }: { topic: string; level: number }) {
  const settings = useProgress((s) => s.settings);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const ask = async () => {
    if (!q.trim()) return;
    setErr('');
    setAnswer('');
    setBusy(true);
    try {
      if (!(await aiAvailable(settings))) throw new Error('ИИ недоступен: укажите ключ в настройках или запустите сервер с ANTHROPIC_API_KEY.');
      await streamChat(settings, { kind: 'teacher', level, topic, history: [{ role: 'user', content: q }] }, (t) => setAnswer((a) => a + t));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <button className="btn" style={{ marginTop: 16 }} onClick={() => setOpen(true)}>
        🧑‍🏫 Спросить ИИ-преподавателя
      </button>
    );
  return (
    <div className="card flat" style={{ marginTop: 16 }}>
      <div className="row between">
        <strong>🧑‍🏫 Вопрос преподавателю</strong>
        <button className="btn small ghost" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      <textarea className="input" style={{ minHeight: 80, marginTop: 8 }} placeholder="Например: чем は отличается от が в этом примере?" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" onClick={ask} disabled={busy || !q.trim()}>
          {busy ? 'Думаю…' : 'Спросить'}
        </button>
      </div>
      {err && <div className="feedback bad small">{err}</div>}
      {answer && (
        <div className="md" style={{ marginTop: 12 }}>
          <Markdown text={answer} />
        </div>
      )}
    </div>
  );
}
