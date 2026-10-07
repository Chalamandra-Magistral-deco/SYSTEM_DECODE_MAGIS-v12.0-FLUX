import { GoogleGenAI, Modality } from "@google/genai";
import { normalizeError } from "../domain/errors";
import { authenticatedFetch, parseApiResponse } from "./apiClient";

const requestApi = async <T extends Record<string, unknown>>(
    action: string,
    payload: Record<string, unknown>
): Promise<T> => {
    const response = await authenticatedFetch('/api/gemini', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, payload }),
    });

    return parseApiResponse<T>(response, 'MAGIS API request failed.');
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

interface VideoOperationCallbacks {
    onOperationId?: (operationId: string) => void;
    onPolling?: (attempt: number) => void;
}

export const generateVideo = async (
    prompt: string,
    aspectRatio: '16:9' | '9:16',
    _startImageBase64?: string,
    callbacks?: VideoOperationCallbacks
) => {
    const start = await requestApi<{ operationId: string }>('videoStart', {
        prompt,
        aspectRatio,
    });
    callbacks?.onOperationId?.(start.operationId);

    for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        callbacks?.onPolling?.(attempt + 1);

        const status = await requestApi<{
            done: boolean;
            videoUrl?: string | null;
        }>('videoStatus', {
            operationId: start.operationId,
        });

        if (status.done) {
            if (!status.videoUrl) {
                throw normalizeError(new Error('Video generation completed without a media URL.'), 502);
            }
            return fetchGeneratedVideo(status.videoUrl);
        }
    }

    throw normalizeError(
        new Error('Video generation timed out. The provider operation may still be processing.')
    );
};

export const verifyVideoStatus = async (operationId: string) => {
    const status = await requestApi<{
        done: boolean;
        videoUrl?: string | null;
    }>('videoStatus', { operationId });

    if (!status.done) return { status: 'RUNNING' as const };
    if (!status.videoUrl) return { status: 'FAILED' as const };

    return {
        status: 'READY' as const,
        videoUrl: await fetchGeneratedVideo(status.videoUrl),
    };
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
    const response = await authenticatedFetch('/api/live-token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    const data = await parseApiResponse<{ token?: unknown }>(
        response,
        'Live authentication failed.'
    );
    if (typeof data.token !== 'string') {
        throw normalizeError(new Error('Live authentication failed.'), 502);
    }

    return new GoogleGenAI({ apiKey: data.token });
};

export const fetchGeneratedVideo = async (videoUrl: string) => {
    const response = await authenticatedFetch(videoUrl);

    if (!response.ok) {
        await parseApiResponse(response, 'Unable to download generated video.');
    }

    return URL.createObjectURL(await response.blob());
};

export { Modality };
