import { useState, useRef, useEffect, useCallback } from 'react';
import { SignalInterval } from '../types';

interface UseAudioKeyerProps {
  threshold: number; // 0.0 to 1.0
  onSignalChange?: (signals: SignalInterval[]) => void;
}

export const useAudioKeyer = ({ threshold, onSignalChange }: UseAudioKeyerProps) => {
  const [isListening, setIsListening] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [activeSignalStart, setActiveSignalStart] = useState<number | null>(null);
  const [isSignalOn, setIsSignalOn] = useState(false);
  
  // Track listening state in ref for use in animation frame loop
  const isListeningRef = useRef(false);
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Visualization loop ref
  const rafRef = useRef<number>();
  
  // Audio Processing State refs
  const signalsRef = useRef<SignalInterval[]>([]);
  const isSignalOnRef = useRef<boolean>(false); // The stable state
  const lastChangeTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const currentLevelRef = useRef<number>(0); // Instantaneous level for UI
  const smoothedEnvRef = useRef<number>(0);  // Envelope follower state

  // Config refs
  const thresholdRef = useRef(threshold);
  const onSignalChangeRef = useRef(onSignalChange);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  useEffect(() => {
    onSignalChangeRef.current = onSignalChange;
  }, [onSignalChange]);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (scriptNodeRef.current) scriptNodeRef.current.disconnect();
    if (sourceRef.current) sourceRef.current.disconnect();
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (audioContextRef.current) {
        audioContextRef.current.close().catch(e => console.error("Error closing audio context", e));
    }
    
    audioContextRef.current = null;
    scriptNodeRef.current = null;
    setIsListening(false);
    setCurrentLevel(0);
    setActiveSignalStart(null);
    setIsSignalOn(false);
    smoothedEnvRef.current = 0;
  }, []);

  const stopListening = useCallback(() => {
    if (audioContextRef.current) {
        // Commit final segment
        const now = audioContextRef.current.currentTime;
        const relativeNow = Math.max(0, now - startTimeRef.current);
        const duration = relativeNow - lastChangeTimeRef.current;
        
        if (duration > 0.01) {
             signalsRef.current = [
              ...signalsRef.current,
              {
                startTime: lastChangeTimeRef.current,
                duration: duration,
                state: isSignalOnRef.current ? 'on' : 'off'
              }
            ];
            if (onSignalChangeRef.current) onSignalChangeRef.current(signalsRef.current);
        }
    }
    cleanup();
  }, [cleanup]);

  // UI Update Loop (60Hz) - Decoupled from Audio Processing
  const updateUI = useCallback(() => {
    setCurrentLevel(currentLevelRef.current);

    // Auto-pause logic: Check if silence duration exceeds 5 seconds
    if (isListeningRef.current && !isSignalOnRef.current && audioContextRef.current) {
         const now = audioContextRef.current.currentTime;
         const relativeTime = Math.max(0, now - startTimeRef.current);
         const silenceDuration = relativeTime - lastChangeTimeRef.current;
         
         // Only stop if we have actually started keying (recorded at least one signal segment)
         if (signalsRef.current.length > 0 && silenceDuration > 5.0) {
             stopListening();
             return; // Stop the loop
         }
    }

    rafRef.current = requestAnimationFrame(updateUI);
  }, [stopListening]);

  const startListening = useCallback(async () => {
    try {
      if (audioContextRef.current) cleanup();

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false 
        } 
      });
      streamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 48000, 
          latencyHint: 'interactive'
      });
      
      if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;
      
      const scriptNode = audioCtx.createScriptProcessor(512, 1, 1);
      scriptNodeRef.current = scriptNode;
      
      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;
      
      source.connect(scriptNode);
      scriptNode.connect(audioCtx.destination);

      startTimeRef.current = audioCtx.currentTime;
      lastChangeTimeRef.current = 0;
      signalsRef.current = [];
      isSignalOnRef.current = false;
      smoothedEnvRef.current = 0;
      
      // Detection Logic
      scriptNode.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const outputData = e.outputBuffer.getChannelData(0);
        const bufferLength = inputData.length;
        const sampleRate = e.inputBuffer.sampleRate;
        
        // Use playbackTime as the definitive start time of this block
        const bufferStartTime = e.playbackTime; 
        
        const th = thresholdRef.current;
        const lowerTh = th * 0.6; // Hysteresis
        let env = smoothedEnvRef.current;
        let signalState = isSignalOnRef.current;
        let maxValInChunk = 0;

        for (let i = 0; i < bufferLength; i++) {
             const absVal = Math.abs(inputData[i]);
             if (absVal > maxValInChunk) maxValInChunk = absVal;

             if (absVal > env) {
                 env = env * 0.6 + absVal * 0.4; 
             } else {
                 env = env * 0.98;
             }

             // Time Calculation - CRITICAL FIX
             // Ensure time never goes backwards due to clock drift or reset race conditions
             const preciseTime = bufferStartTime + (i / sampleRate);
             const relativeTime = Math.max(0, preciseTime - startTimeRef.current);

             // State Detection
             if (!signalState && env > th) {
                 // Transition to ON
                 const durationSinceLast = relativeTime - lastChangeTimeRef.current;

                 // Logic: If previous 'OFF' duration was tiny (<15ms), treat it as glitch.
                 if (durationSinceLast < 0.015 && signalsRef.current.length > 0) {
                     // The gap was too short. Merge.
                     // Last interval pushed was 'on' (because we were OFF).
                     
                     // We just continue that ON interval.
                     // We DO NOT push a new OFF interval.
                     // We update state to ON, effectively ignoring the gap.
                     signalState = true;
                     
                     const lastSig = signalsRef.current.pop();
                     if (lastSig && lastSig.state === 'on') {
                         lastChangeTimeRef.current = lastSig.startTime;
                     }
                 } else {
                     // Valid OFF segment detected. Push it.
                     if (signalsRef.current.length > 0 || lastChangeTimeRef.current > 0) {
                         signalsRef.current.push({
                             startTime: lastChangeTimeRef.current,
                             duration: durationSinceLast,
                             state: 'off'
                         });
                     }
                     // Start new ON segment
                     lastChangeTimeRef.current = relativeTime;
                     signalState = true;
                 }
                 
             } else if (signalState && env < lowerTh) {
                 // Transition to OFF
                 const durationSinceLast = relativeTime - lastChangeTimeRef.current;
                 
                 // Short pulse suppression (Debounce ON signal)
                 if (durationSinceLast < 0.015) {
                     // Pulse too short. Ignore.
                     // We were ON. Now turning OFF.
                     
                     const lastSig = signalsRef.current.length > 0 ? signalsRef.current[signalsRef.current.length - 1] : null;
                     
                     if (lastSig && lastSig.state === 'off') {
                         // We are continuing that OFF.
                         // So we remove it to "re-open" it?
                         signalsRef.current.pop();
                         lastChangeTimeRef.current = lastSig.startTime;
                     } else if (signalsRef.current.length === 0) {
                         // Very start of recording.
                         // We are effectively still waiting for the first REAL signal.
                         // Keep lastChangeTimeRef updating to current relativeTime to avoid a huge initial gap?
                         // No, we want the first signal to start at '0' relative to when keying starts, 
                         // or we align later.
                         // Let's just treat this as if the ON never happened.
                         // The gap (OFF state) continues.
                         // We DO NOT update lastChangeTimeRef.
                     }
                     
                     signalState = false;
                     
                 } else {
                     // Valid ON segment. Push it.
                     signalsRef.current.push({
                         startTime: lastChangeTimeRef.current,
                         duration: durationSinceLast,
                         state: 'on'
                     });
                     
                     // Start new OFF segment
                     lastChangeTimeRef.current = relativeTime;
                     signalState = false;
                 }
             }
        }
        
        smoothedEnvRef.current = env;
        currentLevelRef.current = maxValInChunk;
        outputData.fill(0);

        if (signalState !== isSignalOnRef.current) {
             isSignalOnRef.current = signalState;
             setIsSignalOn(signalState);
             // When signal goes ON, we set active start to current time baseline
             // When signal goes OFF, we set active start to null
             setActiveSignalStart(signalState ? lastChangeTimeRef.current : null);
             
             if (onSignalChangeRef.current) {
                 onSignalChangeRef.current([...signalsRef.current]);
             }
        }
      };

      setIsListening(true);
      setActiveSignalStart(null); 
      rafRef.current = requestAnimationFrame(updateUI);
      
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setIsListening(false);
    }
  }, [cleanup, updateUI]);

  const resetSignals = useCallback(() => {
    signalsRef.current = [];
    smoothedEnvRef.current = 0;
    isSignalOnRef.current = false;
    
    if (audioContextRef.current) {
        // Soft reset: Keep the context, but reset time zero.
        startTimeRef.current = audioContextRef.current.currentTime;
        lastChangeTimeRef.current = 0;
        
        setIsSignalOn(false);
        setActiveSignalStart(null);
    }
    if (onSignalChangeRef.current) onSignalChangeRef.current([]);
  }, []);

  return {
    isListening,
    currentLevel,
    startListening,
    stopListening,
    resetSignals,
    detectedSignals: signalsRef.current,
    isSignalOn,
    activeSignalStart,
    getCurrentTime: () => {
        if (!audioContextRef.current) return 0;
        return Math.max(0, audioContextRef.current.currentTime - startTimeRef.current);
    }
  };
};