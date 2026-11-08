// Port: the one thing the app needs from a language model.
// Real API and recorded mock both implement it, so the rest of the code never knows which one runs.

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
}

export interface WriterRequest {
  /** Which step asks: the mock replays a recorded answer per step. */
  kind: 'generate' | 'repair';
  system: string;
  user: string;
  schema: Record<string, unknown>;
}

export interface WriterResponse {
  /** JSON text matching `schema`. */
  text: string;
  usage: Usage;
}

export interface HookWriter {
  /** Model id, or "mock". */
  readonly model: string;
  readonly isMock: boolean;
  write(request: WriterRequest): Promise<WriterResponse>;
}
