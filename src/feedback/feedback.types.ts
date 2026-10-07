import type { OperationErrorCode } from '../domain/errors';
import type { OperationStatus } from '../domain/operations';

export type FeedbackFeature = 'media';
export type FeedbackAction = 'video.generate';
export type FeedbackStatus = Extract<
  OperationStatus,
  'READY' | 'FAILED' | 'TIMEOUT' | 'CANCELLED'
>;

export interface FeedbackEvent {
  requestId: string;
  operationId?: string;
  feature: FeedbackFeature;
  action: FeedbackAction;
  status: FeedbackStatus;
  durationMs: number;
  model: string;
  errorCode?: OperationErrorCode;
  retry: boolean;
  rating?: number;
}
