import type {
  CommercialTask,
  ExecutionGateResult,
} from '../commercial-contract';

export function evaluateExecutionGate(
  task: CommercialTask,
  creditsAvailable: number,
  authenticated: boolean,
): ExecutionGateResult {
  const no: string[] = [];

  const x = Boolean(task.userId && task.operationId);
  const y = Boolean(task.capability && task.model);

  if (!authenticated) {
    no.push('USER_NOT_AUTHENTICATED');
  }

  if (!x) {
    no.push('INVALID_EXECUTION_CONTEXT');
  }

  if (!y) {
    no.push('CAPABILITY_NOT_RESOLVED');
  }

  if (creditsAvailable < task.creditsRequired) {
    no.push('INSUFFICIENT_CREDITS');
  }

  return {
    allowed: no.length === 0,
    status:
      no.includes('USER_NOT_AUTHENTICATED')
        ? 'unauthorized'
        : no.includes('INSUFFICIENT_CREDITS')
          ? 'insufficient_credits'
          : no.length > 0
            ? 'blocked'
            : 'allowed',
    x,
    y,
    no,
    creditsRequired: task.creditsRequired,
    creditsAvailable,
  };
}
