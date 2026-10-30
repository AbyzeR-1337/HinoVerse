// Пробные экзамены JLPT N5–N1: четыре раздела, таймер, результат по разделам и разбор ошибок.
import { useEffect, useMemo, useState } from 'react';
import { getVocab, getSentences, type JlptLevel, type VocabWord } from '../core/data';
import { ALL_GRAMMAR } from '../content/curriculum';
import { STORIES } from '../content/stories';
import { mulberry32, sample, shuffle, type Rng } from '../core/random';
import { hasKanji } from '../core/kana';
import { useProgress } from '../store/progress';
import { Furigana, stripFurigana } from '../components/Furigana';
import { AudioButton } from '../components/AudioButton';
import { Spinner } from '../components/Modal';
import { cleanMeaning } from './items';

type Section = 'moji' | 'bunpou' | 'dokkai' | 'choukai';
const SECTION_NAMES: Record<Section, string> = {
  moji: '文字・語彙 — иероглифы и лексика',
  bunpou: '文法 — грамматика',
  dokkai: '読解 — чтение',
  choukai: '聴解 — аудирование',
};

interface Q {
  section: Section;
  prompt: string;
  ja?: string;
  context?: string; // текст для чтения
  audio?: string;
  options: string[];
  answer: number;
  jaOptions?: boolean;
}

const MINUTES: Record<number, number> = { 5: 25, 4: 30, 3: 35, 2: 40, 1: 45 };

function choice(correct: string, wrong: string[], rng: Rng) {
  const options = shuffle([correct, ...[...new Set(wrong.filter((w) => w !== correct))].slice(0, 3)], rng);
  return { options, answer: options.indexOf(correct) };
}

async function buildExam(level: JlptLevel, rng: Rng): Promise<Q[]> {
  const vocab = (await getVocab(level)).filter((w) => w.ru.length);
  const qs: Q[] = [];
  const withKanji = vocab.filter((w) => hasKanji(w.w) && !w.m?.includes('uk'));
  // чтение кандзи
  for (const w of sample(withKanji, 4, rng)) {
    const wrong = sample(withKanji.filter((x) => x.r !== w.r && x.r.length >= w.r.length - 1 && x.r.length <= w.r.length + 1), 3, rng).map((x) => x.r);
    qs.push({ section: 'moji', prompt: 'Как читается выделенное слово?', ja: w.w, ...choice(w.r, wrong, rng), jaOptions: true });
  }
  // написание
  for (const w of sample(withKanji, 3, rng)) {
    const wrong = sample(withKanji.filter((x) => x.w !== w.w && x.w.length === w.w.length), 3, rng).map((x) => x.w);
    qs.push({ section: 'moji', prompt: `Как пишется слово «${w.r}»?`, ...choice(w.w, wrong, rng), jaOptions: true });
  }
  // значение
  for (const w of sample(vocab, 4, rng)) {
    const m = (x: VocabWord) => cleanMeaning(x.ru[0]);
    const wrong = sample(vocab.filter((x) => m(x) !== m(w)), 3, rng).map(m);
    qs.push({ section: 'moji', prompt: 'Выберите значение слова', ja: w.m?.includes('uk') ? w.r : w.w, ...choice(m(w), wrong, rng) });
  }
  // грамматика: темы этого уровня и ниже
  const topics = ALL_GRAMMAR.filter((g) => g.level >= level && g.level <= level + 1 && g.questions?.length);
  for (const t of sample(topics, 7, rng)) {
    const q = t.questions![Math.floor(rng() * t.questions!.length)];
    const order = shuffle(q.options.map((_, i) => i), rng);
    qs.push({ section: 'bunpou', prompt: 'Выберите вариант для пропуска', ja: q.q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer), jaOptions: true });
  }
  // чтение: история ближайшего уровня
  const stories = STORIES.filter((s) => s.level === level);
  const story = stories.length ? stories[Math.floor(rng() * stories.length)] : STORIES.reduce((a, b) => (Math.abs(b.level - level) < Math.abs(a.level - level) ? b : a));
  const text = story.sentences.map((s) => s.ja).join('');
  for (const q of story.questions) {
    const order = shuffle(q.options.map((_, i) => i), rng);
    qs.push({ section: 'dokkai', prompt: q.q, context: text, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) });
  }
  const sentences = await getSentences();
  const maxLen = { 5: 12, 4: 18, 3: 26, 2: 36, 1: 50 }[level];
  const pool = sentences.filter((s) => s[0].length <= maxLen && s[0].length >= maxLen / 3);
  for (const s of sample(pool, 2, rng)) {
    qs.push({ section: 'dokkai', prompt: 'Что означает предложение?', ja: s[0], ...choice(s[1], sample(pool, 3, rng).map((x) => x[1]), rng) });
  }
  // аудирование
  for (const s of sample(pool, 4, rng)) {
    qs.push({ section: 'choukai', prompt: 'Прослушайте и выберите перевод', audio: s[0], ...choice(s[1], sample(pool, 3, rng).map((x) => x[1]), rng) });
  }
  for (const w of sample(vocab, 2, rng)) {
    const form = w.m?.includes('uk') ? w.r : w.w;
    qs.push({ section: 'choukai', prompt: 'Какое слово прозвучало?', audio: w.r, ...choice(form, sample(vocab, 3, rng).map((x) => (x.m?.includes('uk') ? x.r : x.w)), rng), jaOptions: true });
  }
  return qs;
}

function ExamRun({ level, onExit }: { level: JlptLevel; onExit: () => void }) {
  const [seed] = useState(() => Date.now());
  const [qs, setQs] = useState<Q[] | null>(null);
  const [err, setErr] = useState('');
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [finished, setFinished] = useState(false);
  const [left, setLeft] = useState(MINUTES[level] * 60);
  const completeLesson = useProgress((s) => s.completeLesson);
  const recordAnswer = useProgress((s) => s.recordAnswer);

  useEffect(() => {
    buildExam(level, mulberry32(seed))
      .then((q) => {
        setQs(q);
        setAnswers(q.map(() => null));
      })
      .catch((e) => setErr(String(e)));
  }, [level, seed]);

  useEffect(() => {
    if (!qs || finished) return;
    const t = setInterval(() => setLeft((l) => (l <= 1 ? 0 : l - 1)), 1000);
    return () => clearInterval(t);
  }, [qs, finished]);

  const finish = () => {
    if (!qs || finished) return;
    setFinished(true);
    const correct = qs.filter((q, k) => answers[k] === q.answer).length;
    completeLesson(`exam:n${level}`, correct / qs.length, 50 + correct * 2);
    qs.forEach((q, k) =>
      recordAnswer(
        q.section === 'moji' ? 'vocab' : q.section === 'bunpou' ? 'grammar' : q.section === 'dokkai' ? 'reading' : 'listening',
        answers[k] === q.answer,
        answers[k] === q.answer ? undefined : { item: stripFurigana(q.ja ?? q.audio ?? q.prompt), expected: stripFurigana(q.options[q.answer]), got: answers[k] !== null ? stripFurigana(q.options[answers[k]!]) : '—', note: `JLPT N${level}` },
      ),
    );
  };

  useEffect(() => {
    if (left === 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  if (err) return <div className="feedback bad">{err}</div>;
  if (!qs) return <Spinner label="Составляю экзамен…" />;

  if (finished) {
    const bySection = (Object.keys(SECTION_NAMES) as Section[]).map((s) => {
      const idx = qs.map((q, k) => [q, k] as const).filter(([q]) => q.section === s);
      const ok = idx.filter(([q, k]) => answers[k] === q.answer).length;
      return { s, ok, total: idx.length };
    });
    const total = bySection.reduce((a, b) => a + b.ok, 0);
    const pct = total / qs.length;
    const passed = pct >= 0.6 && bySection.every((b) => !b.total || b.ok / b.total >= 0.33);
    return (
      <div className="ex-wrap">
        <div className="card center" style={{ padding: 26 }}>
          <div style={{ fontSize: '3rem' }}>{passed ? '🎓' : '📚'}</div>
          <h2>{passed ? `Пробный N${level} сдан!` : `N${level}: пока не сдан`}</h2>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{Math.round(pct * 100)}%</div>
          <p className="muted small">Проходной порог пробного теста: 60% всего и не меньше трети в каждом разделе (как в настоящем JLPT).</p>
          {bySection.map((b) => (
            <div key={b.s} style={{ textAlign: 'left', margin: '8px 0' }}>
              <div className="row between small">
                <span>{SECTION_NAMES[b.s]}</span>
                <span>
                  {b.ok}/{b.total}
                </span>
              </div>
              <div className="progress green">
                <div style={{ width: `${b.total ? (b.ok / b.total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
          <button className="btn primary" style={{ marginTop: 12 }} onClick={onExit}>
            Готово
          </button>
        </div>
        <h3 style={{ marginTop: 18 }}>Разбор ошибок</h3>
        {qs.map((q, k) =>
          answers[k] === q.answer ? null : (
            <div key={k} className="card flat" style={{ marginBottom: 8 }}>
              <div className="small faint">{SECTION_NAMES[q.section]}</div>
              <div>{q.prompt}</div>
              {q.ja && (
                <div className="ja" style={{ fontSize: '1.2rem' }}>
                  <Furigana text={q.ja} />
                </div>
              )}
              {q.audio && <div className="ja">🔊 {q.audio}</div>}
              <div className="small" style={{ color: 'var(--accent)' }}>
                Ваш ответ: {answers[k] !== null ? stripFurigana(q.options[answers[k]!]) : '—'}
              </div>
              <div className="small" style={{ color: 'var(--green)' }}>
                Правильно: <Furigana text={q.options[q.answer]} />
              </div>
            </div>
          ),
        )}
      </div>
    );
  }

  const q = qs[i];
  return (
    <div className="ex-wrap">
      <div className="row between" style={{ marginBottom: 10 }}>
        <span className="chip red">JLPT N{level}</span>
        <span className="chip">{SECTION_NAMES[q.section]}</span>
        <span className={`chip ${left < 60 ? 'red' : ''}`}>
          ⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </span>
      </div>
      <div className="progress" style={{ marginBottom: 14 }}>
        <div style={{ width: `${(i / qs.length) * 100}%` }} />
      </div>
      <div className="card">
        <div className="small faint">
          Вопрос {i + 1} из {qs.length}
        </div>
        {q.context && (
          <div className="example ja" style={{ fontSize: '1.1rem', lineHeight: 2, maxHeight: 260, overflowY: 'auto' }}>
            <Furigana text={q.context} show={level >= 4} />
          </div>
        )}
        <div className="ex-prompt" style={{ marginTop: 8 }}>
          {q.prompt}
        </div>
        {q.ja && (
          <div className="ex-ja">
            <Furigana text={q.ja} show={false} />
          </div>
        )}
        {q.audio && (
          <div className="row" style={{ justifyContent: 'center', marginBottom: 12 }}>
            <AudioButton text={q.audio} autoPlay label="Слушать" />
          </div>
        )}
        <div className="options">
          {q.options.map((o, k) => (
            <button key={k} className={`option ${q.jaOptions ? 'ja-opt' : ''} ${answers[i] === k ? 'right' : ''}`} style={answers[i] === k ? { borderColor: 'var(--indigo)', background: 'var(--indigo-soft)' } : undefined} onClick={() => setAnswers(answers.map((a, j) => (j === i ? k : a)))}>
              <span className="key">{k + 1}</span>
              <Furigana text={o} show={false} />
            </button>
          ))}
        </div>
        <div className="row between" style={{ marginTop: 14 }}>
          <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>
            ←
          </button>
          {i < qs.length - 1 ? (
            <button className="btn primary" onClick={() => setI(i + 1)}>
              Далее →
            </button>
          ) : (
            <button className="btn primary" onClick={finish}>
              Сдать экзамен ✓
            </button>
          )}
        </div>
      </div>
      <div className="row" style={{ gap: 4, marginTop: 10 }}>
        {qs.map((_, k) => (
          <button key={k} className="chip" style={{ border: 'none', cursor: 'pointer', background: k === i ? 'var(--accent)' : answers[k] !== null ? 'var(--indigo-soft)' : undefined, color: k === i ? '#fff' : undefined }} onClick={() => setI(k)}>
            {k + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ExamPage() {
  const [level, setLevel] = useState<JlptLevel | null>(null);
  const lessons = useProgress((s) => s.lessons);
  const cards = useMemo(() => [5, 4, 3, 2, 1] as JlptLevel[], []);
  if (level) return <ExamRun level={level} onExit={() => setLevel(null)} />;
  return (
    <div>
      <div className="page-head">
        <h1>Экзамены JLPT</h1>
        <p>Пробные тесты в формате Японского языкового экзамена: каждый раз новый набор вопросов из словаря, грамматики, текстов и аудио.</p>
      </div>
      <div className="grid grid-auto">
        {cards.map((l) => {
          const best = lessons[`exam:n${l}`];
          return (
            <div key={l} className="card">
              <div className="row between">
                <h2 style={{ margin: 0 }}>N{l}</h2>
                {best && <span className={`chip ${best.score >= 0.6 ? 'green' : 'amber'}`}>лучший: {Math.round(best.score * 100)}%</span>}
              </div>
              <p className="small muted">
                {{ 5: 'Базовый: простые фразы, хирагана, катакана, ~100 кандзи.', 4: 'Бытовой: повседневные темы, ~300 кандзи.', 3: 'Средний: обычные ситуации, ~650 кандзи.', 2: 'Продвинутый: газеты, деловой язык, ~1000 кандзи.', 1: 'Свободный: сложные тексты, нюансы, ~2000 кандзи.' }[l]}
              </p>
              <div className="small faint">~30 вопросов · {MINUTES[l]} минут · 4 раздела</div>
              <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => setLevel(l)}>
                Начать
              </button>
            </div>
          );
        })}
      </div>
      <div className="callout" style={{ marginTop: 16 }}>
        Настоящий JLPT проводится дважды в год (июль и декабрь). Пробный тест показывает готовность: стабильно 70%+ — можно регистрироваться.
      </div>
    </div>
  );
}
