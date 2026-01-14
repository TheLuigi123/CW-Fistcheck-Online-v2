import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { SignalInterval } from '../types';

interface TimelineProps {
  idealSignals: SignalInterval[];
  userSignals: SignalInterval[];
  wpm: number;
  isListening?: boolean;
  activeSignal?: { state: 'on' | 'off', startTime: number, currentTime: number };
}

const SECONDS_PER_ROW = 14;
const ROW_HEIGHT = 100;
const MARGIN = { top: 30, right: 20, bottom: 20, left: 20 };

const Timeline: React.FC<TimelineProps> = ({ idealSignals, userSignals, wpm, isListening, activeSignal }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
           setWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Combine committed signals with the active pending signal for visualization
  const displaySignals = useMemo(() => {
      if (!activeSignal || !isListening) return userSignals;
      
      const duration = activeSignal.currentTime - activeSignal.startTime;
      if (duration <= 0) return userSignals;

      return [
          ...userSignals,
          {
              startTime: activeSignal.startTime,
              duration: duration,
              state: activeSignal.state
          }
      ];
  }, [userSignals, activeSignal, isListening]);

  // 1. Calculate Shift & Alignment
  const alignedUserSignals = useMemo(() => {
    const firstIdeal = idealSignals.find(s => s.state === 'on');
    const firstUser = displaySignals.find(s => s.state === 'on');
    
    // If no ON signal ever recorded/pending, we can't align
    if (!firstUser || !firstIdeal) return [];

    // Shift logic
    const shift = firstIdeal.startTime - firstUser.startTime;
    
    return displaySignals.map(s => ({
        ...s,
        startTime: s.startTime + shift
    }));
  }, [idealSignals, displaySignals]);

  // 2. Determine total duration
  const getLastTime = (signals: SignalInterval[]) => {
      if (signals.length === 0) return 0;
      const last = signals[signals.length - 1];
      return last.startTime + last.duration;
  };

  const maxTime = Math.max(
      getLastTime(idealSignals), 
      getLastTime(alignedUserSignals),
      SECONDS_PER_ROW 
  );

  const rowCount = Math.ceil(maxTime / SECONDS_PER_ROW);
  const totalHeight = rowCount * ROW_HEIGHT;
  const innerWidth = width - MARGIN.left - MARGIN.right;

  // Render using D3
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    if (width === 0) return;

    for (let r = 0; r < rowCount; r++) {
        const rowStartTime = r * SECONDS_PER_ROW;
        const rowEndTime = (r + 1) * SECONDS_PER_ROW;
        
        const g = svg.append("g")
            .attr("transform", `translate(${MARGIN.left}, ${MARGIN.top + (r * ROW_HEIGHT)})`);

        // Row background
        g.append("rect")
            .attr("width", innerWidth)
            .attr("height", ROW_HEIGHT - 10)
            .attr("fill", "#0f172a") 
            .attr("stroke", "#334155") 
            .attr("rx", 4);

        // Scale
        const xScale = d3.scaleLinear()
            .domain([rowStartTime, rowEndTime])
            .range([0, innerWidth]);

        // Axis
        const xAxis = d3.axisBottom(xScale)
            .ticks(14)
            .tickFormat(d => `${d}s`);
        
        g.append("g")
            .attr("transform", `translate(0, ${ROW_HEIGHT - 30})`)
            .call(xAxis)
            .style("color", "#475569")
            .select(".domain").remove();

        const drawSignals = (signals: SignalInterval[], color: string, y: number, label: string) => {
             const visibleSignals = signals.filter(s => {
                 const sEnd = s.startTime + s.duration;
                 return s.state === 'on' && s.startTime < rowEndTime && sEnd > rowStartTime;
             });

             visibleSignals.forEach(s => {
                 const start = Math.max(rowStartTime, s.startTime);
                 const end = Math.min(rowEndTime, s.startTime + s.duration);
                 
                 g.append("rect")
                    .attr("x", xScale(start))
                    .attr("y", y)
                    .attr("width", Math.max(2, xScale(end) - xScale(start)))
                    .attr("height", 20)
                    .attr("fill", color)
                    .attr("rx", 2);
             });
             
             g.append("text")
                .attr("x", -5)
                .attr("y", y + 14)
                .attr("text-anchor", "end")
                .attr("fill", color)
                .attr("font-size", "10px")
                .attr("font-family", "monospace")
                .attr("font-weight", "bold")
                .text(label);
        };

        drawSignals(idealSignals, "#4ade80", 20, "IDEAL");
        drawSignals(alignedUserSignals, "#f87171", 50, "YOU");
    }

    // "Waiting" overlay
    if (isListening && alignedUserSignals.length === 0) {
        // If we are listening, check if there is an active ON signal happening right now
        // activeSignal prop handles this, but if we are here, it means even with activeSignal 
        // we haven't found an 'on' state yet?
        // Note: alignedUserSignals depends on finding an 'on' signal.
        // If activeSignal is 'on', alignedUserSignals should have content.
        
        // So if we are here, it means activeSignal is OFF or null, and history is empty/OFF.
        
        const text = activeSignal?.state === 'on' ? "Receiving..." : "Waiting for first tone...";
        const color = activeSignal?.state === 'on' ? "#4ade80" : "#94a3b8";

        svg.append("text")
           .attr("x", width / 2)
           .attr("y", 80)
           .attr("text-anchor", "middle")
           .attr("fill", color)
           .style("font-family", "Inter")
           .style("font-size", "14px")
           .text(text);
    }

  }, [idealSignals, alignedUserSignals, rowCount, innerWidth, width, isListening, activeSignal]);

  return (
    <div ref={containerRef} className="w-full border border-slate-700 rounded-lg bg-slate-950 shadow-inner">
      <svg 
        ref={svgRef} 
        width={width} 
        height={Math.max(100, totalHeight + MARGIN.top + MARGIN.bottom)} 
        className="block"
      />
    </div>
  );
};

export default Timeline;