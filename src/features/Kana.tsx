import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KANA_GROUPS, KANA_INFO, SPECIAL_KANA_TIPS } from '../content/kana';
import { hiraganaToKatakana, kanaToRomaji } from '../core/kana';
import { mastery } from '../core/srs';
import { useProgress } from '../store/progress';
import { Modal } from '../components/Modal';
import { KanaPanel } from '../components/Panels';
import { ExerciseRunner } from '../components/ExerciseRunner';
import { kanaExercises } from '../core/exercises';
import { kanaItem } from './items';
import { mulberry32 } from '../core/random';
import { useCourse, lessonPath } from '../hooks';

const GOJUON = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や・ゆ・よ', 'らりるれろ', 'わ・・・を', 'ん・・・・'];
const DAKU = ['がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ'];

export function KanaPage() {
  const [params, setParams] = useSearchParams();
  const [script, setScript] = useState<'hiragana' | 'katakana'>(/[゠-ヿ]/.test(params.get('c') ?? '') ? 'katakana' : 'hiragana');
  const [drill, setDrill] = useState<string[] | null>(null);
  const cards = useProgress((s) => s.cards);
  const { lessons } = useCourse();
  const selected = params.get('c');
  const conv = (s: string) => (script === 'katakana' ? hiraganaToKatakana(s) : s);

  const exercises = useMemo(() => {
    if (!drill) return null;
    const items = drill.map(kanaItem);
    return kanaExercises(items, items, mulberry32(Date.now())).filter((e) => e.type !== 'draw').slice(0, 20);
  }, [drill]);

  const cell = (ch: string, key: string) => {
    if (ch === '・') return <div key={key} className="kana-cell empty" />;
    const k = conv(ch);
    const m = mastery(cards[`kana:${k}`]);
    return (
      <button key={k} className="kana-cell" onClick={() => setParams({ c: k })}>
        <span className="k">{k}</span>
        <span className="r">{KANA_INFO[k]?.romaji ?? kanaToRomaji(k)}</span>
        <span className="mastery-bar">
          <div style={{ width: `${m * 100}%` }} />
        </span>
      </button>
    );
  };

  if (exercises) {
    return (
      <div>
        <button className="btn small ghost" onClick={() => setDrill(null)}>
          ← К таблице
        </button>
        <ExerciseRunner exercises={exercises} onFinish={() => setDrill(null)} />
      </div>
    );
  }

  const groups = KANA_GROUPS.filter((g) => g.script === script);
  const yoon = groups.find((g) => g.id.endsWith('yoon'));
  return (
    <div>
      <div className="page-head row between">
        <div>
          <h1>Кана</h1>
          <p>Нажмите на символ: порядок черт, мнемоника, происхождение, тренажёр письма.</p>
        </div>
        <div className="seg">
          <button className={script === 'hiragana' ? 'on' : ''} onClick={() => setScript('hiragana')}>
            ひらがな
          </button>
          <button className={script === 'katakana' ? 'on' : ''} onClick={() => setScript('katakana')}>
            カタカナ
          </button>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn primary" onClick={() => setDrill(GOJUON.join('').replace(/・/g, '').split('').map(conv))}>
          🎯 Тренировка: все основные
        </button>
        {groups.slice(0, 9).map((g) => (
          <button key={g.id} className="btn small" onClick={() => setDrill(g.chars)}>
            {g.chars.slice(0, 3).join('')}…
          </button>
        ))}
      </div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>Основная таблица (годзюон)</h3>
          <div className="kana-grid">{GOJUON.flatMap((row, r) => [...row].map((ch, c) => cell(ch, `g${r}-${c}`)))}</div>
        </div>
        <div className="stack">
          <div className="card">
            <h3>Звонкие ゛ и полузвонкие ゜</h3>
            <div className="kana-grid">{DAKU.flatMap((row, r) => [...row].map((ch, c) => cell(ch, `d${r}-${c}`)))}</div>
          </div>
          {yoon && (
            <div className="card">
              <h3>Сочетания</h3>
              <div className="row" style={{ gap: 6 }}>
                {yoon.chars.map((c) => (
                  <button key={c} className="chip ja" style={{ fontSize: '1.05rem', border: 'none', cursor: 'pointer' }} onClick={() => setParams({ c })}>
                    {c} <span className="tiny faint">{kanaToRomaji(c)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="card">
            <h3>Особые знаки</h3>
            {SPECIAL_KANA_TIPS.map((t) => (
              <div key={t.title} style={{ marginBottom: 8 }}>
                <strong className="ja">{t.ch}</strong> — <strong>{t.title}</strong>
                <div className="small muted">{t.text}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <h3>Уроки каны в курсе</h3>
            {lessons
              .filter((l) => l.kind === 'kana' && KANA_GROUPS.find((g) => g.id === l.ref)?.script === script)
              .map((l) => (
                <Link key={l.id} to={lessonPath(l)} className="lesson-row" style={{ padding: '6px 8px' }}>
                  <span className="ja">{l.subtitle?.slice(0, 9)}</span>
                  <span className="small muted" style={{ flex: 1 }}>
                    {l.title}
                  </span>
                </Link>
              ))}
          </div>
        </div>
      </div>
      {selected && (
        <Modal onClose={() => setParams({})} wide>
          <KanaPanel ch={selected} />
        </Modal>
      )}
    </div>
  );
}
