export interface SignalInterval {
  startTime: number; // Relative to start of recording/line
  duration: number;
  state: 'on' | 'off';
}

export interface MorseChar {
  char: string;
  code: string;
}

export type MorseTiming = SignalInterval[];

export interface AudioConfig {
  wpm: number;
  threshold: number; // Audio amplitude threshold 0-1
}

export enum DetectionState {
  IDLE,
  LISTENING,
  PROCESSING
}
