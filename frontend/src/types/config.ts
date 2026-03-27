export interface ConfigPayload {
  config: Record<string, unknown>;
  hash: string;
  raw: string;
  exists: boolean;
}
