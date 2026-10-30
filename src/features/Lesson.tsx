// Урок курса: объяснение / знакомство с новым материалом → упражнения → результат и план повторения.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAsync, useCourse, lessonPath } from '../hooks';
import type { LessonRef } from '../content/curriculum';
import { grammarById, ALL_GRAMMAR } from '../content/curriculum';
import { INTRO } from '../content/intro';
import { KANA_GROUPS } from '../content/kana';
import { THEMES } from '../content/themes';
import { STORIES } from '../content/stories';
import { sceneById } from '../content/scenes';
import { getKanjiByLevel, type JlptLevel, type KanjiInfo } from '../core/data';
import { type Exercise, type LearnItem, vocabExercises, kanaExercises, kanjiExercises, cardItemOf } from '../core/exercises';
import { mulberry32, hashString, sample, shuffle } from '../core/random';
import { useProgress } from '../store/progress';
import { Blocks } from '../components/Blocks';
import { ExerciseRunner, type RunResult } from '../components/ExerciseRunner';
import { KanaPanel, KanjiPanel, WordPanel } from '../components/Panels';
import { Spinner } from '../components/Modal';
import { ResultView } from './lesson/ResultView';
import { GrammarView, grammarExercises } from './lesson/GrammarView';
import { StoryReader } from './lesson/StoryReader';
import { ScenePlayer } from './lesson/ScenePlayer';
import { kanaItem, themeItem, vocabSlice, kanjiSlice, vocabItem } from './items';
import { getVocab } from '../core/data';

interface Prepared {
  items: LearnItem[];
  exercises: Exercise[];
  kanji?: KanjiInfo[];
}

async function prepare(lesson: LessonRef, stagesLessons: LessonRef[]): Promise<Prepared> {
  const rng = mulberry32(hashString(lesson.id) ^ Date.now());
  switch (lesson.kind) {
    case 'kana': {
      const group = KANA_GROUPS.find((g) => g.id === lesson.ref)!;
      const items = group.chars.map(kanaItem);
      const sameScript = KANA_GROUPS.filter((g) => g.script === group.script).flatMap((g) => g.chars).map(kanaItem);
      return { items, exercises: kanaExercises(items, sameScript, rng) };
    }
    case 'vocab': {
      const level = Number(lesson.ref.slice(1)) as JlptLevel;
      const { items, pool } = await vocabSlice(level, lesson.slice!);
      return { items, exercises: vocabExercises(items, pool, rng) };
    }
    case 'theme': {
      const theme = THEMES.find((t) => t.id === lesson.ref)!;
      const all = theme.words.map(themeItem);
      const items = all.slice(0, 12);
      const pool = THEMES.flatMap((t) => t.words.map(themeItem));
      return { items: all, exercises: vocabExercises(sample(items, Math.min(8, items.length), rng), pool, rng) };
    }
    case 'kanji': {
      const level = Number(lesson.ref.slice(1)) as JlptLevel;
      const { items, pool } = await kanjiSlice(level, lesson.slice!);
      const infos = (await getKanjiByLevel(level)).slice(lesson.slice![0], lesson.slice![1]);
      return { items, exercises: kanjiExercises(items, pool, rng), kanji: infos };
    }
    case 'grammar': {
      const topic = grammarById(lesson.ref)!;
      const idx = ALL_GRAMMAR.indexOf(topic);
      return { items: [], exercises: grammarExercises(topic, ALL_GRAMMAR.slice(Math.max(0, idx - 6), idx)) };
    }
    case 'story': {
      const story = STORIES.find((s) => s.id === lesson.ref)!;
      const exercises: Exercise[] = story.questions.map((q) => {
        const order = shuffle(q.options.map((_, i) => i), rng);
        return { type: 'choice', skill: 'reading', prompt: q.q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
      });
      const s = story.sentences[Math.floor(rng() * story.sentences.length)];
      exercises.push({ type: 'choice', skill: 'listening', prompt: 'Прослушайте предложение из истории. Что оно значит?', audio: s.ja, hideText: true, ja: s.ja, options: shuffle([s.ru, ...sample(story.sentences.filter((x) => x !== s).map((x) => x.ru), 3, rng)], rng), answer: -1 });
      const last = exercises[exercises.length - 1] as Extract<Exercise, { type: 'choice' }>;
      last.answer = last.options.indexOf(s.ru);
      return { items: [], exercises };
    }
    case 'exam': {
      // проверка главы: материал всех уроков главы
      const chapterLessons = stagesLessons.filter((l) => l.chapterId === lesson.ref && l.kind !== 'exam');
      const parts = await Promise.all(chapterLessons.map((l) => prepare(l, stagesLessons).catch(() => null)));
      let pool: Exercise[] = parts.flatMap((p) => p?.exercises ?? []).filter((e) => e.type !== 'speak' && e.type !== 'draw');
      if (lesson.ref === 'ch-hiragana' || lesson.ref === 'ch-katakana') {
        const script = lesson.ref === 'ch-hiragana' ? 'hiragana' : 'katakana';
        const all = KANA_GROUPS.filter((g) => g.script === script && !g.id.endsWith('yoon')).flatMap((g) => g.chars).map(kanaItem);
        pool = kanaExercises(sample(all, 14, rng), all, rng).filter((e) => e.type === 'choice' || e.type === 'input');
      }
      return { items: [], exercises: sample(pool, Math.min(15, pool.length), rng) };
    }
    default:
      return { items: [], exercises: [] };
  }
}

function LearnPhase({ lesson, prepared, onDone }: { lesson: LessonRef; prepared: Prepared; onDone: () => void }) {
  const [i, setI] = useState(0);
  const items = prepared.items;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') setI((x) => Math.min(items.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items.length]);
  const it = items[i];
  if (!it) return null;
  return (
    <div className="ex-wrap" style={{ maxWidth: 900 }}>
      <div className="row" style={{ marginBottom: 14, flexWrap: 'nowrap' }}>
        <div className="progress" style={{ flex: 1 }}>
          <div style={{ width: `${((i + 1) / items.length) * 100}%` }} />
        </div>
        <span className="small faint nowrap">
          новое {i + 1} / {items.length}
        </span>
      </div>
      <div className="card">
        {it.kind === 'kana' && <KanaPanel ch={it.ja} />}
        {it.kind === 'kanji' && prepared.kanji && <KanjiPanel k={prepared.kanji[i]} />}
        {it.kind === 'word' && <WordPanel item={it} />}
      </div>
      <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
        <button className="btn" onClick={() => setI(i - 1)} disabled={i === 0}>
          ← Назад
        </button>
        {i < items.length - 1 ? (
          <button className="btn primary" onClick={() => setI(i + 1)}>
            Дальше →
          </button>
        ) : (
          <button className="btn primary big" onClick={onDone}>
            {lesson.kind === 'theme' ? 'К упражнениям' : 'Закрепить в упражнениях'} ✓
          </button>
        )}
      </div>
    </div>
  );
}

export function LessonPage() {
  const { id = '' } = useParams();
  const { lessons } = useCourse();
  const lesson = lessons.find((l) => l.id === decodeURIComponent(id));
  const [phase, setPhase] = useState<'intro' | 'practice' | 'result'>('intro');
  const [result, setResult] = useState<RunResult | null>(null);
  const [runKey, setRunKey] = useState(0);
  const completeLesson = useProgress((s) => s.completeLesson);
  const addCards = useProgress((s) => s.addCards);
  const gradeCard = useProgress((s) => s.gradeCard);
  const cards = useProgress((s) => s.cards);

  const { data: prepared, error, loading } = useAsync(
    () => (lesson ? prepare(lesson, lessons) : Promise.resolve(null)),
    [lesson?.id, runKey, lessons.length],
  );

  useEffect(() => {
    setPhase('intro');
    setResult(null);
  }, [id]);

  const nextLesson = useMemo(() => {
    if (!lesson) return undefined;
    const idx = lessons.findIndex((l) => l.id === lesson.id);
    return lessons[idx + 1];
  }, [lesson, lessons]);

  if (!lesson) {
    return lessons.length ? (
      <div className="empty-state">
        Урок не найден. <Link to="/course">К курсу</Link>
      </div>
    ) : (
      <Spinner />
    );
  }

  const finish = (r: RunResult) => {
    const score = r.total ? r.correct / r.total : 1;
    // новые элементы попадают в интервальное повторение с оценкой по результату урока
    if (prepared?.items.length) {
      addCards(prepared.items.map((it) => ({ id: it.id, item: cardItemOf(it) })));
      for (const it of prepared.items) {
        const ok = r.perItem[it.id];
        const isNew = !cards[it.id] || cards[it.id].state === 'new';
        if (ok === undefined) {
          if (isNew) gradeCard(it.id, 3);
        } else gradeCard(it.id, ok ? 3 : 1);
      }
    } else {
      for (const [itemId, ok] of Object.entries(r.perItem)) {
        if (itemId.startsWith('g:')) {
          const topic = grammarById(itemId.slice(2));
          if (topic) addCards([{ id: itemId, item: { t: 'grammar', f: topic.pattern, b: `${topic.title}: ${topic.meaning}` } }]);
        }
        gradeCard(itemId, ok ? 3 : 1);
      }
    }
    completeLesson(lesson.id, score, r.xp + 20);
    setResult(r);
    setPhase('result');
  };

  const finishSimple = (score = 1, xp = 20) => {
    completeLesson(lesson.id, score, xp);
    setResult({ correct: 1, total: 1, perItem: {}, xp });
    setPhase('result');
  };

  const header = (
    <div className="row small muted" style={{ marginBottom: 10 }}>
      <Link to="/course">← Курс</Link>
      <span>·</span>
      <span>{lesson.title}</span>
    </div>
  );

  if (phase === 'result' && result) {
    return (
      <div>
        {header}
        <ResultView
          score={result.total ? result.correct / result.total : 1}
          correct={result.correct}
          total={result.total}
          xp={result.xp + 20}
          nextHref={nextLesson ? lessonPath(nextLesson) : undefined}
          onRetry={() => {
            setRunKey((k) => k + 1);
            setPhase(lesson.kind === 'exam' ? 'practice' : 'intro');
          }}
        />
      </div>
    );
  }

  if (loading || !prepared) return <Spinner label="Готовлю урок…" />;
  if (error) return <div className="feedback bad">Не удалось загрузить урок: {error}</div>;

  if (phase === 'practice' || lesson.kind === 'exam') {
    if (!prepared.exercises.length) return <div className="empty-state">Для этой проверки пока нет заданий.</div>;
    return <ExerciseRunner key={runKey} exercises={prepared.exercises} onFinish={finish} header={header} />;
  }

  // фаза знакомства
  switch (lesson.kind) {
    case 'article': {
      const art = INTRO.find((a) => a.id === lesson.ref)!;
      return (
        <div style={{ maxWidth: 780 }}>
          {header}
          <h1>{art.title}</h1>
          {art.subtitle && <p className="muted">{art.subtitle}</p>}
          <Blocks blocks={art.blocks} />
          <button className="btn primary big" style={{ marginTop: 18 }} onClick={() => finishSimple(1, 20)}>
            Урок прочитан ✓
          </button>
        </div>
      );
    }
    case 'grammar': {
      const topic = grammarById(lesson.ref)!;
      return (
        <div style={{ maxWidth: 820 }}>
          {header}
          <GrammarView topic={topic} />
          <button className="btn primary big" style={{ marginTop: 18 }} onClick={() => setPhase('practice')}>
            К упражнениям →
          </button>
        </div>
      );
    }
    case 'story': {
      const story = STORIES.find((s) => s.id === lesson.ref)!;
      return (
        <div style={{ maxWidth: 820 }}>
          {header}
          <StoryReader story={story} />
          <button className="btn primary big" style={{ marginTop: 18 }} onClick={() => setPhase('practice')}>
            Ответить на вопросы →
          </button>
        </div>
      );
    }
    case 'scene': {
      const scene = sceneById(lesson.ref)!;
      return (
        <div style={{ maxWidth: 820 }}>
          {header}
          <ScenePlayer scene={scene} onFinish={(score) => setTimeout(() => finishSimple(score, 25), 1800)} />
        </div>
      );
    }
    default:
      return (
        <div>
          {header}
          <LearnPhase lesson={lesson} prepared={prepared} onDone={() => setPhase('practice')} />
        </div>
      );
  }
}

/** Запуск урока по случайным словам уровня (для «быстрой тренировки»). */
export async function quickVocabExercises(level: JlptLevel, count = 8): Promise<Exercise[]> {
  const list = await getVocab(level);
  const pool = list.map(vocabItem);
  const rng = mulberry32(Date.now());
  return vocabExercises(sample(pool.slice(0, 300), count, rng), pool, rng);
}
