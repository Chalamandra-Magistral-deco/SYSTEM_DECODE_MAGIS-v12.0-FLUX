import { normalizeError } from '../domain/errors';
import type { FeedbackEvent } from './feedback.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const applyFeedbackPolicy = (event: FeedbackEvent): FeedbackEvent => {
  if (
    !UUID_PATTERN.test(event.requestId)
    || (event.operationId !== undefined && !UUID_PATTERN.test(event.operationId))
    || !Number.isSafeInteger(event.durationMs)
    || event.durationMs < 0
    || (event.rating !== undefined && (!Number.isInteger(event.rating) || event.rating < 1 || event.rating > 5))
  ) {
    throw normalizeError(new Error('Feedback data is invalid.'), 400);
  }

  return {
    requestId: event.requestId,
    ...(event.operationId ? { operationId: event.operationId } : {}),
    feature: event.feature,
    action: event.action,
    status: event.status,
    durationMs: event.durationMs,
    model: event.model,
    ...(event.errorCode ? { errorCode: event.errorCode } : {}),
    retry: event.retry,
    ...(event.rating !== undefined ? { rating: event.rating } : {}),
  };
};
