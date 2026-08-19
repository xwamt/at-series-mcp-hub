import type { ToolRisk } from '../protocol/index';

export type AuditStatus =
  | 'success'
  | 'cancelled'
  | 'not_found'
  | 'validation_error'
  | 'unavailable'
  | 'error';

export type AuditRecord = {
  traceId: string;
  timestamp: string;
  hostApp: string;
  hubPid: number;
  pluginId?: string;
  bridgeId?: string;
  toolName: string;
  risk?: ToolRisk;
  attemptCount: number;
  durationMs: number;
  status: AuditStatus;
  error?: { code: string; message: string };
  params: Record<string, unknown>;
  responseSummary: {
    isError: boolean;
    preview: string;
  };
};
