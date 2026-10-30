import type { GrammarTopic } from '../../content/types';
import type { Exercise } from '../../core/exercises';
import { buildExercise } from '../../core/exercises';
import { mulberry32, hashString, shuffle } from '../../core/random';
import { Blocks } from '../../components/Blocks';
import { AudioButton } from '../../components/AudioButton';
import { TapText } from '../../components/TapText';
import { AskTeacher } from '../../components/AskTeacher';

export function GrammarView({ topic }: { topic: GrammarTopic }) {
  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
        <span className="chip red">N{topic.level}</span>
        <span className="chip">грамматика</span>
      </div>
      <h1>{topic.title}</h1>
      <div className="card flat" style={{ margin: '12px 0', background: 'var(--bg-sunk)' }}>
        <div className="small faint">Схема</div>
        <div className="ja" style={{ fontSize: '1.3rem' }}>
          {topic.pattern}
        </div>
        <div className="muted">{topic.meaning}</div>
      </div>
      <Blocks blocks={topic.explanation} />
      {topic.russian && (
        <div className="callout">
          🇷🇺 <strong>Сравнение с русским:</strong> {topic.russian}
        </div>
      )}
      <h3 style={{ marginTop: 22 }}>Примеры</h3>
      {topic.examples.map((ex, i) => (
        <div key={i} className="example">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <div className="ja-line" style={{ flex: 1 }}>
              <TapText text={ex.ja} />
            </div>
            <AudioButton text={ex.ja} small />
            <AudioButton text={ex.ja} profile="fast" label="быстро" small />
          </div>
          <div className="ru-line">{ex.ru}</div>
        </div>
      ))}
      {topic.mistakes && topic.mistakes.length > 0 && (
        <div className="callout warn">
          <strong>Частые ошибки</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: '1.2em' }}>
            {topic.mistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <AskTeacher topic={`${topic.title} (${topic.pattern})`} level={topic.level} />
    </div>
  );
}

/** Упражнения по грамматической теме: вопросы-пропуски, сборка фраз, ошибки. */
export function grammarExercises(topic: GrammarTopic, extraTopics: GrammarTopic[] = []): Exercise[] {
  const rng = mulberry32(hashString(topic.id + Date.now().toString().slice(0, -5)));
  const out: Exercise[] = [];
  for (const q of topic.questions ?? []) {
    const order = shuffle(q.options.map((_, i) => i), rng);
    out.push({
      type: 'choice',
      skill: 'grammar',
      prompt: q.ru ? `Выберите вариант. ${q.ru}` : 'Выберите подходящий вариант',
      ja: q.q,
      audio: undefined,
      options: order.map((i) => q.options[i]),
      optionsJa: /[぀-鿿]/.test(q.options.join('')),
      answer: order.indexOf(q.answer),
      explain: q.explain,
      itemId: `g:${topic.id}`,
    });
  }
  for (const ex of topic.examples) {
    if (ex.tokens) out.push({ ...buildExercise(ex.tokens, ex.ru, rng), itemId: `g:${topic.id}` });
  }
  // повтор одного вопроса из прошлых тем — интервальное закрепление
  const prev = extraTopics.filter((t) => t.questions?.length);
  if (prev.length) {
    const t = prev[Math.floor(rng() * prev.length)];
    const q = t.questions![0];
    out.push({ type: 'choice', skill: 'grammar', prompt: `Повторение: ${t.title}`, ja: q.q, options: q.options, optionsJa: true, answer: q.answer, explain: q.explain, itemId: `g:${t.id}` });
  }
  // произнести пример
  const say = topic.examples[0];
  if (say) out.push({ type: 'speak', skill: 'speaking', prompt: 'Произнесите пример вслух', ja: say.ja, reading: say.ja.replace(/([㐀-鿿々]+)\{([^}]+)\}/g, '$2'), translation: say.ru });
  return out;
}
