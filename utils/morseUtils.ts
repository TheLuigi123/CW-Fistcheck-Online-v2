import { MORSE_MAP, calculateDotLength } from '../constants';
import { SignalInterval } from '../types';

export const textToIdealTiming = (text: string, wpm: number): SignalInterval[] => {
  const dotMs = calculateDotLength(wpm) / 1000; // seconds
  const intervals: SignalInterval[] = [];
  let currentTime = 0;

  const cleanText = text.toUpperCase().replace(/[^A-Z0-9 .,?'!/()&:;=+_"$@-]/g, ' ');

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    
    if (char === ' ') {
      // Word space: 7 units
      // However, we usually just had a char space (3 units) from the previous char.
      // Standard: 7 units between words.
      // If we are strictly appending, the previous char ended with a Mark.
      // We added a 3 unit gap after it.
      // To make it a 7 unit gap total, we add 4 more.
      
      // Let's refine: The loop below adds a 3-unit gap AFTER every char.
      // If we hit a space, we extend that gap to 7.
      if (intervals.length > 0 && intervals[intervals.length - 1].state === 'off') {
        intervals[intervals.length - 1].duration += (4 * dotMs);
        currentTime += (4 * dotMs);
      }
      continue;
    }

    const code = MORSE_MAP[char];
    if (!code) continue;

    for (let j = 0; j < code.length; j++) {
      const symbol = code[j];
      const duration = symbol === '.' ? dotMs : 3 * dotMs;
      
      // Mark
      intervals.push({
        startTime: currentTime,
        duration: duration,
        state: 'on'
      });
      currentTime += duration;

      // Intra-char space (1 unit) if not the last symbol of the char
      if (j < code.length - 1) {
        intervals.push({
          startTime: currentTime,
          duration: dotMs,
          state: 'off'
        });
        currentTime += dotMs;
      }
    }

    // Inter-char space (3 units)
    // We add this after every char. If the next char is a space, we extend it.
    intervals.push({
      startTime: currentTime,
      duration: 3 * dotMs,
      state: 'off'
    });
    currentTime += 3 * dotMs;
  }

  return intervals;
};

// Heuristic decoder to check for "K" (-.-)
// Returns true if the last sequence of signals matches "K" and is followed by a significant pause
export const detectCommand = (
  signals: SignalInterval[], 
  wpm: number, 
  commandChar: string = 'K'
): boolean => {
  if (signals.length < 3) return false;

  const dotMs = calculateDotLength(wpm) / 1000;
  // Tolerances
  const dotMax = dotMs * 2.0; 
  const dahMin = dotMs * 2.0;
  
  // Look at the last few 'on' signals
  // Filter only 'on' signals
  const onSignals = signals.filter(s => s.state === 'on');
  if (onSignals.length < 3) return false;

  const last3 = onSignals.slice(-3);
  
  const isDah1 = last3[0].duration > dahMin;
  const isDit = last3[1].duration < dotMax;
  const isDah2 = last3[2].duration > dahMin;

  const targetCode = MORSE_MAP[commandChar]; 
  // For K (-.-): Dah, Dit, Dah
  
  if (targetCode === '-.-' && isDah1 && isDit && isDah2) {
      return true;
  }

  return false;
};
