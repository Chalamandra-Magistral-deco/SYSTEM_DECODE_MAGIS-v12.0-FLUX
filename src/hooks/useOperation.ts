import { useCallback, useRef, useState } from 'react';
import { normalizeError, type OperationError } from '../domain/errors';
import type { OperationState, OperationStatus } from '../domain/operations';

interface OperationContext {
  requestId: string;
  startedAt: number;
  setStatus: (status: 'RUNNING' | 'POLLING') => void;
  setOperationId: (operationId: string) => void;
  setAttempt: (attempt: number) => void;
}

interface TimedOutResult<TResult> {
  status: 'READY' | 'FAILED';
  result?: TResult;
  error?: OperationError;
}

type OperationRunner<TResult> = (context: OperationContext) => Promise<TResult>;

const ALLOWED_TRANSITIONS: Record<OperationStatus, OperationStatus[]> = {
  IDLE: ['VALIDATING'],
  VALIDATING: ['STARTING', 'FAILED', 'CANCELLED'],
  STARTING: ['RUNNING', 'FAILED', 'TIMEOUT', 'CANCELLED'],
  RUNNING: ['POLLING', 'READY', 'FAILED', 'TIMEOUT', 'CANCELLED'],
  POLLING: ['POLLING', 'READY', 'FAILED', 'TIMEOUT', 'CANCELLED'],
  READY: ['VALIDATING', 'IDLE'],
  FAILED: ['VALIDATING', 'IDLE'],
  TIMEOUT: ['VALIDATING', 'IDLE', 'READY', 'FAILED'],
  CANCELLED: ['VALIDATING', 'IDLE'],
};

const createInitialState = <TResult,>(): OperationState<TResult> => ({
  status: 'IDLE',
  requestId: '',
  attempt: 0,
  retry: false,
  elapsedMs: 0,
});

export const useOperation = <TResult,>() => {
  const [state, setState] = useState<OperationState<TResult>>(createInitialState);
  const statusRef = useRef<OperationStatus>('IDLE');
  const activeRef = useRef(false);

  const transition = useCallback((status: OperationStatus) => {
    const previousStatus = statusRef.current;
    if (!ALLOWED_TRANSITIONS[previousStatus].includes(status)) {
      throw new Error(`Invalid operation transition: ${previousStatus} → ${status}`);
    }

    statusRef.current = status;
    setState(current => ({
      ...current,
      status,
      elapsedMs: current.startedAt === undefined
        ? current.elapsedMs
        : Date.now() - current.startedAt,
    }));
  }, []);

  const run = useCallback(async (
    runner: OperationRunner<TResult>,
    retry = false
  ): Promise<TResult | undefined> => {
    if (activeRef.current) return undefined;

    activeRef.current = true;
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    setState({
      status: 'IDLE',
      requestId,
      attempt: 0,
      retry,
      startedAt,
      elapsedMs: 0,
    });

    try {
      transition('VALIDATING');
      transition('STARTING');
      const result = await runner({
        requestId,
        startedAt,
        setStatus: status => transition(status),
        setOperationId: operationId => {
          setState(current => ({ ...current, operationId }));
        },
        setAttempt: attempt => {
          setState(current => ({ ...current, attempt }));
        },
      });
      transition('READY');
      setState(current => ({
        ...current,
        result,
        elapsedMs: Date.now() - startedAt,
      }));
      return result;
    } catch (error) {
      const normalizedError: OperationError = normalizeError(error);
      transition(normalizedError.code === 'TIMEOUT' ? 'TIMEOUT' : 'FAILED');
      setState(current => ({
        ...current,
        error: normalizedError,
        elapsedMs: Date.now() - startedAt,
      }));
      throw normalizedError;
    } finally {
      activeRef.current = false;
    }
  }, [transition]);

  const settleTimedOut = useCallback((outcome: TimedOutResult<TResult>) => {
    if (statusRef.current !== 'TIMEOUT') {
      throw new Error('Only timed-out operations can receive a late result.');
    }
    transition(outcome.status);
    setState(current => ({
      ...current,
      result: outcome.result,
      error: outcome.error,
      elapsedMs: current.startedAt === undefined
        ? current.elapsedMs
        : Date.now() - current.startedAt,
    }));
  }, [transition]);

  return { state, run, settleTimedOut };
};
