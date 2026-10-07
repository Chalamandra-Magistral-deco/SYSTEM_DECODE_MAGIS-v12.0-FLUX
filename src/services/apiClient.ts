import { supabase } from "./supabaseClient";
import { normalizeError } from "../domain/errors";

type ApiResponse = Record<string, unknown>;

export const authenticatedHeaders = async () => {
    if (!supabase) throw normalizeError(new Error('Supabase is not configured.'));
    const { data, error } = await supabase.auth.getSession();
    if (error) throw normalizeError(error);
    const accessToken = data.session?.access_token;
    if (!accessToken) throw normalizeError(new Error('Sign in to use MAGIS.'));
    return { Authorization: `Bearer ${accessToken}` };
};

export const authenticatedFetch = async (
    input: RequestInfo | URL,
    init: RequestInit = {}
) => {
    const headers = new Headers(init.headers);
    for (const [name, value] of Object.entries(await authenticatedHeaders())) {
        headers.set(name, value);
    }
    return fetch(input, { ...init, headers });
};

export const parseApiResponse = async <T extends ApiResponse>(
    response: Response,
    fallbackError: string
): Promise<T> => {
    let data: ApiResponse = {};
    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        const detail = typeof data.error === 'string' ? data.error : fallbackError;
        throw normalizeError(new Error(detail), response.status);
    }

    return data as T;
};
