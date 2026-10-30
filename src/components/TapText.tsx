// Японский текст, в котором любое слово можно нажать и увидеть перевод (с учётом спряжения).
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { dictionary, type DictEntry } from '../core/data';
import { parseFurigana } from './Furigana';
import { useProgress } from '../store/progress';
import { WordCard } from './WordCard';

interface Hit {
  start: number;
  length: number;
  entries: DictEntry[];
  reasons: string[];
  x: number;
  y: number;
}

export function TapText({ text, className }: { text: string; className?: string }) {
  const furiOn = useProgress((s) => s.settings.furigana);
  const [hit, setHit] = useState<Hit | null>(null);
  const [loading, setLoading] = useState(false);
  const segments = parseFurigana(text);
  const plain = segments.map((s) => s.text).join('');
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hit) return;
    const close = (e: Event) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setHit(null);
    };
    const t = setTimeout(() => window.addEventListener('pointerdown', close), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', close);
    };
  }, [hit]);

  const onTap = async (e: MouseEvent, offset: number) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setLoading(true);
    try {
      await dictionary.ready();
      // нажали в середину слова — ищем слово, которое начинается чуть левее и покрывает эту позицию
      let found: Hit | null = null;
      for (let start = offset; start >= Math.max(0, offset - 6) && !found; start--) {
        const res = dictionary.lookupAt(plain, start);
        if (res && start + res.length > offset) found = { start, length: res.length, entries: res.entries, reasons: res.reasons, x: rect.left, y: rect.bottom };
      }
      setHit(found);
    } finally {
      setLoading(false);
    }
  };

  let offset = 0;
  const nodes = segments.map((seg, i) => {
    const start = offset;
    offset += seg.text.length;
    const inHit = (pos: number) => hit && pos >= hit.start && pos < hit.start + hit.length;
    if (seg.reading && furiOn) {
      return (
        <ruby key={i} className={`w ${inHit(start) ? 'on' : ''}`} onClick={(e) => onTap(e, start)}>
          {seg.text}
          <rt>{seg.reading}</rt>
        </ruby>
      );
    }
    return [...seg.text].map((ch, k) => {
      const pos = start + k;
      return (
        <span key={`${i}-${k}`} className={`w ${inHit(pos) ? 'on' : ''}`} onClick={(e) => onTap(e, pos)}>
          {ch}
        </span>
      );
    });
  });

  const top = hit ? Math.min(hit.y + 6, window.innerHeight - 320) : 0;
  const left = hit ? Math.max(12, Math.min(hit.x, window.innerWidth - 372)) : 0;

  return (
    <span className={`tap-text ${className ?? ''}`} style={loading ? { cursor: 'progress' } : undefined}>
      {nodes}
      {hit &&
        createPortal(
          <div className="popup" ref={popupRef} style={{ top, left }}>
            {hit.entries.slice(0, 3).map((e, i) => (
              <div key={e.id} style={i ? { borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 } : undefined}>
                <WordCard entry={e} reasons={i === 0 ? hit.reasons : undefined} compact />
              </div>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
