
import React, { useState, useRef, useEffect } from 'react';
import { generateTextFast, generateSearchResponse } from '../services/geminiService';

const Terminal: React.FC = () => {
    const [history, setHistory] = useState<Array<{type: 'in' | 'out', text: string}>>([
        { type: 'out', text: 'SYSTEM CONNECTED' },
        { type: 'out', text: 'USER: ARCHETYPE MAGIS' },
        { type: 'out', text: 'TYPE "help" FOR COMMANDS' }
    ]);
    const [input, setInput] = useState('');
    const endRef = useRef<HTMLDivElement>(null);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history]);

    const handleCommand = async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !processing) {
            const cmd = input.trim();
            setInput('');
            setHistory(prev => [...prev, { type: 'in', text: cmd }]);
            setProcessing(true);

            let response = '';

            try {
                if (cmd.startsWith('ai ')) {
                    const rawArgs = cmd.replace('ai ', '');
                    let userPrompt: string;
                    let systemPrompt: string;
                    
                    const separator = '||';
                    if (rawArgs.includes(separator)) {
                        const parts = rawArgs.split(separator);
                        systemPrompt = parts[0].trim();
                        userPrompt = parts.slice(1).join(separator).trim();
                    } else {
                        systemPrompt = "You are a cyberpunk OS terminal assistant. Be concise, technical, and atmospheric.";
                        userPrompt = rawArgs.trim();
                    }

                    if (userPrompt) {
                        const text = await generateTextFast(userPrompt, systemPrompt);
                        response = text || "NO DATA RETURNED.";
                    } else {
                        response = "ERROR: User prompt is required for the 'ai' command.";
                    }
                } 
                else if (cmd.startsWith('search ')) {
                    const query = cmd.replace('search ', '');
                    const res = await generateSearchResponse(query);
                    response = res.text || "No results found.";
                    if (res.grounding) {
                        // Very simple formatting of grounding
                        response += "\n\nSOURCES:";
                        res.grounding.forEach((chunk: any) => {
                           if(chunk.web?.uri) response += `\n- ${chunk.web.title}: ${chunk.web.uri}`;
                        });
                    }
                }
                else if (cmd.startsWith('login ')) {
                     const key = cmd.replace('login ', '').trim();
                     localStorage.setItem('geminiKey', key);
                     if (typeof process !== 'undefined' && process.env) {
                         process.env.API_KEY = key; // Mock for current session
                     }
                     response = "NEURAL KEY UPDATED. REBOOT RECOMMENDED.";
                }
                else {
                    switch (cmd.toLowerCase()) {
                        case 'help':
                            response = "COMMANDS:\n- ai [prompt]: Fast AI Chat (Default System)\n- ai [system] || [prompt]: AI Chat with System Prompt\n- search [query]: Google Search Grounding\n- login [key]: Set API Key\n- about: System Info\n- clear: Clear terminal";
                            break;
                        case 'about':
                            response = "SYSTEM_DECODE_MAGIS // v12.0 FLUX\n\nCORE: Google Gemini 2.5/3.0\nMODULES: Veo, Imagen, Live, Thinking\nSTATUS: ONLINE\n\nA cyberpunk OS dashboard for multimodal creation and analysis.";
                            break;
                        case 'clear':
                            setHistory([]);
                            setProcessing(false);
                            return;
                        default:
                            response = "UNKNOWN COMMAND.";
                    }
                }
            } catch (err) {
                response = "ERROR EXECUTING COMMAND.";
            }

            setHistory(prev => [...prev, { type: 'out', text: response }]);
            setProcessing(false);
        }
    };

    return (
        <div className="h-full flex flex-col font-mono text-neon-purple p-2 text-sm">
            <div className="flex-1 overflow-y-auto space-y-1">
                {history.map((line, i) => (
                    <div key={i} className={`${line.type === 'in' ? 'text-white' : 'text-neon-purple'} whitespace-pre-wrap break-words`}>
                        {line.type === 'in' ? '> ' : ''}{line.text}
                    </div>
                ))}
                {processing && <div className="animate-pulse text-neon-cyan">PROCESSING...</div>}
                <div ref={endRef} />
            </div>
            <div className="flex items-center gap-2 border-t border-neon-purple/50 pt-2 mt-2">
                <span className="text-white">{'>'}</span>
                <input 
                    className="flex-1 bg-transparent border-none outline-none text-white placeholder-neon-purple/50"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleCommand}
                    placeholder="ENTER COMMAND..."
                    autoFocus
                />
            </div>
        </div>
    );
};

export default Terminal;
