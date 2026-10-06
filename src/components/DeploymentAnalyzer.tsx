import React, { useState } from 'react';
import { generateThinking } from '../services/geminiService';
import { MatrixStats } from '../types';

interface Props {
    stats: MatrixStats;
}

const DeploymentAnalyzer: React.FC<Props> = ({ stats }) => {
    const [result, setResult] = useState('');
    const [loading, setLoading] = useState(false);

    const runThinking = async () => {
        setLoading(true);
        setResult('');
        try {
            const context = `Project Stats: Strategy ${stats.s}%, Execution ${stats.e}%, Connections ${stats.c}%, Monetization ${stats.m}%.`;
            const prompt = "Act as an Elite DevOps Architect. Evaluate the stability and scalability of this deployment pipeline based on the stats. Provide a technical risk assessment report with 4 key points and a final risk score. Use high-level terminology.";
            const text = await generateThinking(prompt, context);
            setResult(text || "NO DATA RETURNED");
        } catch (error) {
            setResult("THINKING PROCESS FAILED. TOKENS EXHAUSTED OR NETWORK ERROR.");
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col h-full font-mono text-neon-green">
            <div className="mb-4 text-sm text-green-400/80">
                {'>'} MODULE: MAGISTRAL DIAGNOSTIC<br/>
                {'>'} MODEL: GEMINI 3.0 PRO (THINKING)<br/>
                {'>'} BUDGET: 32768 TOKENS
            </div>
            
            <div className="flex-1 bg-black/30 border border-green-900/50 p-4 rounded mb-4 overflow-auto text-sm leading-relaxed whitespace-pre-wrap shadow-inner font-rajdhani">
                {loading ? (
                    <div className="flex flex-col gap-2">
                        <span className="animate-pulse">INITIALIZING DEEP THINKING PROTOCOLS...</span>
                        <span className="animate-pulse delay-75 text-green-700">TRACING NEURAL PATHWAYS...</span>
                        <span className="animate-pulse delay-150 text-green-900">SIMULATING SCENARIOS...</span>
                    </div>
                ) : result || "// WAITING FOR DIAGNOSTIC REQUEST..."}
            </div>

            <button
                onClick={runThinking}
                disabled={loading}
                className="w-full py-3 border border-neon-green text-neon-green hover:bg-neon-green hover:text-black transition-all uppercase tracking-[0.2em] font-bold"
            >
                RUN SCALABILITY DIAGNOSIS
            </button>
        </div>
    );
};

export default DeploymentAnalyzer;