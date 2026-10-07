import React, { useState, useRef, useEffect } from 'react';
import { getLiveClient } from '../services/geminiService';
import { normalizeError } from '../domain/errors';
import { Modality } from "@google/genai";
import { Mic, MicOff, Volume2 } from 'lucide-react';

const LiveConversation: React.FC = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [volume, setVolume] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);

    const sessionRef = useRef<any>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const outputNodeRef = useRef<GainNode | null>(null);

    const log = (msg: string) => setLogs(prev => [...prev.slice(-4), msg]);

    const disconnect = (message = "DISCONNECTED MANUALLY.") => {
        sessionRef.current?.close?.();
        sessionRef.current = null;

        scriptProcessorRef.current?.disconnect();
        scriptProcessorRef.current = null;

        sourceRef.current?.disconnect();
        sourceRef.current = null;

        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;

        outputNodeRef.current?.disconnect();
        outputNodeRef.current = null;

        void inputAudioContextRef.current?.close();
        inputAudioContextRef.current = null;

        void outputAudioContextRef.current?.close();
        outputAudioContextRef.current = null;

        setIsConnected(false);
        setVolume(0);
        log(message);
    };

    useEffect(() => {
        return () => disconnect("LIVE SESSION CLEANED UP.");
    }, []);

    const connect = async () => {
        try {
            log("INITIALIZING LIVE CONNECTION...");
            const ai = await getLiveClient();

            const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextCtor) throw new Error("Web Audio API is unavailable.");

            const inputCtx = new AudioContextCtor({sampleRate: 16000});
            const outputCtx = new AudioContextCtor({sampleRate: 24000});
            inputAudioContextRef.current = inputCtx;
            outputAudioContextRef.current = outputCtx;

            let nextStartTime = 0;
            const outputNode = outputCtx.createGain();
            outputNode.connect(outputCtx.destination);
            outputNodeRef.current = outputNode;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const session = await ai.live.connect({
                model: 'gemini-3.8-live',
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

                        const source = inputCtx.createMediaStreamSource(stream);
                        const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
                        sourceRef.current = source;
                        scriptProcessorRef.current = scriptProcessor;

                        scriptProcessor.onaudioprocess = (e) => {
                            if (!sessionRef.current) return;
                            const inputData = e.inputBuffer.getChannelData(0);
                            const int16 = new Int16Array(inputData.length);

                            for (let i = 0; i < inputData.length; i++) {
                                const sample = Math.max(-1, Math.min(1, inputData[i]));
                                int16[i] = sample < 0 ? sample * 32768 : sample * 32767;
                            }

                            let sum = 0;
                            for (let i = 0; i < inputData.length; i += 100) {
                                sum += Math.abs(inputData[i]);
                            }
                            setVolume(Math.min(100, (sum / Math.max(1, inputData.length / 100)) * 500));

                            let binary = '';
                            const bytes = new Uint8Array(int16.buffer);
                            for (let i = 0; i < bytes.length; i++) {
                                binary += String.fromCharCode(bytes[i]);
                            }

                            sessionRef.current.sendRealtimeInput({
                                media: {
                                    mimeType: 'audio/pcm;rate=16000',
                                    data: btoa(binary)
                                }
                            });
                        };

                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputCtx.destination);
                    },
                    onmessage: async (msg) => {
                        const b64 = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (!b64 || !outputAudioContextRef.current) return;

                        const ctx = outputAudioContextRef.current;
                        const bin = atob(b64);
                        const bytes = new Uint8Array(bin.length);
                        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

                        const evenLength = bytes.byteLength - (bytes.byteLength % 2);
                        const data16 = new Int16Array(bytes.buffer, 0, evenLength / 2);
                        const buffer = ctx.createBuffer(1, data16.length, 24000);
                        const channel = buffer.getChannelData(0);

                        for (let i = 0; i < data16.length; i++) {
                            channel[i] = data16[i] / 32768;
                        }

                        const src = ctx.createBufferSource();
                        src.buffer = buffer;
                        src.connect(outputNode);

                        nextStartTime = Math.max(nextStartTime, ctx.currentTime);
                        src.start(nextStartTime);
                        nextStartTime += buffer.duration;
                    },
                    onclose: () => {
                        if (sessionRef.current) {
                            sessionRef.current = null;
                            setIsConnected(false);
                            log("CONNECTION CLOSED.");
                        }
                    },
                    onerror: (e) => {
                        log("ERROR: " + String(e));
                    }
                }
            });

            sessionRef.current = session;
        } catch (e) {
            disconnect();
            log("FAILED TO CONNECT: " + normalizeError(e).message);
        }
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
                    <button type="button" onClick={() => disconnect()} className="flex items-center gap-2 px-8 py-3 bg-red-500/20 border border-red-500 hover:bg-red-500 hover:text-white transition-all rounded uppercase tracking-widest font-bold text-red-500">
                        <MicOff /> TERMINATE LINK
                    </button>
                ) : (
                    <button type="button" onClick={connect} className="flex items-center gap-2 px-8 py-3 bg-neon-cyan/20 border border-neon-cyan hover:bg-neon-cyan hover:text-black transition-all rounded uppercase tracking-widest font-bold">
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
