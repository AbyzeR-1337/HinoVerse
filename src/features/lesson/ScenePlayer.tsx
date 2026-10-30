// Разговорная сцена в офлайн-режиме: персонаж говорит, вы отвечаете выбором, голосом или текстом.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DialogueOption, Scene } from '../../content/types';
import { Furigana, readingOf, stripFurigana } from '../../components/Furigana';
import { AudioButton, useSpeak } from '../../components/AudioButton';
import { asrSupported, listen, stopSpeaking } from '../../core/speech';
import { normalizeJa } from '../../core/kana';
import { similarity } from '../../core/compare';
import { useProgress } from '../../store/progress';
import { KanaInput } from '../../components/KanaInput';

interface Turn {
  who: 'npc' | 'me';
  ja: string;
  ru: string;
  note?: string;
  ok?: boolean;
}

export function matchOption(input: string, options: DialogueOption[]): { opt: DialogueOption; score: number } | null {
  const u = normalizeJa(input);
  let best: { opt: DialogueOption; score: number } | null = null;
  for (const o of options) {
    const variants = [normalizeJa(stripFurigana(o.ja)), normalizeJa(readingOf(o.ja))];
    const s = Math.max(...variants.map((v) => Math.max(similarity(u, v), v.includes(u) && u.length >= 3 ? 0.8 : 0, u.includes(v) ? 0.9 : 0)));
    if (!best || s > best.score) best = { opt: o, score: s };
  }
  return best && best.score >= 0.55 ? best : null;
}

export function ScenePlayer({ scene, onFinish }: { scene: Scene; onFinish?: (score: number) => void }) {
  const [nodeId, setNodeId] = useState<string | null>(scene.nodes[0].id);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [showRu, setShowRu] = useState(false);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState('');
  const [errors, setErrors] = useState(0);
  const say = useSpeak();
  const recordAnswer = useProgress((s) => s.recordAnswer);
  const bottom = useRef<HTMLDivElement>(null);
  const node = scene.nodes.find((n) => n.id === nodeId);

  useEffect(() => {
    if (!node) return;
    setTurns((t) => [...t, { who: 'npc', ja: node.npc, ru: node.npcRu }]);
    void say(node.npc);
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [turns]);

  const choose = (o: DialogueOption) => {
    const ok = o.ok !== false;
    recordAnswer('speaking', ok, ok ? undefined : { item: stripFurigana(node?.npc ?? ''), expected: stripFurigana(node?.options.find((x) => x.ok !== false)?.ja ?? ''), got: stripFurigana(o.ja), note: o.note });
    if (!ok) setErrors((e) => e + 1);
    setTurns((t) => [...t, { who: 'me', ja: o.ja, ru: o.ru, note: o.note, ok }]);
    setHint('');
    setText('');
    if (o.next === null) {
      setNodeId(null);
      onFinish?.(Math.max(0, 1 - errors * 0.2 - (ok ? 0 : 0.2)));
    } else if (o.next === nodeId) {
      // тот же узел — персонаж повторяет вопрос
      setTimeout(() => node && setTurns((t) => [...t, { who: 'npc', ja: node.npc, ru: node.npcRu }]), 300);
    } else setNodeId(o.next);
  };

  const submitText = (input: string) => {
    if (!node || !input.trim()) return;
    const m = matchOption(input, node.options);
    if (m) choose({ ...m.opt, ja: input === stripFurigana(m.opt.ja) ? m.opt.ja : input });
    else setHint('Персонаж вас не понял. Попробуйте одну из подсказок ниже.');
  };

  const voice = async () => {
    setListening(true);
    setHint('');
    try {
      const r = await listen({ onInterim: setText }).result;
      setText(r.transcript);
      submitText(r.transcript);
    } catch (e) {
      setHint(e instanceof Error ? e.message : String(e));
    } finally {
      setListening(false);
    }
  };

  return (
    <div>
      <div className="row between">
        <div className="row">
          <span style={{ fontSize: '2rem' }}>{scene.icon}</span>
          <div>
            <div style={{ fontWeight: 700 }}>{scene.title}</div>
            <div className="small muted">{scene.persona.goal}</div>
          </div>
        </div>
        <label className="switch small">
          <input type="checkbox" checked={showRu} onChange={(e) => setShowRu(e.target.checked)} /> перевод
        </label>
      </div>
      <details style={{ margin: '12px 0' }}>
        <summary className="small" style={{ cursor: 'pointer' }}>
          📋 Полезные фразы
        </summary>
        {scene.phrases.map((p, i) => (
          <div key={i} className="row small" style={{ marginTop: 4 }}>
            <span className="ja" style={{ fontSize: '1.05rem' }}>
              <Furigana text={p.ja} />
            </span>
            <span className="muted">— {p.ru}</span>
            <AudioButton text={p.ja} small />
          </div>
        ))}
      </details>
      <div className="chat card flat" style={{ minHeight: 220 }}>
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.who}`}>
            <div className="ja-line">
              <Furigana text={t.ja} />
            </div>
            {(showRu || t.who === 'me') && <div className="ru-line">{t.ru}</div>}
            {t.who === 'npc' && <AudioButton text={t.ja} small />}
            {t.note && <div className="fix">{t.ok === false ? '⚠️ ' : '💡 '}{t.note}</div>}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {node ? (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="small faint" style={{ marginBottom: 8 }}>
            Ответьте голосом, напишите сами или выберите вариант:
          </div>
          <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <KanaInput value={text} onChange={setText} onEnter={() => submitText(text)} placeholder="Напишите ответ (латиницей или по-японски)" />
            </div>
            <button className="btn" onClick={() => submitText(text)} disabled={!text.trim()}>
              ➤
            </button>
            {asrSupported() && (
              <button className={`btn ${listening ? 'primary' : ''}`} onClick={voice} disabled={listening} title="Ответить голосом">
                🎙
              </button>
            )}
          </div>
          {hint && <div className="small" style={{ color: 'var(--accent)', marginTop: 6 }}>{hint}</div>}
          <div className="options" style={{ marginTop: 10 }}>
            {node.options.map((o, i) => (
              <button key={i} className="option ja-opt" style={{ fontSize: '1.08rem' }} onClick={() => choose(o)}>
                <span className="key">{i + 1}</span>
                <span>
                  <Furigana text={o.ja} />
                  <div className="small muted" style={{ fontFamily: 'var(--font)' }}>{o.ru}</div>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 12, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>🎉</div>
          <strong>Сцена пройдена!</strong>
          <p className="muted small">Хотите свободный разговор с этим персонажем? ИИ ответит на любые ваши фразы.</p>
          <Link className="btn primary" to={`/talk/${scene.id}?ai=1`}>
            💬 Свободный разговор с ИИ
          </Link>
        </div>
      )}
    </div>
  );
}
