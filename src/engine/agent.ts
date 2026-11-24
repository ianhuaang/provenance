import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { costOf, type CostLine, type ModelId } from "./costs.js";

/** The slice of the Anthropic client the engine uses, so tests can pass a fake. */
export type MessagesClient = {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
};

export type AgentOptions<T extends z.ZodType> = {
  client: MessagesClient;
  step: string;
  model: ModelId;
  system: string;
  prompt: string;
  /** Shape of the final answer; the model must call the `submit` tool with it. */
  result: T;
  resultDescription: string;
  maxSearches?: number;
  maxFetches?: number;
  maxTokens?: number;
  /** Safety valve on API round trips (pause_turn continuations, retries). */
  maxTurns?: number;
  onProgress?: (message: string) => void;
};

export type AgentRun<T> = { value: T; cost: CostLine; turns: number };

export class AgentError extends Error {
  constructor(message: string, readonly cost: CostLine) {
    super(message);
  }
}

const SUBMIT = "submit";

/**
 * Runs Claude with web search and web fetch until it calls `submit` with a value that
 * passes the zod schema. Handles server-tool pauses and re-prompts on invalid output.
 */
export async function runAgent<T extends z.ZodType>(opts: AgentOptions<T>): Promise<AgentRun<z.infer<T>>> {
  const { client, step, model, system, prompt, result } = opts;
  const tools: Anthropic.ToolUnion[] = [];
  if ((opts.maxSearches ?? 0) > 0) tools.push({ type: "web_search_20250305", name: "web_search", max_uses: opts.maxSearches });
  if ((opts.maxFetches ?? 0) > 0)
    tools.push({ type: "web_fetch_20250910", name: "web_fetch", max_uses: opts.maxFetches, max_content_tokens: 40000 });
  tools.push({
    name: SUBMIT,
    description: `Submit the final answer. ${opts.resultDescription} Call this exactly once, when your research is complete.`,
    input_schema: z.toJSONSchema(result, { target: "draft-7", io: "input" }) as Anthropic.Tool.InputSchema,
  });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0, web_fetch_requests: 0 };
  const cost = () =>
    costOf(step, model, {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens,
      server_tool_use: { web_search_requests: usage.web_search_requests, web_fetch_requests: usage.web_fetch_requests },
    } as Anthropic.Usage);

  const maxTurns = opts.maxTurns ?? 8;
  for (let turn = 1; turn <= maxTurns; turn++) {
    const res = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 16000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools,
      messages,
    });
    usage.input_tokens += res.usage.input_tokens;
    usage.output_tokens += res.usage.output_tokens;
    usage.cache_read_input_tokens += res.usage.cache_read_input_tokens ?? 0;
    usage.cache_creation_input_tokens += res.usage.cache_creation_input_tokens ?? 0;
    usage.web_search_requests += res.usage.server_tool_use?.web_search_requests ?? 0;
    usage.web_fetch_requests += res.usage.server_tool_use?.web_fetch_requests ?? 0;

    for (const block of res.content) {
      if (block.type === "server_tool_use") {
        const input = block.input as { query?: string; url?: string };
        opts.onProgress?.(block.name === "web_search" ? `Searching: ${input.query ?? ""}` : `Reading: ${input.url ?? ""}`);
      }
    }

    messages.push({ role: "assistant", content: res.content as Anthropic.ContentBlockParam[] });

    const submit = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === SUBMIT);
    if (submit) {
      const parsed = result.safeParse(submit.input);
      if (parsed.success) return { value: parsed.data, cost: cost(), turns: turn };
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: submit.id,
            is_error: true,
            content: `The submission didn't match the required shape. Fix these and call submit again:\n${z.prettifyError(parsed.error)}`,
          },
        ],
      });
      continue;
    }

    if (res.stop_reason === "pause_turn") continue; // server tools paused a long turn; resend to let it finish
    if (res.stop_reason === "refusal") throw new AgentError(`${step}: the model declined this request`, cost());
    if (res.stop_reason === "max_tokens") {
      messages.push({ role: "user", content: "You ran out of room. Stop researching and call submit now with what you have." });
      continue;
    }
    messages.push({ role: "user", content: "Call the submit tool now with your final answer." });
  }
  throw new AgentError(`${step}: no valid submission after ${maxTurns} turns`, cost());
}
