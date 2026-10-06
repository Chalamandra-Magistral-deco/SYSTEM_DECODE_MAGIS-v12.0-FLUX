import React, { useState, useEffect } from 'react';
import { generateTextFast } from '../services/geminiService';
import { MatrixStats } from '../types';

interface MatrixAnalyzerProps {
  stats: MatrixStats;
  setStats: (stats: MatrixStats) => void;
}

const MatrixAnalyzer: React.FC<MatrixAnalyzerProps> = ({ stats, setStats }) => {
  const [analysis, setAnalysis] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [flowPlan, setFlowPlan] = useState<string>('');
  const [goal, setGoal] = useState('');

  const updateStat = (key: keyof MatrixStats, val: number) => {
    setStats({ ...stats, [key]: val });
  };

  const getPoints = () => {
    const { s, e, c, m } = stats;
    // Center is 50,50. Max radius ~45.
    const y1 = 50 - (s * 0.45);
    const x2 = 50 + (e * 0.45);
    const y3 = 50 + (m * 0.45);
    const x4 = 50 - (c * 0.45);
    return `${50},${y1} ${x2},${50} ${50},${y3} ${x4},${50}`;
  };

  const avg = (stats.s + stats.e + stats.c + stats.m) / 4;
  const statusColor = avg > 75 ? 'text-neon-green' : avg < 40 ? 'text-neon-red' : 'text-neon-cyan';
  const statusMsg = avg > 75 ? "OPTIMAL FLOW DETECTED" : avg < 40 ? "CRITICAL FAILURE IMMINENT" : "SYSTEM STABLE";

  const runAnalysis = async () => {
    setLoading(true);
    try {
        const prompt = `Analyze these stats for a cyberpunk project: Strategy ${stats.s}%, Execution ${stats.e}%, Connections ${stats.c}%, Monetization ${stats.m}%. Give a short, ruthless, cyberpunk style critique. Max 2 sentences.`;
        const result = await generateTextFast(prompt);
        setAnalysis(result || "DATA CORRUPTION.");
    } catch (e) {
        setAnalysis("CONNECTION ERROR.");
    }
    setLoading(false);
  };

  const runFlowPlan = async () => {
      if(!goal) return;
      setPlanLoading(true);
      try {
        const prompt = `Stats: S:${stats.s} E:${stats.e} C:${stats.c} M:${stats.m}. Goal: "${goal}". Generate a 3-step technical action plan. Format as numbered list.`;
        const result = await generateTextFast(prompt);
        setFlowPlan(result || "PLAN GENERATION FAILED.");
      } catch (e) {
          setFlowPlan("ERROR COMPUTING FLUX.");
      }
      setPlanLoading(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-4">
        <div className="flex-1 space-y-4">
          {[
            { label: 'STRATEGY_CORE', key: 's' as const, val: stats.s },
            { label: 'EXECUTION_RATE', key: 'e' as const, val: stats.e },
            { label: 'NET_PROTOCOL', key: 'c' as const, val: stats.c },
            { label: 'CASHFLOW_INDEX', key: 'm' as const, val: stats.m },
          ].map((item) => (
            <div key={item.key}>
              <div className="flex justify-between font-mono text-sm text-neon-gold mb-1">
                <span>{item.label}</span>
                <span>{item.val}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={item.val}
                onChange={(e) => updateStat(item.key, parseInt(e.target.value))}
                className="w-full h-1 bg-gray-700 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-neon-gold [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_10px_#FFD700]"
              />
            </div>
          ))}
        </div>
        
        <div className="w-48 h-48 relative flex items-center justify-center border border-gray-800 rounded bg-black/40">
           <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_10px_rgba(255,215,0,0.3)]">
               <circle cx="50" cy="50" r="45" stroke="#444" fill="none" strokeDasharray="4 2"/>
               <circle cx="50" cy="50" r="30" stroke="#444" fill="none"/>
               <circle cx="50" cy="50" r="15" stroke="#444" fill="none"/>
               <line x1="50" y1="5" x2="50" y2="95" stroke="#333"/>
               <line x1="5" y1="50" x2="95" y2="50" stroke="#333"/>
               <polygon points={getPoints()} fill="rgba(255, 215, 0, 0.4)" stroke="#FFD700" strokeWidth="2"/>
           </svg>
        </div>
      </div>

      <div className="font-mono text-sm">
        <div className={`mb-2 ${statusColor} text-shadow font-bold`}>
            {'>'} STATUS: {statusMsg}
        </div>
        <div className="min-h-[60px] text-white/80 p-2 border border-dashed border-gray-700 bg-black/20">
            {loading ? <span className="animate-pulse text-neon-cyan">ANALYZING...</span> : analysis || "WAITING FOR INPUT..."}
        </div>
        <button 
            onClick={runAnalysis}
            disabled={loading}
            className="w-full mt-2 border border-neon-cyan text-neon-cyan hover:bg-neon-cyan hover:text-black transition-all uppercase py-2 tracking-widest text-xs font-bold"
        >
            Run AI Diagnostic
        </button>
      </div>

      <div className="border-t border-dashed border-gray-600 pt-4">
          <div className="text-neon-purple font-mono mb-2">FLOW_ARCHITECT_v1.0 ✨</div>
          <input 
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="w-full bg-transparent border-b border-neon-purple text-neon-purple outline-none font-mono py-1 mb-2 placeholder-neon-purple/30"
            placeholder="DEFINE TARGET OBJECTIVE..."
          />
          <button 
             onClick={runFlowPlan}
             disabled={planLoading}
             className="w-full border border-neon-purple text-neon-purple hover:bg-neon-purple hover:text-white transition-all uppercase py-2 tracking-widest text-xs font-bold mb-2"
          >
              {planLoading ? "CALCULATING..." : "GENERATE FLOW PLAN"}
          </button>
          <div className="whitespace-pre-wrap text-xs font-mono text-white/70 min-h-[50px]">
              {flowPlan}
          </div>
      </div>
    </div>
  );
};

export default MatrixAnalyzer;