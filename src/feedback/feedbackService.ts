import { authenticatedFetch, parseApiResponse } from '../services/apiClient';
import { applyFeedbackPolicy } from './feedbackPolicy';
import type { FeedbackEvent } from './feedback.types';

export const submitFeedback = async (event: FeedbackEvent): Promise<void> => {
  const payload = applyFeedbackPolicy(event);
  const response = await authenticatedFetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await parseApiResponse<{ recorded?: boolean }>(
    response,
    'Feedback could not be recorded.'
  );
  if (result.recorded !== true) {
    throw new Error('Feedback could not be recorded.');
  }
};
