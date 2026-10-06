export type ExecutionStatus =
  | 'allowed'
  | 'blocked'
  | 'insufficient_credits'
  | 'unauthorized'
  | 'failed'
  | 'completed';

export interface CommercialTask {
  userId: string;
  operationId: string;
  capability: string;
  model: string;
  creditsRequired: number;
  estimatedCostUsd: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ExecutionGateResult {
  allowed: boolean;
  status: ExecutionStatus;
  x: boolean;
  y: boolean;
  no: string[];
  creditsRequired: number;
  creditsAvailable: number;
}

export interface UsageRecord {
  operationId: string;
  userId: string;
  capability: string;
  model: string;
  creditsUsed: number;
  estimatedCostUsd: number;
  status: ExecutionStatus;
  createdAt: string;
}

export interface MarginRecord {
  operationId: string;
  revenueUsd: number;
  aiCostUsd: number;
  variableCostUsd: number;
  marginUsd: number;
  marginPercent: number;
}
