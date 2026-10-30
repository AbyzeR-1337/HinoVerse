import { useManifest, useCourse } from '../hooks';
import { courseStats } from '../content/curriculum';
import { ALL_GRAMMAR } from '../content/curriculum';
import { STORIES } from '../content/stories';
import { SCENES } from '../content/scenes';
import { THEMES } from '../content/themes';
import { QTE_EVENTS } from '../content/qte';

export function AboutPage() {
  const m = useManifest();
  const { stages } = useCourse();
  const st = courseStats(stages);
  const fmt = (n?: number) => (n ?? 0).toLocaleString('ru-RU');
  const vocabTotal = m ? Object.values(m.vocab).reduce((a, b) => a + b, 0) : 0;
  return (
    <div style={{ maxWidth: 820 }}>
      <div className="page-head">
        <h1>О платформе HinoVerse</h1>
        <p>«Не просто учить язык. Начать думать на японском.»</p>
      </div>
      <div className="card">
        <h3>Что внутри (реальные цифры)</h3>
        <div className="grid grid-3">
          {[
            [st.chapters, 'глав курса'],
            [st.lessons, 'уроков'],
            [ALL_GRAMMAR.length, 'грамматических тем'],
            [m?.dictRussian ?? m?.dictEntries, 'словарных статей с русским переводом'],
            [m ? m.dictEntries - (m.dictRussian ?? m.dictEntries) : 0, 'частотных слов с английским переводом'],
            [vocabTotal, 'слов JLPT N5–N1 с ударением и примерами'],
            [m?.kanjiTotal, 'иероглифов (из них ' + fmt(m?.kanjiCore) + ' основных)'],
            [m?.strokeChars, 'символов с порядком черт'],
            [m?.sentences, 'предложений японский↔русский'],
            [SCENES.length + QTE_EVENTS.length, 'разговорных сцен и быстрых событий'],
            [STORIES.length, 'мини-историй'],
            [THEMES.length, 'тематических словарей'],
          ].map(([n, l]) => (
            <div key={l as string} className="stat">
              <span className="v" style={{ fontSize: '1.4rem' }}>{fmt(n as number)}</span>
              <span className="l">{l}</span>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Упражнения генерируются из материала каждого урока, поэтому их количество не ограничено. Курс расширяется добавлением данных и тем — см. README.
        </p>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Открытые данные и лицензии</h3>
        <ul className="small">
          <li><strong>JMdict</strong> и <strong>KANJIDIC2</strong>, <strong>KRADFILE</strong> — © Electronic Dictionary Research and Development Group (EDRDG), лицензия CC BY-SA 4.0. Русские переводы JMdict основаны на словаре Warodai.</li>
          <li><strong>KanjiVG</strong> — © Ulrich Apel, лицензия CC BY-SA 3.0 (порядок черт).</li>
          <li><strong>Tatoeba</strong> — примеры предложений, лицензия CC BY 2.0 FR.</li>
          <li><strong>kanjium</strong> (mifunetoshiro) — данные тонального ударения, CC BY-SA 4.0.</li>
          <li><strong>kanji-data</strong> (David Gouveia) — уровни JLPT для кандзи, MIT.</li>
          <li><strong>open-anki-jlpt-decks</strong> (Jamie Sinclair) — списки слов JLPT, MIT (на основе списков Jonathan Waller).</li>
          <li>Учебные тексты, мнемоники, грамматика, сцены и истории — авторские материалы HinoVerse.</li>
        </ul>
        <p className="small muted">Производные данные в public/data распространяются на условиях лицензий источников (CC BY-SA). Подробности — DATA_LICENSES.md в репозитории.</p>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Честно о технологиях</h3>
        <ul className="small">
          <li>Озвучка использует синтезаторы речи вашей системы: мужские, женские, детский, «пожилой», быстрые и медленные голоса — это разные голоса ОС и настройки высоты/темпа, а не записи дикторов.</li>
          <li>Распознавание речи — встроенное в браузер (Chrome, Edge, Safari). Анализ высоты тона, ритма и длительности выполняется прямо на устройстве.</li>
          <li>Свободные разговоры, проверка текстов и разбор ИИ-преподавателя работают через Claude (Anthropic) — нужен ключ API на сервере или в настройках.</li>
          <li>Прогресс хранится на устройстве; синхронизация — через ваш сервер HinoVerse по коду, без регистрации и личных данных.</li>
        </ul>
      </div>
    </div>
  );
}
