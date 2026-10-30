// Тренажёр произношения: слова с тональным рисунком, минимальные пары, шэдоуинг и упражнения на ваши ошибки.
import { useMemo, useState } from 'react';
import { useProgress } from '../store/progress';
import { getVocab } from '../core/data';
import { useAsync } from '../hooks';
import { SpeakCheck } from '../components/SpeakCheck';
import { AudioButton } from '../components/AudioButton';
import { PitchPattern } from '../components/PitchGraph';
import { VOICE_PROFILES, asrSupported } from '../core/speech';
import { transcribe } from '../core/kana';
import { STORIES } from '../content/stories';
import { Furigana, readingOf, stripFurigana } from '../components/Furigana';

interface Target {
  w: string;
  r: string;
  ru: string;
  a?: string;
}

const DRILLS: { id: string; title: string; why: string; match: RegExp; items: Target[] }[] = [
  {
    id: 'long', title: 'Долгие гласные', why: 'Долгота меняет смысл слова: おばさん «тётя» и おばあさん «бабушка».', match: /долг|коротк|тяните/i,
    items: [
      { w: 'おばさん', r: 'おばさん', ru: 'тётя', a: '0' }, { w: 'おばあさん', r: 'おばあさん', ru: 'бабушка', a: '2' },
      { w: 'おじさん', r: 'おじさん', ru: 'дядя', a: '0' }, { w: 'おじいさん', r: 'おじいさん', ru: 'дедушка', a: '2' },
      { w: '雪', r: 'ゆき', ru: 'снег', a: '2' }, { w: '勇気', r: 'ゆうき', ru: 'смелость', a: '1' },
      { w: '来て', r: 'きて', ru: 'приходи', a: '1' }, { w: 'ビル', r: 'びる', ru: 'здание', a: '1' }, { w: 'ビール', r: 'びーる', ru: 'пиво', a: '1' },
    ],
  },
  {
    id: 'sokuon', title: 'Пауза っ (удвоение)', why: 'っ — целая мора тишины перед согласной: きて «приходи» / きって «марка».', match: /っ|пауз|удвоен/i,
    items: [
      { w: '来て', r: 'きて', ru: 'приходи', a: '1' }, { w: '切手', r: 'きって', ru: 'марка', a: '0' },
      { w: '坂', r: 'さか', ru: 'склон', a: '2' }, { w: '作家', r: 'さっか', ru: 'писатель', a: '0' },
      { w: '音', r: 'おと', ru: 'звук', a: '2' }, { w: '夫', r: 'おっと', ru: 'муж', a: '0' },
      { w: '学校', r: 'がっこう', ru: 'школа', a: '0' },
    ],
  },
  {
    id: 'n', title: 'Слоговой ん', why: 'ん — отдельная мора; перед б/п/м звучит как «м».', match: /ん/,
    items: [
      { w: '粉', r: 'こな', ru: 'мука', a: '2' }, { w: 'こんな', r: 'こんな', ru: 'такой', a: '0' },
      { w: '新聞', r: 'しんぶん', ru: 'газета', a: '0' }, { w: '本', r: 'ほん', ru: 'книга', a: '1' },
      { w: '簡単', r: 'かんたん', ru: 'простой', a: '0' }, { w: '散歩', r: 'さんぽ', ru: 'прогулка', a: '0' },
    ],
  },
  {
    id: 'pitch', title: 'Пары по тону', why: 'Одинаковые звуки, разный тональный рисунок — разные слова.', match: /тон|падени|мор[аы]|хэйбан/i,
    items: [
      { w: '箸', r: 'はし', ru: 'палочки для еды', a: '1' }, { w: '橋', r: 'はし', ru: 'мост', a: '2' }, { w: '端', r: 'はし', ru: 'край', a: '0' },
      { w: '雨', r: 'あめ', ru: 'дождь', a: '1' }, { w: '飴', r: 'あめ', ru: 'конфета', a: '0' },
      { w: '牡蠣', r: 'かき', ru: 'устрица', a: '1' }, { w: '柿', r: 'かき', ru: 'хурма', a: '0' },
      { w: '今', r: 'いま', ru: 'сейчас', a: '1' }, { w: '居間', r: 'いま', ru: 'гостиная', a: '2' },
    ],
  },
  {
    id: 'r', title: 'Японский «р»', why: 'Один лёгкий удар кончиком языка — между «р» и «л».', match: /«р»|р»|ら|удар/i,
    items: [
      { w: 'ラーメン', r: 'らーめん', ru: 'рамэн', a: '1' }, { w: 'りんご', r: 'りんご', ru: 'яблоко', a: '0' },
      { w: '車', r: 'くるま', ru: 'машина', a: '0' }, { w: 'これ', r: 'これ', ru: 'это', a: '0' }, { w: '色', r: 'いろ', ru: 'цвет', a: '2' },
    ],
  },
  {
    id: 'tsu', title: 'つ, す, し, ひ, ふ', why: 'Звуки, которых нет в русском: つ [цу], ふ [ф/х], し [си].', match: /つ|す|し|ひ|ふ/,
    items: [
      { w: '月', r: 'つき', ru: 'луна', a: '2' }, { w: '好き', r: 'すき', ru: 'нравится', a: '2' }, { w: '冬', r: 'ふゆ', ru: 'зима', a: '2' },
      { w: '人', r: 'ひと', ru: 'человек', a: '0' }, { w: '塩', r: 'しお', ru: 'соль', a: '2' }, { w: '机', r: 'つくえ', ru: 'стол', a: '0' },
    ],
  },
];

function TargetView({ t }: { t: Target }) {
  const mode = useProgress((s) => s.settings.transcription);
  const record = useProgress((s) => s.recordPronunciation);
  const recordAnswer = useProgress((s) => s.recordAnswer);
  const addXp = useProgress((s) => s.addXp);
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="learn-card">
        <div className="big-ja">{t.w}</div>
        {t.r !== t.w && <div className="reading">{t.r}</div>}
        {mode !== 'none' && <div className="translit">{transcribe(t.r, mode)}</div>}
        <div style={{ fontWeight: 600, fontSize: '1.15rem', margin: '6px 0' }}>{t.ru}</div>
        {t.a && <PitchPattern reading={t.r} accent={t.a} />}
        <div className="small faint" style={{ marginTop: 10 }}>Послушайте разные голоса:</div>
        <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 6 }}>
          {VOICE_PROFILES.map((v) => (
            <AudioButton key={v.id} text={t.r} profile={v.id} label={v.label.replace(' голос', '').replace(' речь', '')} small />
          ))}
        </div>
        <p className="tiny faint" style={{ marginTop: 8 }}>
          Голоса синтезируются системой вашего устройства; набор и качество голосов зависят от ОС.
        </p>
      </div>
      <div className="card flat">
        <SpeakCheck
          key={t.w + t.r}
          text={t.w}
          reading={t.r}
          accent={t.a}
          compact
          onResult={(r) => {
            record({ text: t.w, score: r.score, accent: r.pitch?.accentScore ?? 0, issues: r.issues.slice(0, 4) });
            recordAnswer('pronunciation', r.score >= 0.7, r.score >= 0.7 ? undefined : { item: t.w, expected: t.r, got: r.recognized, note: r.issues[0] });
            if (r.score >= 0.7) addXp(5);
          }}
        />
      </div>
    </div>
  );
}

function Shadowing() {
  const sentences = useMemo(() => STORIES.filter((s) => s.level >= 4).flatMap((s) => s.sentences).slice(0, 60), []);
  const [i, setI] = useState(0);
  const s = sentences[i % sentences.length];
  return (
    <div className="card">
      <h3>🗣️ Шэдоуинг</h3>
      <p className="small muted">Слушайте фразу и повторяйте сразу за диктором, копируя ритм и интонацию.</p>
      <div className="ja" style={{ fontSize: '1.4rem', lineHeight: 2 }}>
        <Furigana text={s.ja} />
      </div>
      <div className="muted small">{s.ru}</div>
      <div style={{ marginTop: 10 }}>
        <SpeakCheck key={i} text={s.ja} reading={readingOf(s.ja)} />
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn small" onClick={() => setI(i + 1)}>
          Следующая фраза →
        </button>
      </div>
      <div className="tiny faint">Фраза {(i % sentences.length) + 1} из {sentences.length}: {stripFurigana(s.ja).length} символов</div>
    </div>
  );
}

export function SpeakPage() {
  const history = useProgress((s) => s.pronunciation);
  const [source, setSource] = useState<string>('auto');
  const [idx, setIdx] = useState(0);
  const { data: n5 } = useAsync(() => getVocab(5), []);

  // упражнения на ваши ошибки: ищем самые частые типы проблем в истории
  const weak = useMemo(() => {
    const issues = history.slice(0, 40).flatMap((h) => h.issues);
    return DRILLS.map((d) => ({ d, n: issues.filter((i) => d.match.test(i)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
  }, [history]);

  const targets: Target[] = useMemo(() => {
    if (source === 'n5') return (n5 ?? []).filter((w) => w.a && w.ru.length).slice(0, 200).map((w) => ({ w: w.m?.includes('uk') ? w.r : w.w, r: w.r, ru: w.ru[0].replace(/^\([^)]*\)\s*/, '').split(';')[0], a: w.a.split(',')[0] }));
    if (source === 'auto') return weak[0]?.d.items ?? DRILLS[0].items;
    return DRILLS.find((d) => d.id === source)?.items ?? [];
  }, [source, n5, weak]);
  const t = targets[idx % Math.max(1, targets.length)];
  const avg = history.length ? history.slice(0, 20).reduce((s, h) => s + h.score, 0) / Math.min(20, history.length) : 0;

  return (
    <div>
      <div className="page-head">
        <h1>Произношение</h1>
        <p>Говорите в микрофон — приложение распознаёт речь, рисует ваш тон, оценивает длительность, ритм и скорость и показывает, какие звуки отличаются от образца.</p>
      </div>
      {!asrSupported() && (
        <div className="callout warn">
          Ваш браузер не поддерживает распознавание речи. Анализ тона и ритма работает, а проверка звуков — в Chrome, Edge или Safari.
        </div>
      )}
      <div className="grid grid-3" style={{ marginBottom: 14 }}>
        <div className="card stat">
          <span className="v">{history.length}</span>
          <span className="l">попыток</span>
        </div>
        <div className="card stat">
          <span className="v">{Math.round(avg * 100)}</span>
          <span className="l">средний балл (последние 20)</span>
        </div>
        <div className="card">
          <div className="small faint">Ваши слабые места</div>
          {weak.length ? weak.slice(0, 3).map((w) => <div key={w.d.id} className="small">• {w.d.title}</div>) : <div className="small muted">пока не выявлены</div>}
        </div>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg">
          <button className={source === 'auto' ? 'on' : ''} onClick={() => { setSource('auto'); setIdx(0); }}>
            🎯 На мои ошибки
          </button>
          {DRILLS.map((d) => (
            <button key={d.id} className={source === d.id ? 'on' : ''} onClick={() => { setSource(d.id); setIdx(0); }}>
              {d.title}
            </button>
          ))}
          <button className={source === 'n5' ? 'on' : ''} onClick={() => { setSource('n5'); setIdx(0); }}>
            Слова N5
          </button>
        </div>
      </div>
      {source !== 'n5' && (
        <div className="callout small">{(source === 'auto' ? weak[0]?.d ?? DRILLS[0] : DRILLS.find((d) => d.id === source))?.why}</div>
      )}
      {t && (
        <div className="card">
          <TargetView t={t} />
          <div className="row between" style={{ marginTop: 12 }}>
            <button className="btn small" onClick={() => setIdx((idx - 1 + targets.length) % targets.length)}>
              ← Предыдущее
            </button>
            <span className="small faint">
              {(idx % targets.length) + 1} / {targets.length}
            </span>
            <button className="btn small primary" onClick={() => setIdx(idx + 1)}>
              Следующее →
            </button>
          </div>
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <Shadowing />
      </div>
      {history.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>История</h3>
          {history.slice(0, 12).map((h, i) => (
            <div key={i} className="row small" style={{ borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
              <span className="ja" style={{ minWidth: 90 }}>{h.text}</span>
              <span className={`chip ${h.score >= 0.8 ? 'green' : h.score >= 0.5 ? 'amber' : 'red'}`}>{Math.round(h.score * 100)}</span>
              <span className="muted" style={{ flex: 1 }}>{h.issues[0] ?? 'без замечаний'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
