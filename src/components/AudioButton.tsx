import { useEffect, useState } from 'react';
import { speak, stopSpeaking, ttsSupported, type VoiceProfile } from '../core/speech';
import { useProgress } from '../store/progress';
import { readingOf } from './Furigana';

/** Озвучивает текст выбранным голосом из настроек. */
export function useSpeak() {
  const settings = useProgress((s) => s.settings);
  return (text: string, profile?: VoiceProfile, rate?: number) =>
    speak(readingOf(text), {
      profile: profile ?? settings.voice,
      rate: (rate ?? 1) * settings.ttsRate,
      voiceName: settings.voiceName || undefined,
    });
}

export function AudioButton({
  text,
  profile,
  rate,
  label,
  autoPlay,
  small,
}: {
  text: string;
  profile?: VoiceProfile;
  rate?: number;
  label?: string;
  autoPlay?: boolean;
  small?: boolean;
}) {
  const say = useSpeak();
  const [playing, setPlaying] = useState(false);
  const autoplayEnabled = useProgress((s) => s.settings.autoplay);

  const play = async () => {
    setPlaying(true);
    await say(text, profile, rate);
    setPlaying(false);
  };

  useEffect(() => {
    if (autoPlay && autoplayEnabled) void play();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, autoPlay]);

  if (!ttsSupported()) return null;
  return (
    <button
      type="button"
      className={`btn ${small ? 'small' : ''} ${label ? '' : 'round'}`}
      onClick={(e) => {
        e.stopPropagation();
        void play();
      }}
      title="Прослушать"
      aria-label="Прослушать"
    >
      <span>{playing ? '🔊' : '🔈'}</span>
      {label && <span>{label}</span>}
    </button>
  );
}
