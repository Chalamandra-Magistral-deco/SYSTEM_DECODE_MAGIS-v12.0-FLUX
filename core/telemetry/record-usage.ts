import type { UsageRecord } from '../commercial-contract';

export function createUsageRecord(
  operationId: string,
  userId: string,
  capability: string,
  model: string,
  creditsUsed: number,
  estimatedCostUsd: number,
  status: UsageRecord['status'],
): UsageRecord {
  return {
    operationId,
    userId,
    capability,
    model,
    creditsUsed,
    estimatedCostUsd,
    status,
    createdAt: new Date().toISOString(),
  };
}
