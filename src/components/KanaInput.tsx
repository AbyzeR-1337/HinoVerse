// Поле ввода, которое превращает латиницу в кану прямо при наборе (как японская раскладка).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { romajiToHiragana, romajiToKatakana } from '../core/kana';

export function KanaInput({
  value,
  onChange,
  onEnter,
  placeholder,
  katakana,
  autoFocus,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  katakana?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const [raw, setRaw] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const [kataMode, setKataMode] = useState(!!katakana);

  useEffect(() => {
    if (value === '') setRaw('');
  }, [value]);

  const convert = (s: string, final = false) => {
    // переводим латиницу в кану; японский текст (набранный системной раскладкой) не трогаем.
    // Последний кусок оставляем «незавершённым», пока пользователь печатает (n → ん только после следующей буквы).
    const conv = kataMode ? romajiToKatakana : romajiToHiragana;
    return s.replace(/[a-zA-Z'\-.,?!~]+/g, (m: string, off: number) => conv(m, !final && off + m.length === s.length));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const fin = convert(raw, true);
      setRaw(fin);
      onChange(fin);
      onEnter?.();
    }
  };

  return (
    <div className="col" style={{ gap: 6 }}>
      <input
        ref={ref}
        className="input ja-input"
        value={raw}
        placeholder={placeholder ?? 'Печатайте латиницей: arigatou → ありがとう'}
        autoFocus={autoFocus}
        disabled={disabled}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        lang="ja"
        onChange={(e) => {
          const next = convert(e.target.value);
          setRaw(next);
          onChange(convert(e.target.value, true));
        }}
        onKeyDown={onKey}
      />
      <div className="row tiny faint">
        <label className="switch">
          <input type="checkbox" checked={kataMode} onChange={(e) => setKataMode(e.target.checked)} /> катакана
        </label>
        <span>nn → ん · двойная согласная → っ · «-» → ー</span>
      </div>
    </div>
  );
}
