import React, { useState, useRef, useEffect } from 'react';
import { getLiveClient } from '../services/geminiService';
import { Modality } from "@google/genai";
import { Mic, MicOff, Radio, Volume2 } from 'lucide-react';

const LiveConversation: React.FC = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [volume, setVolume] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [logs, setLogs] = useState<string[]>([]);
    
    // Refs for session management to avoid closure staleness
    const sessionRef = useRef<any>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    
    // Helper to log
    const log = (msg: string) => setLogs(prev => [...prev.slice(-4), msg]);

    const connect = async () => {
        try {
            log("INITIALIZING LIVE CONNECTION...");
            const ai = getLiveClient();
            
            // Audio Contexts
            const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
            const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
            inputAudioContextRef.current = inputCtx;
            outputAudioContextRef.current = outputCtx;
            
            let nextStartTime = 0;
            const outputNode = outputCtx.createGain();
            outputNode.connect(outputCtx.destination); // Ensure output connects to speakers

            // Stream Setup
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            
            const session = await ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                   responseModalities: [Modality.AUDIO],
                   speechConfig: {
                       voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                   },
                   systemInstruction: "You are Magis, a futuristic AI assistant. Be concise and sound like a cyberpunk interface."
                },
                callbacks: {
                    onopen: () => {
                        log("CONNECTION ESTABLISHED.");
                        setIsConnected(true);
                        
                        // Audio Processing Setup
                        const source = inputCtx.createMediaStreamSource(stream);
                        const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
                        
                        scriptProcessor.onaudioprocess = (e) => {
                            if (!sessionRef.current) return;
                            const inputData = e.inputBuffer.getChannelData(0);
                            
                            // PCM 16 conversion
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) {
                                int16[i] = inputData[i] * 32768;
                            }
                            
                            // Visualize volume simply
                            let sum = 0;
                            for(let i=0; i<l; i+=100) sum += Math.abs(inputData[i]);
                            setVolume(Math.min(100, (sum / (l/100)) * 500));

                            // Base64 encode
                            let binary = '';
                            const len = int16.buffer.byteLength;
                            const bytes = new Uint8Array(int16.buffer);
                            for (let i = 0; i < len; i++) {
                                binary += String.fromCharCode(bytes[i]);
                            }
                            const b64 = btoa(binary);

                            sessionRef.current.sendRealtimeInput({
                                media: {
                                    mimeType: 'audio/pcm;rate=16000',
                                    data: b64
                                }
                            });
                        };

                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputCtx.destination);
                    },
                    onmessage: async (msg) => {
                        // Handle Audio Output
                        const b64 = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (b64 && outputAudioContextRef.current) {
                            const ctx = outputAudioContextRef.current;
                            
                            // Decode manually
                            const bin = atob(b64);
                            const bytes = new Uint8Array(bin.length);
                            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                            const data16 = new Int16Array(bytes.buffer);
                            
                            const buffer = ctx.createBuffer(1, data16.length, 24000);
                            const ch = buffer.getChannelData(0);
                            for(let i=0; i<data16.length; i++) ch[i] = data16[i] / 32768.0;

                            const src = ctx.createBufferSource();
                            src.buffer = buffer;
                            src.connect(outputNode);
                            
                            nextStartTime = Math.max(nextStartTime, ctx.currentTime);
                            src.start(nextStartTime);
                            nextStartTime += buffer.duration;
                        }
                    },
                    onclose: () => {
                        log("CONNECTION CLOSED.");
                        setIsConnected(false);
                    },
                    onerror: (e) => {
                        log("ERROR: " + String(e));
                    }
                }
            });
            sessionRef.current = session;

        } catch (e: any) {
            log("FAILED TO CONNECT: " + e.message);
        }
    };

    const disconnect = () => {
        if (sessionRef.current) {
            sessionRef.current.close?.();
            sessionRef.current = null;
        }
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
        if (inputAudioContextRef.current) inputAudioContextRef.current.close();
        if (outputAudioContextRef.current) outputAudioContextRef.current.close();
        setIsConnected(false);
        log("DISCONNECTED MANUALLY.");
        setVolume(0);
    };

    return (
        <div className="flex flex-col h-full items-center justify-center gap-6 text-neon-cyan font-mono relative">
            <div className={`w-40 h-40 rounded-full border-4 flex items-center justify-center transition-all duration-300 ${isConnected ? 'border-neon-cyan shadow-[0_0_50px_#00ffff]' : 'border-gray-700'}`}>
                <div 
                    className="w-full h-full rounded-full bg-neon-cyan/20 flex items-center justify-center transition-transform"
                    style={{ transform: `scale(${1 + volume/100})` }}
                >
                     <Volume2 size={48} className={isConnected ? "animate-pulse" : "opacity-30"} />
                </div>
            </div>

            <div className="flex flex-col items-center gap-2 w-full px-8">
                {isConnected ? (
                     <button onClick={disconnect} className="flex items-center gap-2 px-8 py-3 bg-red-500/20 border border-red-500 hover:bg-red-500 hover:text-white transition-all rounded uppercase tracking-widest font-bold text-red-500">
                        <MicOff /> TERMINATE LINK
                     </button>
                ) : (
                    <button onClick={connect} className="flex items-center gap-2 px-8 py-3 bg-neon-cyan/20 border border-neon-cyan hover:bg-neon-cyan hover:text-black transition-all rounded uppercase tracking-widest font-bold">
                        <Mic /> INITIALIZE NEURAL VOICE
                    </button>
                )}
            </div>
            
            <div className="absolute bottom-0 w-full p-2 text-xs opacity-50 text-center">
                {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>
    );
};

export default LiveConversation;
