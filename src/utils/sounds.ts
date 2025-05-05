'use client';

// Sound effects configuration
export const SOUNDS = {
  SCRATCH: '/sounds/scratch.mp3',
  WIN: '/sounds/win.mp3',
  CARD_FLIP: '/sounds/card-flip.mp3',
  NO_WIN: '/sounds/no-win.mp3'
};

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Sound manager class
export class SoundManager {
  private static instance: SoundManager;
  private sounds: Map<string, HTMLAudioElement>;
  private isMuted: boolean;

  private constructor() {
    this.sounds = new Map();
    this.isMuted = false;
    if (isBrowser) {
      this.initializeSounds();
    }
  }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  private initializeSounds() {
    // Only initialize sounds in browser environment
    if (!isBrowser) return;

    // Initialize all sound effects
    Object.entries(SOUNDS).forEach(([key, path]) => {
      try {
        const audio = new Audio(path);
        audio.preload = 'auto';
        this.sounds.set(key, audio);
      } catch (error) {
        console.error(`Error initializing sound ${key}:`, error);
      }
    });
  }

  public play(soundName: keyof typeof SOUNDS) {
    if (!isBrowser || this.isMuted) return;

    const sound = this.sounds.get(soundName);
    if (sound) {
      try {
        sound.currentTime = 0;
        sound.play().catch(error => {
          console.error(`Error playing sound ${soundName}:`, error);
        });
      } catch (error) {
        console.error(`Error playing sound ${soundName}:`, error);
      }
    }
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  public isSoundMuted(): boolean {
    return this.isMuted;
  }
}