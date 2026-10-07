import type { OperationError } from './errors';

export type OperationStatus =
  | 'IDLE'
  | 'VALIDATING'
  | 'STARTING'
  | 'RUNNING'
  | 'POLLING'
  | 'READY'
  | 'FAILED'
  | 'TIMEOUT'
  | 'CANCELLED';

export interface OperationState<TResult = unknown> {
  status: OperationStatus;
  requestId: string;
  operationId?: string;
  attempt: number;
  retry: boolean;
  startedAt?: number;
  elapsedMs: number;
  result?: TResult;
  error?: OperationError;
}
