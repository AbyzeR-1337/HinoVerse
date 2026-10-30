// Карточка словарной статьи: запись, чтение, тон, переводы, примеры.
import { useEffect, useState } from 'react';
import { type DictEntry, findSentences, primaryForm } from '../core/data';
import { transcribe, hasKanji } from '../core/kana';
import { useProgress } from '../store/progress';
import { AudioButton } from './AudioButton';
import { PitchPattern } from './PitchGraph';
import { Link } from 'react-router-dom';

export const POS_RU: Record<string, string> = {
  n: 'сущ.', pn: 'мест.', v1: 'глагол II', 'v1-s': 'глагол II', vk: 'глагол 来る', vs: 'сущ. + する', 'vs-i': 'глагол する', 'vs-s': 'глагол する',
  'adj-i': 'い-прил.', 'adj-ix': 'い-прил.', 'adj-na': 'な-прил.', 'adj-no': 'прил. с の', 'adj-pn': 'опред. слово', adv: 'нареч.', 'adv-to': 'нареч. с と',
  conj: 'союз', int: 'межд.', prt: 'частица', suf: 'суффикс', pref: 'префикс', ctr: 'счётное слово', exp: 'выражение', aux: 'вспом.', 'aux-v': 'вспом. глагол',
  num: 'числ.', cop: 'связка', vt: 'перех.', vi: 'неперех.',
};
const MISC_RU: Record<string, string> = {
  uk: 'обычно каной', col: 'разг.', hon: 'почтит.', hum: 'скромн.', pol: 'вежл.', sl: 'сленг', vulg: 'груб.', arch: 'устар.', abbr: 'сокр.',
  'on-mim': 'звукоподраж.', id: 'идиома', yoji: 'ёдзидзюкуго', male: 'муж. речь', fem: 'жен. речь',
  en: 'перевод на английском',
};

export function posLabel(pos: string[]): string[] {
  return pos.filter((p) => p.startsWith('v5') || POS_RU[p]).map((p) => (p.startsWith('v5') ? 'глагол I' : POS_RU[p]));
}

export function WordCard({ entry, reasons, compact, onAdd }: { entry: DictEntry; reasons?: string[]; compact?: boolean; onAdd?: () => void }) {
  const mode = useProgress((s) => s.settings.transcription);
  const addCards = useProgress((s) => s.addCards);
  const inSrs = useProgress((s) => !!s.cards[`w:${entry.id}`]);
  const [examples, setExamples] = useState<[string, string][] | null>(null);
  const form = primaryForm(entry);
  const reading = entry.readings[0];

  useEffect(() => {
    if (compact) return;
    let alive = true;
    setExamples(null);
    findSentences([...entry.kanji.slice(0, 2), ...(hasKanji(form) ? [] : entry.readings.slice(0, 1).filter((r) => r.length > 2))], 5).then((s) => {
      if (alive) setExamples(s);
    });
    return () => {
      alive = false;
    };
  }, [entry.id, compact, form, entry.kanji, entry.readings]);

  const add = () => {
    addCards([{ id: `w:${entry.id}`, item: { t: 'word', f: form, r: reading !== form ? reading : undefined, b: entry.glosses[0], a: entry.accent || undefined } }]);
    onAdd?.();
  };

  return (
    <div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ja" style={{ fontSize: compact ? '1.6rem' : '2.2rem', lineHeight: 1.3 }}>
            {form}
          </div>
          {form !== reading && <div className="reading">{entry.readings.join('、')}</div>}
          {mode !== 'none' && <div className="translit">{transcribe(reading, mode)}</div>}
        </div>
        <AudioButton text={reading} />
      </div>
      <div className="row" style={{ margin: '8px 0', gap: 6 }}>
        {entry.jlpt > 0 && <span className="chip red">N{entry.jlpt}</span>}
        {posLabel(entry.pos).map((p, i) => (
          <span key={i} className="chip">
            {p}
          </span>
        ))}
        {entry.misc.map((m) => MISC_RU[m] && (
          <span key={m} className="chip amber">
            {MISC_RU[m]}
          </span>
        ))}
      </div>
      {reasons && reasons.length > 0 && (
        <div className="small" style={{ marginBottom: 6 }}>
          <span className="chip violet">форма: {reasons.join(' → ')}</span>
        </div>
      )}
      {entry.accent && <PitchPattern reading={reading} accent={entry.accent} compact={compact} />}
      <ol style={{ paddingLeft: '1.3em', margin: '8px 0' }}>
        {entry.glosses.slice(0, compact ? 3 : 8).map((g, i) => (
          <li key={i}>{g}</li>
        ))}
      </ol>
      {entry.kanji.length > 1 && !compact && <div className="small muted">Другие написания: {entry.kanji.slice(1).join('、')}</div>}
      {!compact && hasKanji(form) && (
        <div className="row small" style={{ margin: '8px 0', gap: 6 }}>
          Иероглифы:
          {[...new Set([...form].filter((c) => hasKanji(c)))].map((c) => (
            <Link key={c} to={`/kanji/${encodeURIComponent(c)}`} className="chip indigo ja" style={{ fontSize: '1rem' }}>
              {c}
            </Link>
          ))}
        </div>
      )}
      {!compact && (
        <div style={{ marginTop: 12 }}>
          <div className="small faint">Примеры (Tatoeba)</div>
          {examples === null ? (
            <div className="small muted">загрузка…</div>
          ) : examples.length === 0 ? (
            <div className="small muted">Примеров пока нет.</div>
          ) : (
            examples.map(([jp, ru], i) => (
              <div key={i} className="example">
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <div className="ja" style={{ flex: 1, fontSize: '1.1rem' }}>
                    {jp}
                  </div>
                  <AudioButton text={jp} small />
                </div>
                <div className="ru-line small">{ru}</div>
              </div>
            ))
          )}
        </div>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn small" onClick={add} disabled={inSrs}>
          {inSrs ? '✓ В повторении' : '＋ В повторение'}
        </button>
        {compact && (
          <Link className="btn small ghost" to={`/dict?q=${encodeURIComponent(form)}`}>
            Подробнее →
          </Link>
        )}
      </div>
    </div>
  );
}
