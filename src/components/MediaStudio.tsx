import React, { useState, useRef, useEffect } from 'react';
import {
    generateImage,
    generateVideo,
    verifyVideoStatus,
    generateSpeech,
    analyzeVideo,
} from '../services/geminiService';
import { MediaType } from '../types';
import { Video, Image as ImageIcon, Mic, Film } from 'lucide-react';
import { normalizeError } from '../domain/errors';
import { useOperation } from '../hooks/useOperation';
import { submitFeedback } from '../feedback/feedbackService';
import type { FeedbackEvent } from '../feedback/feedback.types';

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
    const [verifyingVideo, setVerifyingVideo] = useState(false);
    const videoOperation = useOperation<string>();
    const videoOperationBusy = ['VALIDATING', 'STARTING', 'RUNNING', 'POLLING']
        .includes(videoOperation.state.status);
    const [output, setOutput] = useState<string | null>(null);
    const [status, setStatus] = useState('');
    const [feedbackEvent, setFeedbackEvent] = useState<FeedbackEvent | null>(null);
    const [feedbackSaving, setFeedbackSaving] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const isBusy = loading || videoOperationBusy || verifyingVideo || feedbackSaving;

    const [aspectRatio, setAspectRatio] = useState<string>('16:9');
    const [imageSize, setImageSize] = useState<'1K'|'2K'|'4K'>('1K');
    const audioContextRef = useRef<AudioContext | null>(null);
    const [file, setFile] = useState<File | null>(null);

    useEffect(() => {
        setStatus('');
        setOutput(null);
        setFeedbackEvent(null);
        setFeedbackMessage('');
    }, [activeTab]);

    useEffect(() => {
        return () => {
            void audioContextRef.current?.close();
            audioContextRef.current = null;
        };
    }, []);

    useEffect(() => () => {
        if (output?.startsWith('blob:')) URL.revokeObjectURL(output);
    }, [output]);

    const saveFeedback = async (event: FeedbackEvent) => {
        setFeedbackEvent(event);
        setFeedbackSaving(true);
        try {
            await submitFeedback(event);
            setFeedbackMessage(event.rating === undefined
                ? 'OPERATION FEEDBACK RECORDED.'
                : 'YOUR RATING HAS BEEN RECORDED.');
        } catch (error) {
            console.error('Unable to record operation feedback.', error);
            setFeedbackMessage(`FEEDBACK NOT RECORDED: ${normalizeError(error).message}`);
        } finally {
            setFeedbackSaving(false);
        }
    };

    const verifyTimedOutVideo = async () => {
        const { operationId, requestId, startedAt } = videoOperation.state;
        if (!operationId || !requestId || startedAt === undefined) return;

        setVerifyingVideo(true);
        setFeedbackMessage('');
        setStatus('VERIFYING PROVIDER STATUS...');
        try {
            const result = await verifyVideoStatus(operationId);
            if (result.status === 'RUNNING') {
                setStatus('STILL PROCESSING. VERIFY AGAIN LATER; THE PROVIDER OPERATION WAS NOT CANCELLED.');
                return;
            }

            const retry = videoOperation.state.retry;
            const event: FeedbackEvent = {
                requestId,
                operationId,
                feature: 'media',
                action: 'video.generate',
                status: result.status,
                durationMs: Date.now() - startedAt,
                model: 'veo-3.1-generate-preview',
                ...(result.status === 'FAILED' ? { errorCode: 'PROVIDER_ERROR' as const } : {}),
                retry,
            };
            if (result.status === 'READY') {
                videoOperation.settleTimedOut({
                    status: 'READY',
                    result: result.videoUrl,
                });
                setOutput(result.videoUrl);
                setStatus('VIDEO GENERATION CONFIRMED COMPLETE.');
            } else {
                const error = normalizeError(
                    new Error('The provider reported that video generation failed.'),
                    502
                );
                videoOperation.settleTimedOut({ status: 'FAILED', error });
                setStatus('THE PROVIDER REPORTED THAT VIDEO GENERATION FAILED.');
            }
            await saveFeedback(event);
        } catch (error) {
            setStatus(normalizeError(error).message);
        } finally {
            setVerifyingVideo(false);
        }
    };

    const handleGenerate = async (isRetry = false) => {
        if (isBusy) return;

        const isVideoOperation = activeTab === MediaType.VIDEO_GEN;
        let requestId: string | undefined;
        let operationId: string | undefined;
        let startedAt: number | undefined;
        if (!isVideoOperation) setLoading(true);
        setOutput(null);
        setStatus('INITIALIZING...');
        if (isVideoOperation) {
            setFeedbackEvent(null);
            setFeedbackMessage('');
        }

        try {
            if (activeTab === MediaType.VIDEO_GEN) {
                const ratio = aspectRatio === '9:16' ? '9:16' : '16:9';
                setStatus('WARMING UP VEO-3.1...');
                const videoUrl = await videoOperation.run(({
                    requestId: currentRequestId,
                    startedAt: operationStartedAt,
                    setStatus: setOperationStatus,
                    setOperationId,
                    setAttempt,
                }) => {
                    requestId = currentRequestId;
                    startedAt = operationStartedAt;
                    setOperationStatus('RUNNING');
                    return generateVideo(prompt, ratio, undefined, {
                        onOperationId: id => {
                            operationId = id;
                            setOperationId(id);
                        },
                        onPolling: attempt => {
                            setOperationStatus('POLLING');
                            setAttempt(attempt);
                        },
                    });
                }, isRetry);
                if (videoUrl === undefined) return;
                setOutput(videoUrl);
                setStatus('RENDER COMPLETE.');
                if (requestId && startedAt !== undefined) {
                    const event: FeedbackEvent = {
                        requestId,
                        operationId,
                        feature: 'media',
                        action: 'video.generate',
                        status: 'READY',
                        durationMs: Date.now() - startedAt,
                        model: 'veo-3.1-generate-preview',
                        retry: isRetry,
                    };
                    await saveFeedback(event);
                }
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
        } catch (e) {
            console.error(e);
            const error = normalizeError(e);
            setStatus(error.message);
            if (isVideoOperation && requestId && startedAt !== undefined) {
                const event: FeedbackEvent = {
                    requestId,
                    operationId,
                    feature: 'media',
                    action: 'video.generate',
                    status: error.code === 'TIMEOUT' ? 'TIMEOUT' : 'FAILED',
                    durationMs: Date.now() - startedAt,
                    model: 'veo-3.1-generate-preview',
                    errorCode: error.code,
                    retry: isRetry,
                };
                await saveFeedback(event);
            }
        } finally {
            if (!isVideoOperation) setLoading(false);
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
                    onClick={() => void handleGenerate()}
                    disabled={isBusy}
                    className="w-full py-3 bg-neon-red/10 border border-neon-red hover:bg-neon-red hover:text-black transition-all font-bold tracking-widest"
                >
                    {isBusy ? 'PROCESSING...' : 'EXECUTE'}
                </button>

                <div className="font-mono text-xs text-neon-red/70 border-t border-dashed border-neon-red/30 pt-2">
                    {'>'} SYSTEM_LOG: {status}
                </div>
                {feedbackEvent && (feedbackSaving || feedbackMessage) && (
                    <div className="text-xs text-neon-red/70" aria-live="polite">
                        {feedbackSaving ? 'SAVING FEEDBACK...' : feedbackMessage}
                    </div>
                )}

                {activeTab === MediaType.VIDEO_GEN
                    && videoOperation.state.status === 'TIMEOUT'
                    && feedbackEvent?.status === 'TIMEOUT'
                    && videoOperation.state.operationId && (
                    <div className="border border-yellow-500/50 bg-yellow-950/20 p-3 text-xs text-yellow-200" aria-live="polite">
                        <p className="font-bold">The request was accepted, but completion is not confirmed.</p>
                        <p className="mt-1">The client timeout did not cancel the provider operation.</p>
                        <div className="flex gap-2 mt-3">
                            <button
                                type="button"
                                onClick={() => void verifyTimedOutVideo()}
                                disabled={isBusy}
                                className="border border-yellow-400 px-3 py-1 hover:bg-yellow-400 hover:text-black disabled:opacity-50"
                            >
                                VERIFY STATUS
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleGenerate(true)}
                                disabled={isBusy}
                                className="border border-yellow-400/50 px-3 py-1 hover:bg-yellow-400/20 disabled:opacity-50"
                            >
                                START NEW GENERATION
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === MediaType.VIDEO_GEN && feedbackEvent?.status === 'FAILED' && (
                    <div className="border border-neon-red/40 bg-red-950/20 p-3 text-xs" aria-live="polite">
                        <p>The video operation failed. No completed video was confirmed.</p>
                        <button
                            type="button"
                            onClick={() => void handleGenerate(true)}
                            disabled={isBusy}
                            className="mt-3 border border-neon-red px-3 py-1 hover:bg-neon-red hover:text-black disabled:opacity-50"
                        >
                            TRY AGAIN
                        </button>
                    </div>
                )}

                {activeTab === MediaType.VIDEO_GEN && feedbackEvent?.status === 'READY' && (
                    <div className="border border-neon-red/30 p-3 text-xs" aria-live="polite">
                        <p>How useful was this result? Rate it from 1 to 5.</p>
                        <div className="flex gap-2 mt-2">
                            {[1, 2, 3, 4, 5].map(rating => (
                                <button
                                    key={rating}
                                    type="button"
                                    aria-label={`Rate result ${rating} out of 5`}
                                    aria-pressed={feedbackEvent.rating === rating}
                                    onClick={() => void saveFeedback({ ...feedbackEvent, rating })}
                                    disabled={feedbackSaving}
                                    className={`border px-3 py-1 disabled:opacity-50 ${feedbackEvent.rating === rating ? 'bg-neon-red text-black' : 'border-neon-red/50 hover:bg-neon-red/20'}`}
                                >
                                    {rating}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

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
