import type { MarginRecord } from '../commercial-contract';

export function calculateMargin(
  operationId: string,
  revenueUsd: number,
  aiCostUsd: number,
  variableCostUsd = 0,
): MarginRecord {
  const marginUsd =
    revenueUsd - aiCostUsd - variableCostUsd;

  const marginPercent =
    revenueUsd > 0
      ? (marginUsd / revenueUsd) * 100
      : 0;

  return {
    operationId,
    revenueUsd,
    aiCostUsd,
    variableCostUsd,
    marginUsd,
    marginPercent,
  };
}
