import type Anthropic from "@anthropic-ai/sdk";

/**
 * Claude API prices in USD, from https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-11-24).
 * Update here if pricing changes; everything else reads from this table.
 */
export const MODEL_PRICES = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite5m: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite5m: 0.125 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5 },
} as const;
export type ModelId = keyof typeof MODEL_PRICES;

export const WEB_SEARCH_PER_1000 = 10;

export type CostLine = {
  step: string;
  model: ModelId;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearches: number;
  webFetches: number;
  usd: number;
};

export function costOf(step: string, model: ModelId, usage: Anthropic.Usage): CostLine {
  const p = MODEL_PRICES[model];
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const webSearches = usage.server_tool_use?.web_search_requests ?? 0;
  const webFetches = usage.server_tool_use?.web_fetch_requests ?? 0;
  const usd =
    (inputTokens * p.input + outputTokens * p.output + cacheReadTokens * p.cacheRead + cacheWriteTokens * p.cacheWrite5m) / 1e6 +
    (webSearches * WEB_SEARCH_PER_1000) / 1000;
  return { step, model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, webSearches, webFetches, usd };
}

export function addCosts(lines: CostLine[]): { usd: number; webSearches: number; webFetches: number; inputTokens: number; outputTokens: number } {
  return lines.reduce(
    (a, l) => ({
      usd: a.usd + l.usd,
      webSearches: a.webSearches + l.webSearches,
      webFetches: a.webFetches + l.webFetches,
      inputTokens: a.inputTokens + l.inputTokens + l.cacheReadTokens + l.cacheWriteTokens,
      outputTokens: a.outputTokens + l.outputTokens,
    }),
    { usd: 0, webSearches: 0, webFetches: 0, inputTokens: 0, outputTokens: 0 },
  );
}
