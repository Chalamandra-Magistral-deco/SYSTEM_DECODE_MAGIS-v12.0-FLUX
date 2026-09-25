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
    // gemini-3-pro-preview with thinking budget
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Context: ${context}\n\nTask: ${prompt}`,
        config: {
            thinkingConfig: { thinkingBudget: 32768 } // Max budget for deep reasoning
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
    
    // Extract grounding chunks manually if needed, or just return text which usually contains citations
    const text = response.text;
    const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    return { text, grounding };
};

// --- Image Generation ---

export const generateImage = async (prompt: string, aspectRatio: string, size: '1K' | '2K' | '4K' = '1K') => {
    const ai = getAI();
    // gemini-3-pro-image-preview
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: prompt,
        config: {
            imageConfig: {
                aspectRatio: aspectRatio as any, // "1:1" | "3:4" | "4:3" | "9:16" | "16:9"
                imageSize: size
            }
        }
    });

    // Extract image
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
    return true; // Fallback if not in that specific env
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
        resolution: '720p', // standard for fast preview
        aspectRatio: aspectRatio
    };

    if (startImageBase64) {
        // Prompt + Image
        const imagePart = {
            imageBytes: startImageBase64.split(',')[1],
            mimeType: 'image/png' // Assuming png or jpeg, user input should handle this
        };
        operation = await ai.models.generateVideos({
            model,
            prompt,
            image: imagePart,
            config
        });
    } else {
        // Text only
        operation = await ai.models.generateVideos({
            model,
            prompt,
            config
        });
    }

    // Poll for completion
    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error("Video generation failed");

    // Fetch the actual video bytes
    const envKey = typeof process !== 'undefined' && process.env ? process.env.API_KEY : undefined;
    const apiKey = envKey || localStorage.getItem('geminiKey') || '';
    const videoRes = await fetch(`${videoUri}&key=${encodeURIComponent(apiKey)}`);
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
    
    // Convert to blob URL for playback or return base64 for manual decoding
    return base64Audio;
};

// --- Video Analysis ---

export const analyzeVideo = async (videoBase64: string, mimeType: string, prompt: string) => {
    const ai = getAI();
    // gemini-3-pro-preview for video understanding
    
    const base64Data = videoBase64.includes(',') ? videoBase64.split(',')[1] : videoBase64;
    const finalMimeType = mimeType || 'video/mp4';
    
    const videoPart = {
        inlineData: {
            mimeType: finalMimeType, 
            data: base64Data
        }
    };
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
            parts: [videoPart, { text: prompt }]
        }
    });
    
    return response.text;
};

// --- Live API Helper ---
// Just exposing the client creation for the component to use
export const getLiveClient = () => {
   return getAI();
}