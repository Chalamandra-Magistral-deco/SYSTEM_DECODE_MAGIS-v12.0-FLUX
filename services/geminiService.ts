import { GoogleGenAI, Modality } from "@google/genai";

const getAI = () => {
    const envKey = typeof process !== 'undefined' && process.env ? process.env.API_KEY : undefined;
    const apiKey = envKey || localStorage.getItem('geminiKey') || '';
    if (!apiKey) throw new Error("API Key not found");
    return new GoogleGenAI({ apiKey });
};

// --- Text & Reasoning ---

export const generateTextFast = async (prompt: string, systemInstruction?: string) => {
    const ai = getAI();
    // gemini-2.5-flash-lite for fast responses
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
        config: systemInstruction ? { systemInstruction } : undefined
    });
    return response.text;
};

export const generateThinking = async (prompt: string, context: string) => {
    const ai = getAI();
    // Gemini 3.1 Pro preview for deep reasoning
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `Context: ${context}\n\nTask: ${prompt}`,
        config: {
            thinkingConfig: { thinkingBudget: 32768 }
        }
    });
    return response.text;
};

// --- Search Grounding ---

export const generateSearchResponse = async (query: string) => {
    const ai = getAI();
    // gemini-2.5-flash with googleSearch
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: query,
        config: {
            tools: [{ googleSearch: {} }]
        }
    });

    const text = response.text;
    const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    return { text, grounding };
};

// --- Image Generation ---

export const generateImage = async (prompt: string, aspectRatio: string, size: '1K' | '2K' | '4K' = '1K') => {
    const ai = getAI();

    // Nano Banana Pro / Gemini 3 Pro Image
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image',
        contents: prompt,
        config: {
            imageConfig: {
                aspectRatio: aspectRatio as any,
                imageSize: size
            }
        }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
    }
    throw new Error("No image generated");
};

// --- Video Generation (Veo) ---

export const checkApiKeySelection = async () => {
    if ((window as any).aistudio && (window as any).aistudio.hasSelectedApiKey) {
        return await (window as any).aistudio.hasSelectedApiKey();
    }
    return true;
};

export const openApiKeySelection = async () => {
    if ((window as any).aistudio && (window as any).aistudio.openSelectKey) {
        await (window as any).aistudio.openSelectKey();
    }
};

export const generateVideo = async (prompt: string, aspectRatio: '16:9' | '9:16', startImageBase64?: string) => {
    const ai = getAI();

    const model = 'veo-3.1-fast-generate-preview';

    let operation;
    const config = {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: aspectRatio
    };

    if (startImageBase64) {
        const imagePart = {
            imageBytes: startImageBase64.split(',')[1],
            mimeType: 'image/png'
        };
        operation = await ai.models.generateVideos({
            model,
            prompt,
            image: imagePart,
            config
        });
    } else {
        operation = await ai.models.generateVideos({
            model,
            prompt,
            config
        });
    }

    // Poll for completion with a bounded timeout.
    const POLL_INTERVAL_MS = 5000;
    const MAX_POLL_ATTEMPTS = 180;
    let pollAttempts = 0;

    while (!operation.done) {
        if (++pollAttempts > MAX_POLL_ATTEMPTS) {
            throw new Error(
                `Video generation timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`
            );
        }
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error("Video generation failed");

    // Download the generated video using the documented API-key header.
    const envKey = typeof process !== 'undefined' && process.env ? process.env.API_KEY : undefined;
    const apiKey = envKey || localStorage.getItem('geminiKey') || '';
    const videoRes = await fetch(videoUri, {
        headers: { 'x-goog-api-key': apiKey }
    });
    if (!videoRes.ok) {
        throw new Error(`Video download failed: ${videoRes.status} ${videoRes.statusText}`);
    }
    const blob = await videoRes.blob();
    return URL.createObjectURL(blob);
};

// --- TTS ---

export const generateSpeech = async (text: string) => {
    const ai = getAI();
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated");

    return base64Audio;
};

// --- Video Analysis ---

export const analyzeVideo = async (videoBase64: string, mimeType: string, prompt: string) => {
    const ai = getAI();

    const base64Data = videoBase64.includes(',') ? videoBase64.split(',')[1] : videoBase64;
    const finalMimeType = mimeType || 'video/mp4';

    const videoPart = {
        inlineData: {
            mimeType: finalMimeType,
            data: base64Data
        }
    };

    const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: {
            parts: [videoPart, { text: prompt }]
        }
    });

    return response.text;
};

// --- Live API Helper ---

export const getLiveClient = () => {
   return getAI();
};
