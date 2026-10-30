// Письмо: от руки (проверка каждой черты), печать каной, тексты с проверкой ИИ.
import { useEffect, useMemo, useState } from 'react';
import { WRITING_TASKS, type WritingTask } from '../content/writing';
import { useProgress } from '../store/progress';
import { aiAvailable, correctWriting } from '../core/ai/client';
import type { Correction } from '../core/ai/requests';
import { DrawPad } from '../components/Strokes';
import { KanaInput } from '../components/KanaInput';
import { Furigana } from '../components/Furigana';
import { AudioButton } from '../components/AudioButton';
import { getKanjiByLevel, type KanjiInfo } from '../core/data';
import { KANA_GROUPS } from '../content/kana';
import { KANJI_NOTES } from '../content/kanjiNotes';
import { romajiToHiragana, kanaToRomaji } from '../core/kana';
import { checkJapaneseAnswer } from '../core/compare';
import { GRAMMAR_N5 } from '../content/grammar/n5';
import { GRAMMAR_N4 } from '../content/grammar/n4';
import { readingOf, stripFurigana } from '../components/Furigana';
import { useAsync } from '../hooks';
import { pick } from '../core/random';
import { kanjiMeaning } from '../core/data';

// ───────────── посимвольный diff для подсветки правок ─────────────
type DiffPart = { t: 'same' | 'add' | 'del'; s: string };
export function diffText(a: string, b: string): DiffPart[] {
  const x = [...a];
  const y = [...b];
  if (x.length * y.length > 4_000_000) return [{ t: 'del', s: a }, { t: 'add', s: b }];
  const dp = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (t: DiffPart['t'], s: string) => {
    const last = out[out.length - 1];
    if (last && last.t === t) last.s += s;
    else out.push({ t, s });
  };
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      push('same', x[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', x[i++]);
    else push('add', y[j++]);
  }
  while (i < x.length) push('del', x[i++]);
  while (j < y.length) push('add', y[j++]);
  return out;
}

const CATEGORY_RU: Record<string, string> = {
  grammar: 'грамматика', particle: 'частица', vocabulary: 'лексика', kanji: 'кандзи', spelling: 'написание',
  politeness: 'вежливость', style: 'стиль', punctuation: 'пунктуация', format: 'оформление',
};

/** Локальная проверка без ИИ: объём, стиль, остатки латиницы, пункты чек-листа. */
function localCheck(task: WritingTask, text: string): string[] {
  const notes: string[] = [];
  const len = [...text.replace(/\s/g, '')].length;
  if (len < task.minChars) notes.push(`Текст короче рекомендуемого: ${len} из ${task.minChars} знаков.`);
  if (/[a-zA-Z]{3,}/.test(text)) notes.push('В тексте осталась латиница — преобразуйте её в кану (кнопка «латиница → кана»).');
  const polite = (text.match(/(です|ます|ました|ません|でした|ましょう)[。！？\s]?/g) ?? []).length;
  const plain = (text.match(/(だ|である|た|る|ない)[。！？]/g) ?? []).length;
  if (task.register === 'casual' && polite > plain) notes.push('Задание в разговорном стиле, а у вас много です/ます. С другом лучше простая форма.');
  if (task.register !== 'casual' && plain > polite && !task.id.startsWith('essay')) notes.push('Задание требует вежливого стиля, а предложения заканчиваются простой формой.');
  if (task.id === 'essay' && polite > 0 && plain > 0) notes.push('В сочинении смешаны стили です/ます и である — выберите один.');
  if (!/[。！？]/.test(text)) notes.push('Нет японских знаков препинания 。 — ставьте их в конце предложений.');
  if (!notes.length) notes.push('Базовая проверка пройдена. Для подробного разбора ошибок подключите ИИ в настройках.');
  return notes;
}

function TextsTab() {
  const settings = useProgress((s) => s.settings);
  const recordAnswer = useProgress((s) => s.recordAnswer);
  const addXp = useProgress((s) => s.addXp);
  const [taskId, setTaskId] = useState(WRITING_TASKS[0].id);
  const task = WRITING_TASKS.find((t) => t.id === taskId)!;
  const draftKey = `hv-draft-${taskId}`;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Correction | null>(null);
  const [local, setLocal] = useState<string[] | null>(null);
  const [err, setErr] = useState('');
  const { data: ai } = useAsync(() => aiAvailable(settings), [settings.aiMode, settings.apiKey]);

  useEffect(() => {
    try {
      setText(localStorage.getItem(draftKey) ?? '');
    } catch {
      setText('');
    }
    setResult(null);
    setLocal(null);
  }, [draftKey]);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, text);
    } catch {
      /* черновик не сохранится — не критично */
    }
  }, [text, draftKey]);

  const check = async () => {
    setErr('');
    setResult(null);
    setLocal(localCheck(task, text));
    if (!ai) return;
    setBusy(true);
    try {
      const r = await correctWriting(settings, {
        taskTitle: task.title,
        taskDescription: task.description,
        register: task.register,
        level: task.level,
        text,
      });
      setResult(r);
      recordAnswer('writing', r.score >= 70, r.score >= 70 ? undefined : { item: task.title, expected: r.edits[0]?.corrected ?? '', got: r.edits[0]?.original ?? '', note: r.edits[0]?.explanation_ru });
      for (const e of r.edits.slice(0, 5)) recordAnswer('writing', false, { item: `${task.title}: ${e.original}`, expected: e.corrected, got: e.original, note: e.explanation_ru });
      addXp(15 + Math.round(r.score / 10));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="stack">
        <div className="card">
          <select className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            {WRITING_TASKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.title} · N{t.level}
              </option>
            ))}
          </select>
          <p style={{ marginTop: 10 }}>{task.description}</p>
          <div className="row" style={{ gap: 6 }}>
            <span className="chip">{task.register === 'casual' ? 'простой стиль' : task.register === 'polite' ? 'вежливый стиль' : 'официальный стиль'}</span>
            <span className="chip">от {task.minChars} знаков</span>
          </div>
          <h4 style={{ marginTop: 12 }}>Полезные фразы</h4>
          {task.phrases.map((p, i) => (
            <div key={i} className="row small" style={{ marginBottom: 4 }}>
              <span className="ja" style={{ fontSize: '1.05rem' }}>
                <Furigana text={p.ja} />
              </span>
              <span className="muted">— {p.ru}</span>
            </div>
          ))}
          <h4 style={{ marginTop: 12 }}>Чек-лист</h4>
          <ul className="small" style={{ margin: 0, paddingLeft: '1.2em' }}>
            {task.checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="stack">
        <div className="card">
          <textarea className="input ja" value={text} onChange={(e) => setText(e.target.value)} placeholder="Пишите по-японски. Можно латиницей — затем нажмите «латиница → кана»." style={{ minHeight: 240, fontSize: '1.1rem' }} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => setText(text.replace(/[a-zA-Z'-]+/g, (m) => romajiToHiragana(m)))}>
              латиница → кана
            </button>
            {task.template && !text && (
              <button className="btn small" onClick={() => setText(task.template!)}>
                Вставить шаблон
              </button>
            )}
            <span className="spacer" />
            <span className="tiny faint">{[...text.replace(/\s/g, '')].length} знаков</span>
            <button className="btn primary" onClick={check} disabled={busy || !text.trim()}>
              {busy ? 'Проверяю…' : ai ? '✓ Проверить с ИИ' : '✓ Проверить'}
            </button>
          </div>
        </div>
        {err && <div className="feedback bad">{err}</div>}
        {local && !result && (
          <div className="card">
            <h3>Базовая проверка</h3>
            <ul className="small" style={{ margin: 0, paddingLeft: '1.2em' }}>
              {local.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        {result && (
          <div className="card">
            <div className="row between">
              <h3 style={{ margin: 0 }}>Разбор преподавателя</h3>
              <span className={`chip ${result.score >= 80 ? 'green' : result.score >= 50 ? 'amber' : 'red'}`} style={{ fontSize: '1rem' }}>
                {Math.round(result.score)} / 100 · {result.level_estimate}
              </span>
            </div>
            <p style={{ marginTop: 8 }}>{result.summary_ru}</p>
            <div className="small faint">Исправленный текст (зелёным — добавлено, красным — убрано)</div>
            <div className="example ja" style={{ fontSize: '1.1rem', lineHeight: 2, whiteSpace: 'pre-wrap' }}>
              {diffText(text, result.corrected).map((p, i) => (
                <span key={i} style={p.t === 'add' ? { background: 'var(--green-soft)', color: 'var(--green)' } : p.t === 'del' ? { background: 'var(--accent-soft)', color: 'var(--accent)', textDecoration: 'line-through' } : undefined}>
                  {p.s}
                </span>
              ))}
            </div>
            <h4>Правки ({result.edits.length})</h4>
            {result.edits.map((e, i) => (
              <div key={i} className="example">
                <div className="row">
                  <span className="chip">{CATEGORY_RU[e.category] ?? e.category}</span>
                  <span className="ja" style={{ textDecoration: 'line-through', color: 'var(--accent)' }}>
                    {e.original}
                  </span>
                  →
                  <span className="ja" style={{ color: 'var(--green)', fontWeight: 600 }}>
                    {e.corrected}
                  </span>
                </div>
                <div className="small" style={{ marginTop: 4 }}>
                  {e.explanation_ru}
                </div>
              </div>
            ))}
            <h4>Как написал бы носитель</h4>
            <div className="example ja" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9 }}>
              {result.natural}
              <div>
                <AudioButton text={result.natural} small />
              </div>
            </div>
            {result.tips_ru.length > 0 && (
              <div className="callout tip">
                <strong>Советы</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: '1.2em' }}>
                  {result.tips_ru.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HandTab() {
  const [set, setSet] = useState<'hiragana' | 'katakana' | 'n5' | 'n4'>('hiragana');
  const [recall, setRecall] = useState(false);
  const [i, setI] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const recordAnswer = useProgress((s) => s.recordAnswer);
  const addXp = useProgress((s) => s.addXp);
  const { data: kanji } = useAsync<KanjiInfo[]>(() => (set === 'n5' || set === 'n4' ? getKanjiByLevel(set === 'n5' ? 5 : 4) : Promise.resolve([])), [set]);
  const chars = useMemo(() => {
    if (set === 'hiragana' || set === 'katakana') return KANA_GROUPS.filter((g) => g.script === set && !g.id.endsWith('yoon')).flatMap((g) => g.chars);
    return (kanji ?? []).map((k) => k.c);
  }, [set, kanji]);
  const ch = chars[i % Math.max(1, chars.length)];
  const k = kanji?.find((x) => x.c === ch);
  const prompt = set === 'hiragana' || set === 'katakana' ? kanaToRomaji(ch ?? '') : k ? KANJI_NOTES[k.c]?.m ?? kanjiMeaning(k) : '';
  if (!ch) return null;
  return (
    <div className="card">
      <div className="row between">
        <div className="seg">
          {(['hiragana', 'katakana', 'n5', 'n4'] as const).map((s) => (
            <button key={s} className={set === s ? 'on' : ''} onClick={() => { setSet(s); setI(0); setScore(null); }}>
              {s === 'hiragana' ? 'хирагана' : s === 'katakana' ? 'катакана' : `кандзи ${s.toUpperCase()}`}
            </button>
          ))}
        </div>
        <label className="switch small">
          <input type="checkbox" checked={recall} onChange={(e) => setRecall(e.target.checked)} /> по памяти (без образца)
        </label>
      </div>
      <div className="center" style={{ margin: '14px 0' }}>
        <div className="small faint">Напишите</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{recall ? prompt : <span className="ja">{ch}</span>}</div>
        {!recall && <div className="muted">{prompt}</div>}
      </div>
      <DrawPad
        key={`${ch}-${recall}`}
        ch={ch}
        guide={!recall}
        onDone={(r) => {
          setScore(r.score);
          recordAnswer('writing', r.score >= 0.5, r.score >= 0.5 ? undefined : { item: ch, expected: ch, got: '', note: r.mistakes[0]?.message });
          addXp(r.score >= 0.5 ? 4 : 1);
        }}
      />
      {score !== null && <div className="center small" style={{ marginTop: 6 }}>Оценка: {Math.round(score * 100)}%</div>}
      <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
        <button className="btn" onClick={() => { setI(Math.floor(Math.random() * chars.length)); setScore(null); }}>
          🎲 Случайный
        </button>
        <button className="btn primary" onClick={() => { setI(i + 1); setScore(null); }}>
          Следующий →
        </button>
      </div>
    </div>
  );
}

function TypingTab() {
  const pool = useMemo(() => [...GRAMMAR_N5, ...GRAMMAR_N4].flatMap((g) => g.examples), []);
  const [ex, setEx] = useState(() => pick(pool));
  const [val, setVal] = useState('');
  const [res, setRes] = useState<{ ok: boolean; score: number } | null>(null);
  const recordAnswer = useProgress((s) => s.recordAnswer);
  const target = readingOf(ex.ja);
  const check = () => {
    const r = checkJapaneseAnswer(val, [target, stripFurigana(ex.ja)]);
    setRes({ ok: r.correct, score: r.score });
    recordAnswer('writing', r.correct, r.correct ? undefined : { item: ex.ru, expected: stripFurigana(ex.ja), got: val, note: 'печать' });
  };
  return (
    <div className="card">
      <h3>⌨️ Печать по-японски</h3>
      <p className="small muted">Переведите фразу и напечатайте её каной. Латиница превращается в кану автоматически: watashi → わたし. На телефоне можно включить японскую клавиатуру.</p>
      <div style={{ fontSize: '1.2rem', fontWeight: 600, margin: '10px 0' }}>{ex.ru}</div>
      <KanaInput value={val} onChange={setVal} onEnter={check} autoFocus />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={check} disabled={!val}>
          Проверить
        </button>
        <button className="btn" onClick={() => { setEx(pick(pool)); setVal(''); setRes(null); }}>
          Другая фраза
        </button>
      </div>
      {res && (
        <div className={`feedback ${res.ok ? 'good' : 'bad'}`}>
          <span>{res.ok ? '✓' : '✗'}</span>
          <div className="fb-body">
            {res.ok ? 'Верно!' : `Совпадение ${Math.round(res.score * 100)}%. Эталон:`}
            <div className="ja" style={{ fontSize: '1.2rem' }}>
              <Furigana text={ex.ja} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function WritePage() {
  const [tab, setTab] = useState<'texts' | 'hand' | 'typing'>('texts');
  return (
    <div>
      <div className="page-head">
        <h1>Письмо</h1>
        <p>От руки и на клавиатуре: сообщения, письма, официальные документы, резюме, объявления, дневник, сочинения — с разбором каждой правки.</p>
      </div>
      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={tab === 'texts' ? 'on' : ''} onClick={() => setTab('texts')}>
          📝 Тексты
        </button>
        <button className={tab === 'hand' ? 'on' : ''} onClick={() => setTab('hand')}>
          ✍️ От руки
        </button>
        <button className={tab === 'typing' ? 'on' : ''} onClick={() => setTab('typing')}>
          ⌨️ Печать
        </button>
      </div>
      {tab === 'texts' && <TextsTab />}
      {tab === 'hand' && <HandTab />}
      {tab === 'typing' && <TypingTab />}
    </div>
  );
}
