// Рендер японского текста с фуриганой в записи 漢字{かんじ} и простой разметки **жирный**.
import { Fragment, type ReactNode } from 'react';
import { useProgress } from '../store/progress';

const FURI_RE = /([㐀-䶿一-鿿豈-﫿々〆ヶ０-９0-9]+)\{([^}]+)\}/g;

export type FuriSegment = { text: string; reading?: string };

export function parseFurigana(src: string): FuriSegment[] {
  const out: FuriSegment[] = [];
  let last = 0;
  for (const m of src.matchAll(FURI_RE)) {
    if (m.index! > last) out.push({ text: src.slice(last, m.index) });
    out.push({ text: m[1], reading: m[2] });
    last = m.index! + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

/** Текст без фуриганы: 日本{にほん} → 日本. */
export function stripFurigana(src: string): string {
  return src.replace(FURI_RE, '$1');
}

/** Чтение каной: 日本{にほん}語{ご} → にほんご (для озвучки и проверки). */
export function readingOf(src: string): string {
  return src.replace(FURI_RE, '$2');
}

export function Furigana({ text, show, className }: { text: string; show?: boolean; className?: string }) {
  const enabled = useProgress((s) => s.settings.furigana);
  const on = show ?? enabled;
  return (
    <span className={className}>
      {parseFurigana(text).map((seg, i) =>
        seg.reading && on ? (
          <ruby key={i}>
            {seg.text}
            <rt>{seg.reading}</rt>
          </ruby>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </span>
  );
}

/** Русский текст с **жирным** и вставками японского с фуриганой. */
export function RichText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push(<Furigana key={k++} text={text.slice(last, m.index)} />);
    parts.push(
      <strong key={k++}>
        <Furigana text={m[1]} />
      </strong>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(<Furigana key={k++} text={text.slice(last)} />);
  return <>{parts}</>;
}
