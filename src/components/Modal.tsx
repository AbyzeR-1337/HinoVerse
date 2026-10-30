import { useEffect, type ReactNode } from 'react';

export function Modal({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={wide ? { width: 'min(860px, 100%)' } : undefined} onClick={(e) => e.stopPropagation()}>
        <button className="btn ghost round modal-close" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

export function Toast({ text }: { text: string }) {
  return <div className="toast">{text}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="row" style={{ justifyContent: 'center', padding: 24 }}>
      <span className="spin" />
      {label && <span className="muted">{label}</span>}
    </div>
  );
}
