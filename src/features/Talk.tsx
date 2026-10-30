// Разговоры: ИИ-собеседник в роли продавца, врача, начальника… — голосом и текстом.
// Без ИИ работают ветвящиеся офлайн-сцены.
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SCENES, sceneById } from '../content/scenes';
import type { Scene } from '../content/types';
import { useProgress } from '../store/progress';
import { aiAvailable, streamChat } from '../core/ai/client';
import { parseRoleplayReply, type ChatTurn } from '../core/ai/requests';
import { asrSupported, listen, speak, stopSpeaking, type RecognitionHandle } from '../core/speech';
import { KanaInput } from '../components/KanaInput';
import { TapText } from '../components/TapText';
import { AudioButton } from '../components/AudioButton';
import { ScenePlayer } from './lesson/ScenePlayer';
import { Markdown } from '../components/Markdown';
import { useAsync } from '../hooks';

const START = '（ロールプレイを始めてください。あなたの最初のセリフからどうぞ。）';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  hidden?: boolean;
}

export function AiChat({ scene, level }: { scene: Scene; level: number }) {
  const settings = useProgress((s) => s.settings);
  const recordAnswer = useProgress((s) => s.recordAnswer);
  const addXp = useProgress((s) => s.addXp);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [showRu, setShowRu] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [listening, setListening] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const recRef = useRef<RecognitionHandle | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const persona = { id: scene.id, ...scene.persona };

  const send = async (history: Msg[]) => {
    setErr('');
    setBusy(true);
    setStreaming('');
    stopSpeaking();
    const ac = new AbortController();
    abortRef.current = ac;
    let full = '';
    try {
      full = await streamChat(
        settings,
        { kind: 'roleplay', persona, level, history: history.map((m) => ({ role: m.role, content: m.content }) as ChatTurn) },
        (t) => setStreaming((s) => s + t),
        ac.signal,
      );
      setMsgs([...history, { role: 'assistant', content: full }]);
      setStreaming('');
      const reply = parseRoleplayReply(full);
      if (reply.fix) recordAnswer('speaking', false, { item: history[history.length - 1]?.content ?? '', expected: reply.fix.slice(0, 120), got: history[history.length - 1]?.content ?? '', note: 'ИИ-разговор' });
      else if (history.length > 1) {
        recordAnswer('speaking', true);
        addXp(4);
      }
      if (reply.ja) {
        await speak(reply.ja, { profile: settings.voice, rate: settings.ttsRate, voiceName: settings.voiceName || undefined });
        if (handsFreeRef.current && !ac.signal.aborted) void voice();
      }
    } catch (e) {
      if (!ac.signal.aborted) setErr(e instanceof Error ? e.message : String(e));
      setStreaming('');
      if (full) setMsgs([...history, { role: 'assistant', content: full }]);
    } finally {
      setBusy(false);
    }
  };

  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;

  useEffect(() => {
    // в StrictMode эффект выполняется дважды: первый запрос отменяется в cleanup, второй — основной
    const first: Msg[] = [{ role: 'user', content: START, hidden: true }];
    setMsgs(first);
    void send(first);
    return () => {
      abortRef.current?.abort();
      recRef.current?.abort();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [msgs, streaming]);

  const submit = (content: string) => {
    if (!content.trim()) return;
    // перебиваем: останавливаем голос и текущий ответ
    abortRef.current?.abort();
    stopSpeaking();
    const history = [...msgs, { role: 'user' as const, content: content.trim() }];
    setMsgs(history);
    setText('');
    void send(history);
  };

  const voice = async () => {
    stopSpeaking();
    abortRef.current?.abort();
    setListening(true);
    try {
      const h = listen({ onInterim: setText, onSpeechStart: () => stopSpeaking() });
      recRef.current = h;
      const r = await h.result;
      submit(r.transcript);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (!m.includes('Остановлено')) setErr(m);
    } finally {
      setListening(false);
      recRef.current = null;
    }
  };

  const visible = msgs.filter((m) => !m.hidden);
  const live = streaming ? parseRoleplayReply(streaming) : null;

  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <div className="row">
          <label className="switch small">
            <input type="checkbox" checked={showRu} onChange={(e) => setShowRu(e.target.checked)} /> перевод
          </label>
          {asrSupported() && (
            <label className="switch small" title="После ответа персонажа микрофон включается сам">
              <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} /> разговор без рук
            </label>
          )}
        </div>
        <span className="chip violet">ИИ · {level ? `N${level}` : 'авто'}</span>
      </div>
      <div className="chat card flat" style={{ minHeight: 300 }}>
        {visible.map((m, i) => {
          if (m.role === 'user')
            return (
              <div key={i} className="bubble me">
                <div className="ja-line">{m.content}</div>
              </div>
            );
          const r = parseRoleplayReply(m.content);
          return (
            <div key={i} className="bubble npc">
              <div className="ja-line">
                <TapText text={r.ja} />
              </div>
              {showRu && r.ru && <div className="ru-line">{r.ru}</div>}
              <div className="row" style={{ gap: 4 }}>
                <AudioButton text={r.ja} small />
                {!showRu && r.ru && (
                  <details className="small">
                    <summary style={{ cursor: 'pointer' }}>перевод</summary>
                    {r.ru}
                  </details>
                )}
              </div>
              {r.fix && <div className="fix">✏️ {r.fix}</div>}
            </div>
          );
        })}
        {live && (
          <div className="bubble npc">
            <div className="ja-line typing">{live.ja}</div>
          </div>
        )}
        {busy && !live && <div className="bubble npc typing small muted">печатает</div>}
        <div ref={bottom} />
      </div>
      {err && (
        <div className="feedback bad small">
          {err} <Link to="/settings">Настройки ИИ</Link>
        </div>
      )}
      <div className="card" style={{ marginTop: 10 }}>
        <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <KanaInput value={text} onChange={setText} onEnter={() => submit(text)} placeholder="Ответьте по-японски (можно латиницей) или спросите по-русски" />
          </div>
          <button className="btn primary" onClick={() => submit(text)} disabled={!text.trim()}>
            ➤
          </button>
          {asrSupported() && (
            <button className={`btn ${listening ? 'primary' : ''}`} onClick={listening ? () => recRef.current?.stop() : voice} title="Говорить (перебивает персонажа)">
              {listening ? '■' : '🎙'}
            </button>
          )}
        </div>
        <div className="tiny faint" style={{ marginTop: 6 }}>
          Можно перебивать: нажмите 🎙, пока персонаж говорит. Непонятное слово — нажмите на него. Можно спросить по-русски: «что значит…?».
        </div>
      </div>
    </div>
  );
}

function TeacherChat() {
  const settings = useProgress((s) => s.settings);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ask = async () => {
    if (!text.trim()) return;
    const h = [...history, { role: 'user' as const, content: text.trim() }];
    setHistory(h);
    setText('');
    setBusy(true);
    setErr('');
    try {
      const full = await streamChat(settings, { kind: 'teacher', level: 0, history: h }, (t) => setStreaming((s) => s + t));
      setHistory([...h, { role: 'assistant', content: full }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming('');
      setBusy(false);
    }
  };
  return (
    <div className="card">
      <h3>🧑‍🏫 Вопрос учителю</h3>
      <p className="small muted">Спросите что угодно о японском: грамматика, разница между словами, как сказать фразу, культура.</p>
      <div className="chat">
        {history.map((m, i) => (
          <div key={i} className={`bubble ${m.role === 'user' ? 'me' : 'npc'}`} style={{ maxWidth: '92%' }}>
            {m.role === 'user' ? m.content : <div className="md"><Markdown text={m.content} /></div>}
          </div>
        ))}
        {streaming && (
          <div className="bubble npc md" style={{ maxWidth: '92%' }}>
            <Markdown text={streaming} />
          </div>
        )}
      </div>
      {err && <div className="feedback bad small">{err}</div>}
      <div className="row" style={{ marginTop: 10, flexWrap: 'nowrap' }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} placeholder="Чем отличается 〜たら от 〜ば?" />
        <button className="btn primary" onClick={ask} disabled={busy || !text.trim()}>
          Спросить
        </button>
      </div>
    </div>
  );
}

export function TalkPage() {
  const settings = useProgress((s) => s.settings);
  const { data: ai } = useAsync(() => aiAvailable(settings), [settings.aiMode, settings.apiKey, settings.serverUrl]);
  return (
    <div>
      <div className="page-head">
        <h1>Разговор</h1>
        <p>Поговорите с продавцом, врачом, официантом, полицейским, другом, коллегой, начальником, прохожим, сотрудником аэропорта или гостиницы.</p>
      </div>
      <div className={`callout ${ai ? 'tip' : 'warn'}`}>
        {ai
          ? '🤖 ИИ подключён: персонажи понимают свободную речь, отвечают голосом и исправляют ошибки.'
          : '📴 ИИ не подключён — доступны сценарные диалоги (тоже голосом). Чтобы говорить свободно, добавьте ключ в настройках или запустите сервер с ANTHROPIC_API_KEY.'}
        {!ai && (
          <>
            {' '}
            <Link to="/settings">Настроить →</Link>
          </>
        )}
      </div>
      <div className="grid grid-auto">
        {SCENES.map((s) => (
          <Link key={s.id} to={`/talk/${s.id}${ai ? '?ai=1' : ''}`} className="card link">
            <div className="row between">
              <span style={{ fontSize: '2rem' }}>{s.icon}</span>
              <span className="chip red">N{s.level}</span>
            </div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>{s.title}</div>
            <div className="small muted">{s.persona.goal}</div>
            <div className="tiny faint" style={{ marginTop: 4 }}>
              {s.persona.register === 'keigo' ? 'вежливо-почтительная речь' : s.persona.register === 'casual' ? 'разговорный стиль' : 'вежливый стиль'}
            </div>
          </Link>
        ))}
      </div>
      {ai && (
        <div style={{ marginTop: 18 }}>
          <TeacherChat />
        </div>
      )}
    </div>
  );
}

export function TalkScenePage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const scene = sceneById(id);
  const settings = useProgress((s) => s.settings);
  const [level, setLevel] = useState<number>(scene?.level ?? 5);
  const { data: ai } = useAsync(() => aiAvailable(settings), [settings.aiMode, settings.apiKey]);
  const mode = params.get('ai') === '1' && ai ? 'ai' : 'offline';
  if (!scene) return <div className="empty-state">Сцена не найдена.</div>;
  return (
    <div style={{ maxWidth: 820 }}>
      <Link to="/talk" className="small">
        ← Все персонажи
      </Link>
      <div className="row between" style={{ margin: '10px 0' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>
            {scene.icon} {scene.title}
          </h1>
          <div className="small muted">{scene.persona.setting}</div>
        </div>
        <div className="col" style={{ alignItems: 'flex-end' }}>
          <div className="seg">
            <button className={mode === 'offline' ? 'on' : ''} onClick={() => setParams({})}>
              Сценарий
            </button>
            <button className={mode === 'ai' ? 'on' : ''} disabled={!ai} onClick={() => setParams({ ai: '1' })} title={ai ? '' : 'ИИ не настроен'}>
              Свободно (ИИ)
            </button>
          </div>
          {mode === 'ai' && (
            <select className="input" style={{ width: 'auto', padding: '4px 8px' }} value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((l) => (
                <option key={l} value={l}>
                  Уровень N{l}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {mode === 'ai' ? <AiChat key={`${scene.id}-${level}`} scene={scene} level={level} /> : <ScenePlayer key={scene.id} scene={scene} />}
    </div>
  );
}
