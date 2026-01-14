import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SignalInterval } from './types';
import { textToIdealTiming } from './utils/morseUtils';
import { useAudioKeyer } from './hooks/useAudioKeyer';
import Timeline from './components/Timeline';
import { Keyboard, Volume2, ChevronLeft, ChevronRight, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react';

const DEFAULT_TEXT = `tnx for the call
ant is 3el yagi
at 55 feet
up and down
xray wont hurt
kiss and tell
easy as pie
rag tag dog wag
wx is cldy
temp is 15C
temp here is 70F
make CW QSOs
the oak tree
hope to cu agn
sun spots
your RST is
the tall tree
best QSO ever
cold ice rink
120 volt amp
rf coax loss
been to the zoo?
CWA has been fun
rf burn
know them well
have a fun time
a crew cut
be safe and well
name is rick
I like SOTA
head copy
head send
jump or duck
one acre lot
then we will
been a long time
know I can
bet you will
she runs fast
rail road code
work many QSOs
as you wish
turn the page
come on over
call me soon
look over here
must be kind
time will pass
like my home
say your name
want to play?
ask me what?
Its my turn
play your hand
this is good
I like that
too much
just help
read my lips
fine by me
its my idea
A cold road
once upon a time
walk a mile
hear them both
main road
turn it on
slow down
find work
i am next
walk with me
open the door
work to live
live to work
a live wire
a left turn
come over here
fast or slow?
give or take
a big city
sing my song
they are late
she is safe
life goes on
work from home
make it real
able to hear
sure is cold
sure is warm
its the rule
had an idea
each is OK
give it a shot
lead on
have an idea
mark my word
they want it all
they were here
when you want
just in time
hey jude
get back
i feel fine
all you need
dont let me down
blue jay way
from me to you
when im 64
best of my love`;

const App: React.FC = () => {
  // --- State ---
  const [inputText, setInputText] = useState(DEFAULT_TEXT);
  const [lines, setLines] = useState<string[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [wpm, setWpm] = useState(15.7);
  const [threshold, setThreshold] = useState(0.31); 
  const [userSignals, setUserSignals] = useState<SignalInterval[]>([]);

  // --- Effects ---
  useEffect(() => {
    // Parse input text into lines
    const splitLines = inputText.split('\n').filter(l => l.trim().length > 0);
    setLines(splitLines);
    if (currentLineIndex >= splitLines.length) {
      setCurrentLineIndex(0);
    }
  }, [inputText]);

  // --- Helpers ---
  const currentLineText = lines[currentLineIndex] || "";
  
  const idealSignals = React.useMemo(() => 
    textToIdealTiming(currentLineText, wpm), 
  [currentLineText, wpm]);

  // --- Callback ---
  const handleSignalChange = useCallback((signals: SignalInterval[]) => {
    setUserSignals(signals);
  }, []);

  const { 
    isListening, 
    currentLevel, 
    startListening, 
    stopListening, 
    resetSignals,
    isSignalOn,
    activeSignalStart,
    getCurrentTime
  } = useAudioKeyer({ 
    threshold, 
    onSignalChange: handleSignalChange 
  });

  // When line changes, reset the keyer signals automatically
  useEffect(() => {
     resetSignals();
     // We don't necessarily stop listening here, just clear signals for the new line
  }, [currentLineIndex, resetSignals]);

  const handleRestart = useCallback(() => {
    // Restart current attempt: clear signals, ensure listening
    resetSignals();
    if (!isListening) {
      startListening();
    }
  }, [isListening, resetSignals, startListening]);

  const handlePrevLine = useCallback(() => {
    if (currentLineIndex > 0) {
      setCurrentLineIndex(prev => prev - 1);
      setUserSignals([]);
      resetSignals();
      if (!isListening) startListening();
    }
  }, [currentLineIndex, isListening, resetSignals, startListening]);

  const handleNextLine = useCallback(() => {
    if (currentLineIndex < lines.length - 1) {
      setCurrentLineIndex(prev => prev + 1);
      setUserSignals([]);
      resetSignals();
      if (!isListening) startListening();
    }
  }, [currentLineIndex, lines.length, isListening, resetSignals, startListening]);

  // --- Keyboard Navigation ---
  // Store handlers in a ref to avoid dependency cycle / stale closure issues in the event listener
  const handlersRef = useRef({ handlePrevLine, handleNextLine, handleRestart });
  useEffect(() => {
    handlersRef.current = { handlePrevLine, handleNextLine, handleRestart };
  }, [handlePrevLine, handleNextLine, handleRestart]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        
        // Block shortcuts only if the user is typing in a text field (textarea) 
        // or a number input (where up/down arrow keys change value).
        // We allow shortcuts if the user is on the slider (range) input, 
        // but note that slider consumes arrow keys for value change if focused.
        // Usually, capturing standard navigation keys while on a slider is bad UX,
        // so we check if the element consumes the event naturally.
        
        const isTextInput = target.tagName === 'TEXTAREA' || 
                           (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text');
        const isNumberInput = target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number';
        const isRangeInput = target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'range';
        
        if (isTextInput || isNumberInput || isRangeInput) {
            return;
        }

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                handlersRef.current.handlePrevLine();
                break;
            case 'ArrowRight':
                e.preventDefault();
                handlersRef.current.handleNextLine();
                break;
            case 'ArrowUp':
            case 'ArrowDown':
                e.preventDefault();
                handlersRef.current.handleRestart();
                break;
        }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const updateWpm = (newWpm: number) => {
    setWpm(Math.max(5, Math.min(40, Number(newWpm.toFixed(1)))));
  };
  
  // Construct the active signal object for visualization
  const activeSignal = isListening && activeSignalStart !== null ? {
      state: isSignalOn ? 'on' as const : 'off' as const,
      startTime: activeSignalStart,
      currentTime: getCurrentTime()
  } : undefined;

  // Visual calculations for threshold bar
  const maxThresholdDisplay = 0.5;
  const signalPercent = Math.min((currentLevel / maxThresholdDisplay) * 100, 100);
  const thresholdPercent = Math.min((threshold / maxThresholdDisplay) * 100, 100);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 flex flex-col items-center">
      
      {/* Header */}
      <header className="w-full max-w-7xl mb-6 flex flex-col md:flex-row justify-between items-center border-b border-slate-800 pb-4 gap-6">
        <div className="text-center md:text-left">
           <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            CW Fistcheck Online
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Analyze your Morse code keying accuracy
          </p>
        </div>
        
        {/* Top Right Controls */}
        <div className="flex flex-wrap justify-center gap-6 items-center bg-slate-900/50 p-3 rounded-xl border border-slate-800">
            {/* Speed Control */}
            <div className="flex flex-col gap-1">
                 <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
                    <Keyboard className="w-3 h-3" />
                    <span>Speed (WPM)</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700">
                        <input 
                            type="number" 
                            min="5" 
                            max="40" 
                            step="0.1" 
                            value={wpm}
                            onChange={(e) => setWpm(parseFloat(e.target.value))}
                            className="w-16 bg-transparent text-white text-sm px-2 py-1 focus:outline-none text-center font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <div className="flex flex-col border-l border-slate-700">
                            <button 
                                onClick={() => updateWpm(wpm + 0.1)}
                                className="px-1 hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors h-4 flex items-center justify-center border-b border-slate-700"
                            >
                                <ChevronUp className="w-3 h-3" />
                            </button>
                            <button 
                                onClick={() => updateWpm(wpm - 0.1)}
                                className="px-1 hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors h-4 flex items-center justify-center"
                            >
                                <ChevronDown className="w-3 h-3" />
                            </button>
                        </div>
                    </div>

                    <input 
                        type="range" 
                        min="5" 
                        max="40" 
                        step="0.1" 
                        value={wpm}
                        onChange={(e) => setWpm(parseFloat(e.target.value))}
                        className="w-24 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hidden sm:block"
                        title="Coarse adjustment"
                    />
                </div>
            </div>

            <div className="w-px h-8 bg-slate-800 hidden sm:block"></div>

            {/* Threshold Control with Integrated Meter */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase">
                    <Volume2 className="w-3 h-3" />
                    <span>Threshold: {threshold.toFixed(3)}</span>
                </div>
                <div className="relative w-40 h-8 flex items-center">
                    {/* Meter Background */}
                    <div className="absolute inset-0 bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                         {/* Signal Level */}
                         <div 
                             className={`h-full transition-all duration-75 ease-out ${currentLevel > threshold ? 'bg-green-500' : 'bg-green-800/60'}`}
                             style={{ width: `${signalPercent}%` }}
                         />
                    </div>
                    
                    {/* Range Input (Slider) */}
                    <input 
                        type="range" 
                        min="0.001" 
                        max={maxThresholdDisplay} 
                        step="0.001" 
                        value={threshold}
                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                        className="relative w-full h-full appearance-none bg-transparent cursor-pointer z-10
                            focus:outline-none
                            [&::-webkit-slider-thumb]:appearance-none
                            [&::-webkit-slider-thumb]:w-1.5
                            [&::-webkit-slider-thumb]:h-8
                            [&::-webkit-slider-thumb]:bg-blue-400
                            [&::-webkit-slider-thumb]:rounded-sm
                            [&::-webkit-slider-thumb]:shadow-lg
                            [&::-moz-range-thumb]:w-1.5
                            [&::-moz-range-thumb]:h-8
                            [&::-moz-range-thumb]:bg-blue-400
                            [&::-moz-range-thumb]:border-none
                            [&::-moz-range-thumb]:rounded-sm
                        "
                        title="Adjust noise threshold"
                    />
                </div>
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-[95vw] space-y-6">
        
        {/* Input & Active Line */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <section className="col-span-1 bg-slate-900/50 border border-slate-800 rounded-xl p-4 backdrop-blur-sm h-full flex flex-col">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Source Text</label>
                </div>
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="w-full flex-1 bg-slate-950 border border-slate-700 rounded-lg p-3 font-mono text-xs text-slate-300 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                    placeholder="Enter text..."
                />
            </section>

            <section className="col-span-1 md:col-span-2 flex flex-col justify-center items-center bg-slate-900 rounded-xl border border-slate-700 p-6 relative overflow-hidden min-h-[160px]">
                <div className="absolute top-2 right-4 text-xs text-slate-500">
                    Line {currentLineIndex + 1}/{lines.length}
                </div>
                <div className="text-center">
                    <p className="text-4xl md:text-5xl font-mono tracking-widest text-white drop-shadow-lg break-all">
                        {currentLineText}
                    </p>
                </div>
            </section>
        </div>

        {/* Visualization */}
        <section className="w-full bg-slate-900 rounded-xl p-4 border border-slate-800 shadow-2xl overflow-hidden min-h-[200px]">
            <Timeline 
                idealSignals={idealSignals} 
                userSignals={userSignals} 
                wpm={wpm}
                isListening={isListening}
                activeSignal={activeSignal}
            />
        </section>

        {/* Controls */}
        <div className="flex flex-col items-center gap-2 pb-8">
            <section className="flex flex-wrap justify-center items-center gap-4">
                <button 
                    onClick={handlePrevLine}
                    disabled={currentLineIndex === 0}
                    className="p-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-full font-semibold transition-all border border-slate-700"
                    title="Previous Line (Left Arrow)"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>

                <button 
                    onClick={handleRestart}
                    className={`flex items-center gap-2 px-8 py-3 rounded-full font-bold shadow-lg transition-all transform hover:-translate-y-0.5 ${
                        isListening 
                        ? 'bg-slate-700 hover:bg-slate-600 text-white' 
                        : 'bg-green-600 hover:bg-green-500 text-white hover:shadow-green-500/20'
                    }`}
                    title="Restart Recording (Up/Down Arrow)"
                >
                    <RotateCcw className="w-5 h-5" />
                    <span>{isListening ? 'Restart' : 'Start'}</span>
                </button>

                <button 
                    onClick={handleNextLine}
                    disabled={currentLineIndex >= lines.length - 1}
                    className="p-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-full font-semibold transition-all border border-slate-700"
                    title="Next Line (Right Arrow)"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </section>
            
            <p className="text-slate-500 text-xs font-mono">
                (use keyboard left/right, down for restart)
            </p>
        </div>

      </main>
    </div>
  );
};

export default App;