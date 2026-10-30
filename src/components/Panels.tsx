// Подробные панели: символ каны, иероглиф, слово. Используются в уроках и справочниках.
import { Link } from 'react-router-dom';
import { KANA_INFO } from '../content/kana';
import { KANJI_NOTES } from '../content/kanjiNotes';
import { componentInfo, radicalByNumber } from '../content/radicals';
import type { KanjiInfo } from '../core/data';
import { kanjiMeaning } from '../core/data';
import type { LearnItem } from '../core/exercises';
import { katakanaToHiragana, kanaToPolivanov, kanaToRomaji, transcribe } from '../core/kana';
import { useProgress } from '../store/progress';
import { AudioButton } from './AudioButton';
import { DrawPad, StrokeAnimator } from './Strokes';
import { PitchPattern } from './PitchGraph';
import { TapText } from './TapText';
import { posLabel } from './WordCard';

export function KanaPanel({ ch, practice = true }: { ch: string; practice?: boolean }) {
  const info = KANA_INFO[ch];
  const romaji = info?.romaji ?? kanaToRomaji(ch);
  const isKata = /[゠-ヿ]/.test(ch);
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="col" style={{ alignItems: 'center' }}>
        <StrokeAnimator ch={[...ch][0]} size={240} />
      </div>
      <div className="stack">
        <div className="row">
          <span className="ja" style={{ fontSize: '3.4rem', lineHeight: 1 }}>
            {ch}
          </span>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{romaji}</div>
            <div className="muted">по-русски: «{kanaToPolivanov(ch)}»</div>
          </div>
          <span className="spacer" />
          <AudioButton text={katakanaToHiragana(ch)} autoPlay />
        </div>
        <div className="chip">{isKata ? 'катакана' : 'хирагана'}</div>
        {info && (
          <>
            <div>
              <div className="small faint">Мнемоника</div>
              <div>🧠 {info.mnemonic}</div>
            </div>
            <div>
              <div className="small faint">Происхождение</div>
              <div>
                Из иероглифа <span className="ja-serif" style={{ fontSize: '1.4rem' }}>{info.origin}</span>
                {isKata ? ' (взята часть знака)' : ' (скоропись всего знака)'}
              </div>
            </div>
            {info.strokes && <div className="small muted">Черт: {info.strokes}. Пишутся сверху вниз, слева направо.</div>}
            {info.similar && (
              <div>
                <div className="small faint">Похожие символы</div>
                <div className="row">
                  {info.similar.map((s) => (
                    <Link key={s} to={`/kana?c=${encodeURIComponent(s)}`} className="chip indigo ja" style={{ fontSize: '1.2rem' }}>
                      {s}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {info.mistake && <div className="callout warn">⚠️ {info.mistake}</div>}
            <div>
              <div className="small faint">Слова</div>
              {info.examples.map(([w, , ru]) => (
                <div key={w} className="row" style={{ marginTop: 4 }}>
                  <span className="ja" style={{ fontSize: '1.2rem' }}>
                    {w}
                  </span>
                  <span className="muted">— {ru}</span>
                  <AudioButton text={w} small />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {practice && (
        <div style={{ gridColumn: '1 / -1' }}>
          <h3>✍️ Напишите сами</h3>
          <DrawPad ch={[...ch][0]} />
        </div>
      )}
    </div>
  );
}

export function KanjiPanel({ k, practice = true }: { k: KanjiInfo; practice?: boolean }) {
  const note = KANJI_NOTES[k.c];
  const mode = useProgress((s) => s.settings.transcription);
  const rad = k.rad ? radicalByNumber(k.rad) : undefined;
  const meaning = note?.m ?? kanjiMeaning(k);
  const meaningIsEnglish = !note && !k.ru?.length;
  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="col" style={{ alignItems: 'center' }}>
        <StrokeAnimator ch={k.c} size={250} />
      </div>
      <div className="stack">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="ja-serif" style={{ fontSize: '4rem', lineHeight: 1 }}>
            {k.c}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{meaning}</div>
            {meaningIsEnglish && <div className="tiny faint">значение по-английски (KANJIDIC)</div>}
            <div className="row" style={{ gap: 6, marginTop: 6 }}>
              {k.j > 0 && <span className="chip red">N{k.j}</span>}
              {k.g > 0 && <span className="chip">{k.g <= 6 ? `${k.g} класс` : k.g === 8 ? 'дзёё (ср. школа)' : 'для имён'}</span>}
              <span className="chip">{k.s} черт</span>
              {k.f > 0 && <span className="chip indigo">частотность №{k.f}</span>}
            </div>
          </div>
        </div>
        <table className="t">
          <tbody>
            <tr>
              <th style={{ width: 120 }}>Он-ёми</th>
              <td className="ja">
                {k.on.length ? k.on.map((r) => <span key={r} style={{ marginRight: 10 }}>{r}{mode !== 'none' && <span className="tiny faint"> {transcribe(katakanaToHiragana(r), mode)}</span>}</span>) : '—'}
              </td>
            </tr>
            <tr>
              <th>Кун-ёми</th>
              <td className="ja">
                {k.kun.length ? k.kun.map((r) => <span key={r} style={{ marginRight: 10 }}>{r}{mode !== 'none' && <span className="tiny faint"> {transcribe(r.replace(/[.-]/g, ''), mode)}</span>}</span>) : '—'}
              </td>
            </tr>
            {k.nan && k.nan.length > 0 && (
              <tr>
                <th>В именах</th>
                <td className="ja small">{k.nan.join('、')}</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="small muted">
          Он-ёми — китайское чтение (в сочетаниях из нескольких кандзи), кун-ёми — японское (когда иероглиф стоит один или с окончанием каной). Точка в кун-ёми отделяет окуриганы: た.べる → 食べる.
        </div>
        {(rad || k.p.length > 0) && (
          <div>
            <div className="small faint">Ключ и составные части</div>
            <div className="row">
              {rad && (
                <span className="chip violet">
                  ключ №{rad.n} <span className="ja" style={{ fontSize: '1.1rem' }}>{rad.ch}</span> {rad.ru}
                </span>
              )}
              {k.p
                .filter((p) => p !== k.c)
                .map((p) => {
                  const ci = componentInfo(p);
                  return (
                    <span key={p} className="chip">
                      <span className="ja" style={{ fontSize: '1.1rem' }}>{ci?.show ?? p}</span>
                      {ci?.ru ?? ''}
                    </span>
                  );
                })}
            </div>
          </div>
        )}
        {note && (
          <>
            <div>
              <div className="small faint">История знака</div>
              <div>📜 {note.o}</div>
            </div>
            <div>
              <div className="small faint">Мнемоника</div>
              <div>🧠 {note.mn}</div>
            </div>
            {note.sim && (
              <div>
                <div className="small faint">Похожие иероглифы</div>
                <div className="row">
                  {note.sim.map((s) => (
                    <Link key={s} to={`/kanji/${encodeURIComponent(s)}`} className="chip indigo ja-serif" style={{ fontSize: '1.2rem' }}>
                      {s}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {note.err && <div className="callout warn">⚠️ {note.err}</div>}
          </>
        )}
      </div>
      {k.ex && k.ex.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <h3>Слова с этим иероглифом</h3>
          <div className="grid grid-2">
            {k.ex.map(([w, r, g]) => (
              <div key={w + r} className="example row" style={{ margin: 0, flexWrap: 'nowrap' }}>
                <div style={{ flex: 1 }}>
                  <Link to={`/dict?q=${encodeURIComponent(w)}`} className="ja" style={{ fontSize: '1.3rem', color: 'var(--text)' }}>
                    {w}
                  </Link>
                  <span className="reading" style={{ marginLeft: 8, fontSize: '1rem' }}>
                    {r}
                  </span>
                  <div className="small muted">{g}</div>
                </div>
                <AudioButton text={r} small />
              </div>
            ))}
          </div>
        </div>
      )}
      {practice && (
        <div style={{ gridColumn: '1 / -1' }}>
          <h3>✍️ Напишите иероглиф</h3>
          <p className="small muted">Пишите черту за чертой. Я проверяю форму, направление, положение и порядок каждой черты.</p>
          <DrawPad ch={k.c} />
        </div>
      )}
    </div>
  );
}

export function WordPanel({ item }: { item: LearnItem }) {
  const mode = useProgress((s) => s.settings.transcription);
  const details = (item.details ?? {}) as { written?: string; ru?: string[]; en?: string; usuallyKana?: boolean };
  const glosses = details.ru?.length ? details.ru : [item.meaning];
  return (
    <div className="learn-card">
      <div className="big-ja">{item.ja}</div>
      {item.reading !== item.ja && <div className="reading">{item.reading}</div>}
      {details.usuallyKana && details.written && details.written !== item.ja && <div className="tiny faint">обычно пишется каной; иероглифами: {details.written}</div>}
      {mode !== 'none' && <div className="translit">{transcribe(item.reading, mode)}</div>}
      <div className="row" style={{ justifyContent: 'center', margin: '10px 0' }}>
        <AudioButton text={item.reading} autoPlay />
        <AudioButton text={item.reading} profile="male" label="М" small />
        <AudioButton text={item.reading} profile="slow" label="Медленно" small />
      </div>
      {item.accent && (
        <div style={{ margin: '6px 0' }}>
          <PitchPattern reading={item.reading} accent={item.accent} />
        </div>
      )}
      <div style={{ fontSize: '1.3rem', fontWeight: 700, margin: '8px 0' }}>{item.meaning}</div>
      {glosses.length > 1 && (
        <ol className="small muted" style={{ textAlign: 'left', display: 'inline-block', margin: '0 auto' }}>
          {glosses.slice(0, 4).map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ol>
      )}
      {item.pos && posLabel(item.pos).length > 0 && (
        <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 8 }}>
          {posLabel(item.pos).map((p, i) => (
            <span key={i} className="chip">
              {p}
            </span>
          ))}
        </div>
      )}
      {item.examples && item.examples.length > 0 && (
        <div style={{ textAlign: 'left', marginTop: 14 }}>
          {item.examples.map(([jp, ru], i) => (
            <div key={i} className="example">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <div className="ja-line" style={{ flex: 1 }}>
                  <TapText text={jp} />
                </div>
                <AudioButton text={jp} small />
              </div>
              <div className="ru-line small">{ru}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
