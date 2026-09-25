import React, { useState, useRef, useEffect } from 'react';
import { generateImage, generateVideo, generateSpeech, analyzeVideo, openApiKeySelection, checkApiKeySelection } from '../services/geminiService';
import { MediaType } from '../types';
import { Video, Image as ImageIcon, Mic, Film } from 'lucide-react';

const MediaStudio: React.FC = () => {
    const [activeTab, setActiveTab] = useState<MediaType>(MediaType.VIDEO_GEN);
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [output, setOutput] = useState<string | null>(null);
    const [status, setStatus] = useState('');
    const [showKeyWarning, setShowKeyWarning] = useState(false);
    
    // Configs
    const [aspectRatio, setAspectRatio] = useState<string>('16:9');
    const [imageSize, setImageSize] = useState<'1K'|'2K'|'4K'>('1K');
    
    // Audio Context
    const audioContextRef = useRef<AudioContext | null>(null);

    // Video Analysis Input
    const [file, setFile] = useState<File | null>(null);

    useEffect(() => {
        setShowKeyWarning(false);
        setStatus('');
        setOutput(null);
    }, [activeTab]);

    const handleGenerate = async () => {
        setLoading(true);
        setOutput(null);
        setStatus('INITIALIZING...');
        setShowKeyWarning(false);

        try {
            if (activeTab === MediaType.VIDEO_GEN) {
                const hasKey = await checkApiKeySelection();
                if (!hasKey) {
                    setStatus('ACCESS DENIED: API KEY REQUIRED');
                    setShowKeyWarning(true);
                    setLoading(false);
                    return;
                }

                setStatus('WARMING UP VEO-3.1...');
                const videoUrl = await generateVideo(prompt, aspectRatio as '16:9' | '9:16');
                setOutput(videoUrl);
                setStatus('RENDER COMPLETE.');
            } 
            else if (activeTab === MediaType.IMAGE_GEN) {
                setStatus('CONFIGURING NANO BANANA PRO...');
                const b64 = await generateImage(prompt, aspectRatio, imageSize);
                setOutput(b64);
                setStatus('GENERATION COMPLETE.');
            }
            else if (activeTab === MediaType.TTS) {
                setStatus('SYNTHESIZING SPEECH...');
                const b64Audio = await generateSpeech(prompt);
                
                // Play audio
                if (!audioContextRef.current) {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
                }
                const ctx = audioContextRef.current;
                
                // Decode
                const binaryString = atob(b64Audio);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                // Gemini TTS returns raw PCM 24kHz mono typically.
                // Ensure we have an even number of bytes for Int16Array
                const alignedLen = len % 2 === 0 ? len : len - 1;
                const dataInt16 = new Int16Array(bytes.buffer, 0, alignedLen / 2);
                
                const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
                const channelData = buffer.getChannelData(0);
                for (let i = 0; i < dataInt16.length; i++) {
                    channelData[i] = dataInt16[i] / 32768.0;
                }
                
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                source.start();
                
                setStatus('PLAYBACK STARTED.');
            }
            else if (activeTab === MediaType.VIDEO_ANALYSIS) {
                if (!file) {
                    setStatus('ERROR: NO VIDEO FILE SELECTED');
                    setLoading(false);
                    return;
                }
                setStatus('UPLOADING TO GEMINI 3 PRO...');
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onloadend = async () => {
                    const b64 = reader.result as string;
                    try {
                        const analysis = await analyzeVideo(b64, file.type, prompt || "Analyze this video");
                        setOutput(analysis ?? 'NO ANALYSIS RETURNED.');
                        setStatus('ANALYSIS COMPLETE.');
                    } catch (err: any) {
                         setStatus('ERROR: ' + err.message);
                    }
                    setLoading(false);
                };
                return; // Async handled in callback
            }
        } catch (e: any) {
            setStatus(`ERROR: ${e.message}`);
            console.error(e);
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col h-full text-neon-red font-mono">
            {/* Tabs */}
            <div className="flex border-b border-neon-red/30 mb-4">
                {[
                    { id: MediaType.VIDEO_GEN, icon: <Video size={16} />, label: 'VEO VIDEO' },
                    { id: MediaType.IMAGE_GEN, icon: <ImageIcon size={16} />, label: 'IMAGEN PRO' },
                    { id: MediaType.TTS, icon: <Mic size={16} />, label: 'VOICE SYNTH' },
                    { id: MediaType.VIDEO_ANALYSIS, icon: <Film size={16} />, label: 'VIDEO IQ' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${activeTab === tab.id ? 'bg-neon-red text-black font-bold' : 'hover:bg-neon-red/20'}`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-auto flex flex-col gap-4">
                {/* Config Controls */}
                <div className="grid grid-cols-2 gap-4">
                    {activeTab !== MediaType.TTS && activeTab !== MediaType.VIDEO_ANALYSIS && (
                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70">ASPECT RATIO</label>
                            <select 
                                value={aspectRatio} 
                                onChange={(e) => setAspectRatio(e.target.value)}
                                className="bg-black border border-neon-red text-neon-red p-1 text-sm outline-none"
                            >
                                <option value="1:1">1:1 (Square)</option>
                                <option value="16:9">16:9 (Landscape)</option>
                                <option value="9:16">9:16 (Portrait)</option>
                                <option value="4:3">4:3</option>
                                <option value="3:4">3:4</option>
                                <option value="21:9">21:9 (Cinema)</option>
                            </select>
                        </div>
                    )}
                    
                    {activeTab === MediaType.IMAGE_GEN && (
                         <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70">SIZE</label>
                            <select 
                                value={imageSize} 
                                onChange={(e) => setImageSize(e.target.value as any)}
                                className="bg-black border border-neon-red text-neon-red p-1 text-sm outline-none"
                            >
                                <option value="1K">1K</option>
                                <option value="2K">2K</option>
                                <option value="4K">4K</option>
                            </select>
                        </div>
                    )}

                    {activeTab === MediaType.VIDEO_ANALYSIS && (
                         <div className="flex flex-col gap-1 col-span-2">
                             <label className="text-xs opacity-70">INPUT SOURCE</label>
                             <input 
                                type="file" 
                                accept="video/*" 
                                onChange={(e) => setFile(e.target.files?.[0] || null)} 
                                className="text-sm file:bg-neon-red file:text-black file:border-0 file:mr-4 file:py-1 file:px-2 file:font-mono file:font-bold hover:file:bg-neon-red/80 cursor-pointer" 
                             />
                         </div>
                    )}
                </div>

                {/* Prompt Input */}
                <div className="flex flex-col gap-1">
                     <label className="text-xs opacity-70">PROMPT INSTRUCTION</label>
                     <textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="w-full bg-black/50 border border-neon-red text-white p-3 min-h-[80px] outline-none focus:shadow-glow-red"
                        placeholder={activeTab === MediaType.VIDEO_ANALYSIS ? "Ask something about the video..." : "Describe the output..."}
                     />
                </div>

                {/* API Key Warning */}
                {showKeyWarning && (
                    <div className="border border-neon-gold bg-neon-gold/10 p-3 mb-2 animate-pulse">
                        <div className="text-neon-gold text-xs font-bold mb-2">⚠ ACCESS RESTRICTED: PAID API KEY REQUIRED</div>
                        <button 
                            onClick={openApiKeySelection}
                            className="w-full bg-neon-gold text-black font-bold text-xs py-2 hover:bg-white transition-colors"
                        >
                            AUTHENTICATE KEY
                        </button>
                    </div>
                )}

                {/* Action Button */}
                <button 
                    onClick={handleGenerate}
                    disabled={loading}
                    className="w-full py-3 bg-neon-red/10 border border-neon-red hover:bg-neon-red hover:text-black transition-all font-bold tracking-widest"
                >
                    {loading ? 'PROCESSING...' : 'EXECUTE'}
                </button>

                {/* Status Log */}
                <div className="font-mono text-xs text-neon-red/70 border-t border-dashed border-neon-red/30 pt-2">
                    {'>'} SYSTEM_LOG: {status}
                </div>

                {/* Output Display */}
                {output && (
                    <div className="flex-1 bg-black/50 border border-neon-red/30 flex items-center justify-center p-2 min-h-[200px] relative overflow-hidden">
                        {activeTab === MediaType.VIDEO_GEN && (
                            <video src={output} controls autoPlay loop className="max-w-full max-h-[300px]" />
                        )}
                        {activeTab === MediaType.IMAGE_GEN && (
                            <img src={output} alt="Generated" className="max-w-full max-h-[300px] object-contain" />
                        )}
                        {activeTab === MediaType.VIDEO_ANALYSIS && (
                            <div className="text-white whitespace-pre-wrap p-2 h-full w-full overflow-auto font-rajdhani text-sm">
                                {output}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MediaStudio;
