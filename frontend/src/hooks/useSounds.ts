import { useCallback, useRef, useEffect, useState } from 'react';

// Sound URLs - using free sound effects from mixkit
const SOUNDS = {
  move: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
  win: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
  lose: 'https://assets.mixkit.co/active_storage/sfx/2658/2658-preview.mp3',
  draw: 'https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3',
  click: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  notification: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3',
  join: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3',
};

export type SoundType = keyof typeof SOUNDS;

export const useSounds = (volume: number = 0.5) => {
  const audioCache = useRef<Map<SoundType, HTMLAudioElement>>(new Map());
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('soundMuted') === 'true';
    }
    return false;
  });

  // Preload sounds
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = volume;
      audioCache.current.set(key as SoundType, audio);
    });

    return () => {
      audioCache.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioCache.current.clear();
    };
  }, [volume]);

  const play = useCallback((sound: SoundType) => {
    if (isMuted) return;
    
    const audio = audioCache.current.get(sound);
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Ignore autoplay errors
      });
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newValue = !prev;
      localStorage.setItem('soundMuted', String(newValue));
      return newValue;
    });
  }, []);

  return {
    play,
    toggleMute,
    isMuted,
  };
};

export default useSounds;
