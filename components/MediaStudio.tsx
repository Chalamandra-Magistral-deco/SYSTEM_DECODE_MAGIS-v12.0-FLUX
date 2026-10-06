import React, { useState, useRef, useEffect } from 'react';
import { generateImage, generateVideo, generateSpeech, analyzeVideo } from '../services/geminiService';
import { MediaType } from '../types';
import { Video, Image as ImageIcon, Mic, Film } from 'lucide-react';

const MAX_VIDEO_BYTES = 3_000_000;

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read video file.'));
    reader.onload = () => {
        if (typeof reader.result !== 'string') {
            reject(new Error('Unable to encode video file.'));
            return;
        }
        resolve(reader.result);
    };
    reader.readAsDataURL(file);
});

const MediaStudio: React.FC = () => {
    const [activeTab, setActiveTab] = useState<MediaType>(MediaType.VIDEO_GEN);
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [output, setOutput] = useState<string | null>(null);
    const [status, setStatus] = useState('');

    const [aspectRatio, setAspectRatio] = useState<string>('16:9');
    const [imageSize, setImageSize] = useState<'1K'|'2K'|'4K'>('1K');
    const audioContextRef = useRef<AudioContext | null>(null);
    const [file, setFile] = useState<File | null>(null);

    useEffect(() => {
        setStatus('');
        setOutput(null);
    }, [activeTab]);

    useEffect(() => {
        return () => {
            void audioContextRef.current?.close();
            audioContextRef.current = null;
        };
    }, []);

    const handleGenerate = async () => {
        if (loading) return;

        setLoading(true);
        setOutput(null);
        setStatus('INITIALIZING...');

        try {
            if (activeTab === MediaType.VIDEO_GEN) {
                const ratio = aspectRatio === '9:16' ? '9:16' : '16:9';
                setStatus('WARMING UP VEO-3.1...');
                const videoUrl = await generateVideo(prompt, ratio);
                setOutput(videoUrl);
                setStatus('RENDER COMPLETE.');
            }
            else if (activeTab === MediaType.IMAGE_GEN) {
                setStatus('CONFIGURING NANO BANANA 2...');
                const b64 = await generateImage(prompt, aspectRatio, imageSize);
                setOutput(b64);
                setStatus('GENERATION COMPLETE.');
            }
            else if (activeTab === MediaType.TTS) {
                setStatus('SYNTHESIZING SPEECH...');
                const b64Audio = await generateSpeech(prompt);

                if (!audioContextRef.current) {
                    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
                    if (!AudioContextCtor) throw new Error('Web Audio API is unavailable.');
                    audioContextRef.current = new AudioContextCtor({sampleRate: 24000});
                }

                const ctx = audioContextRef.current;
                const binaryString = atob(b64Audio);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

                const alignedLen = len - (len % 2);
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
                    return;
                }
                if (file.size > MAX_VIDEO_BYTES) {
                    setStatus('ERROR: VIDEO MUST BE 3 MB OR SMALLER');
                    return;
                }

                setStatus('ANALYZING VIDEO...');
                const b64 = await readFileAsDataUrl(file);
                const analysis = await analyzeVideo(
                    b64,
                    file.type || 'video/mp4',
                    prompt || 'Analyze this video'
                );
                setOutput(analysis ?? 'NO ANALYSIS RETURNED.');
                setStatus('ANALYSIS COMPLETE.');
            }
        } catch (e: any) {
            console.error(e);
            setStatus(`ERROR: ${e?.message || 'Request failed.'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full text-neon-red font-mono">
            <div className="flex border-b border-neon-red/30 mb-4">
                {[
                    { id: MediaType.VIDEO_GEN, icon: <Video size={16} />, label: 'VEO VIDEO' },
                    { id: MediaType.IMAGE_GEN, icon: <ImageIcon size={16} />, label: 'IMAGEN PRO' },
                    { id: MediaType.TTS, icon: <Mic size={16} />, label: 'VOICE SYNTH' },
                    { id: MediaType.VIDEO_ANALYSIS, icon: <Film size={16} />, label: 'VIDEO IQ' },
                ].map(tab => (
                    <button
                        type="button"
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${activeTab === tab.id ? 'bg-neon-red text-black font-bold' : 'hover:bg-neon-red/20'}`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-auto flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                    {activeTab !== MediaType.TTS && activeTab !== MediaType.VIDEO_ANALYSIS && (
                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70" htmlFor="media-aspect-ratio">ASPECT RATIO</label>
                            <select
                                id="media-aspect-ratio"
                                value={activeTab === MediaType.VIDEO_GEN ? (aspectRatio === '9:16' ? '9:16' : '16:9') : aspectRatio}
                                onChange={(e) => setAspectRatio(e.target.value)}
                                className="bg-black border border-neon-red text-neon-red p-1 text-sm outline-none"
                            >
                                {activeTab === MediaType.VIDEO_GEN ? (
                                    <>
                                        <option value="16:9">16:9 (Landscape)</option>
                                        <option value="9:16">9:16 (Portrait)</option>
                                    </>
                                ) : (
                                    <>
                                        <option value="1:1">1:1 (Square)</option>
                                        <option value="16:9">16:9 (Landscape)</option>
                                        <option value="9:16">9:16 (Portrait)</option>
                                        <option value="4:3">4:3</option>
                                        <option value="3:4">3:4</option>
                                        <option value="21:9">21:9 (Cinema)</option>
                                    </>
                                )}
                            </select>
                        </div>
                    )}

                    {activeTab === MediaType.IMAGE_GEN && (
                        <div className="flex flex-col gap-1">
                            <label className="text-xs opacity-70" htmlFor="media-image-size">SIZE</label>
                            <select
                                id="media-image-size"
                                value={imageSize}
                                onChange={(e) => setImageSize(e.target.value as '1K'|'2K'|'4K')}
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
                            <label className="text-xs opacity-70" htmlFor="video-source">INPUT SOURCE</label>
                            <input
                                id="video-source"
                                type="file"
                                accept="video/*"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                                className="text-sm file:bg-neon-red file:text-black file:border-0 file:mr-4 file:py-1 file:px-2 file:font-mono file:font-bold hover:file:bg-neon-red/80 cursor-pointer"
                            />
                            <span className="text-[10px] opacity-60">MAX 3 MB</span>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs opacity-70" htmlFor="media-prompt">PROMPT INSTRUCTION</label>
                    <textarea
                        id="media-prompt"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="w-full bg-black/50 border border-neon-red text-white p-3 min-h-[80px] outline-none focus:shadow-glow-red"
                        placeholder={activeTab === MediaType.VIDEO_ANALYSIS ? "Ask something about the video..." : "Describe the output..."}
                    />
                </div>

                <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={loading}
                    className="w-full py-3 bg-neon-red/10 border border-neon-red hover:bg-neon-red hover:text-black transition-all font-bold tracking-widest"
                >
                    {loading ? 'PROCESSING...' : 'EXECUTE'}
                </button>

                <div className="font-mono text-xs text-neon-red/70 border-t border-dashed border-neon-red/30 pt-2">
                    {'>'} SYSTEM_LOG: {status}
                </div>

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
