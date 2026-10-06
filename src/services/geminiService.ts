import { GoogleGenAI, Modality } from "@google/genai";
import { supabase } from "./supabaseClient";

type ApiResponse = Record<string, unknown>;

const authenticatedHeaders = async () => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('Sign in to use MAGIS.');
    return { Authorization: `Bearer ${accessToken}` };
};

const requestApi = async <T extends ApiResponse>(
    action: string,
    payload: Record<string, unknown>
): Promise<T> => {
    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...await authenticatedHeaders(),
        },
        body: JSON.stringify({ action, payload }),
    });

    let data: ApiResponse = {};
    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'MAGIS API request failed.');
    }

    return data as T;
};

// Provider credentials stay server-side. The browser only talks to MAGIS.
export const generateTextFast = async (prompt: string, systemInstruction?: string) => {
    const data = await requestApi<{ text: string }>('text', {
        prompt,
        systemInstruction,
    });
    return data.text;
};

export const generateThinking = async (prompt: string, context: string) => {
    const data = await requestApi<{ text: string }>('thinking', {
        prompt,
        context,
    });
    return data.text;
};

export const generateSearchResponse = async (query: string) => {
    return requestApi<{ text: string; grounding: Array<any> }>('search', { query });
};

export const generateImage = async (
    prompt: string,
    aspectRatio: string,
    size: '1K' | '2K' | '4K' = '1K'
) => {
    const data = await requestApi<{ image: string }>('image', {
        prompt,
        aspectRatio,
        size,
    });
    return data.image;
};

export const generateVideo = async (
    prompt: string,
    aspectRatio: '16:9' | '9:16',
    _startImageBase64?: string
) => {
    const start = await requestApi<{ operationId: string }>('videoStart', {
        prompt,
        aspectRatio,
    });

    for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const status = await requestApi<{
            done: boolean;
            videoUrl?: string | null;
        }>('videoStatus', {
            operationId: start.operationId,
        });

        if (status.done) {
            if (!status.videoUrl) {
                throw new Error('Video generation completed without a media URL.');
            }
            return fetchGeneratedVideo(status.videoUrl);
        }
    }

    throw new Error('Video generation timed out. The provider operation may still be processing.');
};

export const generateSpeech = async (text: string) => {
    const data = await requestApi<{ audio: string }>('speech', { text });
    return data.audio;
};

export const analyzeVideo = async (
    videoBase64: string,
    mimeType: string,
    prompt: string
) => {
    const data = await requestApi<{ text: string }>('videoAnalysis', {
        videoBase64,
        mimeType,
        prompt,
    });
    return data.text;
};

// Live API receives a short-lived server-issued token, never the provider key.
export const getLiveClient = async () => {
    const response = await fetch('/api/live-token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...await authenticatedHeaders(),
        },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.token !== 'string') {
        throw new Error(typeof data.error === 'string' ? data.error : 'Live authentication failed.');
    }

    return new GoogleGenAI({ apiKey: data.token });
};

export const fetchGeneratedVideo = async (videoUrl: string) => {
    const response = await fetch(videoUrl, {
        headers: await authenticatedHeaders(),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
            typeof data.error === 'string'
                ? data.error
                : 'Unable to download generated video.'
        );
    }

    return URL.createObjectURL(await response.blob());
};

export { Modality };
