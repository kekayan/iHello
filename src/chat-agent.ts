import {
  AIChatAgent,
  type ChatResponseResult,
  type OnChatMessageOptions,
} from "@cloudflare/ai-chat";
import type { Connection, ConnectionContext } from "agents";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  type GenerateTextOnFinishCallback,
  type LanguageModel,
  type ToolSet,
  type UIMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createWorkersAI } from "workers-ai-provider";
import { anthropic } from "workers-ai-provider/anthropic";
import { openai } from "workers-ai-provider/openai";
import { createGatewayProvider } from "workers-ai-provider/gateway";
import { z } from "zod";
import { writeEvent, type Outcome } from "./analytics";
import { modelApiFor, resolveModelId, supportsReasoningEffort } from "./models";
import { notifyHandoff } from "./notify";
import {
  DECLINE_ABUSE,
  DECLINE_OFF_TOPIC,
  INJECTION_RE,
  OFF_TOPIC_RE,
  buildSystemPrompt,
  generateFollowUps,
  polishAssistantText,
  validateGroundedness,
} from "./pipeline";
import { loadBuiltinEnabled } from "./actions";
import { isIdentityQuestion, identityReply } from "./identity";
import { loadSettings, type Settings } from "./settings";
import {
  executeBookMeeting,
  executeHandoff,
  executeSearchKnowledge,
  parseHandoffInput,
} from "./tools";
import {
  SETTINGS_CACHE_TTL_MS,
  ttlGet,
  ttlSet,
  type TtlEntry,
} from "./ttl-cache";
import { emptyTurnTrace, findBottleneck, type TurnTrace } from "./turn-trace";

export interface ConvState {
  handoffDone: boolean;
  meta: {
    visitor_id?: string;
    page_url?: string;
    referrer?: string;
    verified: boolean;
    preview?: boolean;
    /** Emit data-turn-trace on the stream (also set by ?trace=1 / body.trace). */
    trace?: boolean;
  };
  /** Playground budget: turns in the current UTC hour (cost guardrail). */
  previewBudget?: { hourUtc: number; turns: number };
}

/** Free-win cap: playground can hammer models; live widget is uncapped here. */
const PREVIEW_TURNS_PER_HOUR = 30;

const MAX_STEPS = 5;

/** Caps DO SQLite growth; the durable transcript lives in D1. */
const MAX_PERSISTED_MESSAGES = 40;

type TurnScratch = {
  intent: string;
  model: string;
  system: string;
  outcome: Outcome;
  userText: string;
  retrievalScore: number;
  context: string;
  searched: boolean;
  pillar: string | null;
  startedAt: number;
  settings: Settings;
  /** Built-in tool enablement from registry (D1 overrides). */
  builtinEnabled: Record<string, boolean>;
  trace: TurnTrace;
  /** Wall clock at the start of the in-flight model step, for generate spans. */
  stepStartedAt: number;
};

function textFromUiMessage(message: UIMessage | undefined): string {
  return (message?.parts ?? [])
    .filter(
      (p): p is { type: "text"; text: string } =>
        p.type === "text" && typeof (p as { text?: unknown }).text === "string",
    )
    .map((p) => p.text)
    .join("");
}

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user") return textFromUiMessage(m);
  }
  return "";
}

function bodyString(body: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = body?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export class ChatAgent extends AIChatAgent<Env, ConvState> {
  // `queue` runs every overlapping submit as its own turn — duplicate chip/ws
  // retries produced identical user+assistant pairs. `latest` drops superseded.
  messageConcurrency = "latest" as const;

  // `preview` is seeded so the common (non-preview) connect matches initial
  // state exactly and onConnect writes nothing.
  initialState: ConvState = {
    handoffDone: false,
    meta: { verified: false, preview: false },
  };

  maxPersistedMessages = MAX_PERSISTED_MESSAGES;

  private turn: TurnScratch | null = null;
  private requestHost = "localhost";
  private provider: ReturnType<typeof createWorkersAI> | null = null;
  /** GPT-5.6* need Responses; workers-ai-provider/openai forces .chat() and 400s. */
  private responsesOpenAI: ReturnType<typeof createOpenAI> | null = null;

  /** DO-instance cache for settings (D1) — TTL ~45s. */
  private settingsCache: TtlEntry<Settings> | null = null;
  /** DO-instance cache for builtin tool enablement — same TTL. */
  private builtinsCache: TtlEntry<Record<string, boolean>> | null = null;

  private async cachedSettings(): Promise<Settings> {
    const now = Date.now();
    const hit = ttlGet(this.settingsCache, now);
    if (hit) return hit;
    const value = await loadSettings(this.env.DB);
    this.settingsCache = ttlSet(value, now, SETTINGS_CACHE_TTL_MS);
    return value;
  }

  private async cachedBuiltinEnabled(): Promise<Record<string, boolean>> {
    const now = Date.now();
    const hit = ttlGet(this.builtinsCache, now);
    if (hit) return hit;
    const value = await loadBuiltinEnabled(this.env.DB);
    this.builtinsCache = ttlSet(value, now, SETTINGS_CACHE_TTL_MS);
    return value;
  }

  private wantsTrace(body?: Record<string, unknown>): boolean {
    if (this.state.meta.preview || this.state.meta.trace) return true;
    if (!body) return false;
    const d = body.debug;
    const t = body.trace;
    return d === true || t === true || d === "true" || t === "true" || d === 1 || t === 1;
  }

  /** Compact JSON for wrangler/tail FAQ smoke — always logged. */
  private logTraceSummary(trace: TurnTrace): void {
    console.log(
      "turn-trace",
      JSON.stringify({
        total_ms: trace.total_ms,
        ttft_ms: trace.ttft_ms,
        retrieve_ms: trace.retrieve_ms,
        intent: trace.intent,
        bottleneck: trace.bottleneck,
        generate: trace.generate.map((g) => ({
          pass: g.pass,
          duration_ms: g.duration_ms,
          tool_names: g.tool_names,
        })),
        tools: trace.tools.map((t) => t.name),
      }),
    );
  }

  /**
   * All chat models are AI Gateway catalog slugs (`xai/…`, `openai/…`,
   * `anthropic/…`) or Workers AI ids (`@cf/…`). The OpenAI plugin covers every
   * OpenAI-wire provider, so xAI and Workers AI both route through this one
   * provider on Unified Billing.
   */
  private resolveModel(modelId: string): LanguageModel {
    // GPT-5.6 family is Responses-only. The openai plugin in workers-ai-provider
    // deliberately uses .chat() (Chat Completions), which AI Gateway rejects with
    // 7003 "Invalid input" for these models. Route them through Responses.
    if (modelApiFor(modelId) === "responses") {
      this.responsesOpenAI ??= createGatewayProvider(createOpenAI, {
        binding: this.env.AI,
        gateway: this.env.AI_GATEWAY_ID || "default",
      });
      const bare = modelId.replace(/^openai\//, "");
      return this.responsesOpenAI(bare);
    }
    this.provider ??= createWorkersAI({
      binding: this.env.AI,
      providers: [openai, anthropic],
      gateway: { id: this.env.AI_GATEWAY_ID || "default" },
    });
    return this.provider(modelId);
  }

  /** Times a tool call into the turn trace without changing its result. */
  private async traceTool<T>(
    scratch: TurnScratch,
    name: string,
    detail: string | undefined,
    run: () => Promise<T>,
  ): Promise<T> {
    const at = Date.now();
    try {
      const out = await run();
      scratch.trace.tools.push({
        name,
        ms: Date.now() - at,
        ok: true,
        ...(detail ? { detail } : {}),
      });
      return out;
    } catch (err) {
      scratch.trace.tools.push({
        name,
        ms: Date.now() - at,
        ok: false,
        detail: String(err).slice(0, 200),
      });
      throw err;
    }
  }

  private buildTools(scratch: TurnScratch): ToolSet {
    const tools: ToolSet = {};
    const enabled = scratch.builtinEnabled;

    if (enabled.search_knowledge !== false) {
    tools.search_knowledge = tool({
      description:
        "PRIMARY tool for factual FAQ about the company, services, delivery pods, timelines, pricing, process, or offerings. Call once with a clear standalone query BEFORE answering any such question. After you get a result that covers the question, STOP searching and answer from it. Do not call again unless the visitor asks something clearly different. Never invent facts.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Standalone search query restating the visitor's factual ask (services, pods, timelines, etc.)",
          ),
      }),
      execute: ({ query }) =>
        this.traceTool(scratch, "search_knowledge", query, async () => {
          const at = Date.now();
          const result = await executeSearchKnowledge(
            this.env,
            query,
            scratch.searched,
          );
          scratch.trace.retrieve_ms += Date.now() - at;
          scratch.searched = true;
          if (result.topScore > scratch.retrievalScore) {
            scratch.retrievalScore = result.topScore;
          }
          if (result.text && !result.text.startsWith("Already searched")) {
            scratch.context = result.text;
          }
          return result.text;
        }),
    });
    }

    if (enabled.book_meeting !== false) {
    tools.book_meeting = tool({
      description:
        "ONLY when the visitor explicitly wants to book, schedule, or get a calendar link for a call. Do NOT call for ordinary FAQ (what we offer, how long pods take, what migration covers, pricing explainers). Returns the booking link to share.",
      inputSchema: z.object({
        // xAI/OpenAI-compat rejects empty parameter schemas (properties: {}).
        reason: z
          .string()
          .optional()
          .describe("Brief reason the visitor asked to book; omit if none"),
      }),
      execute: () =>
        this.traceTool(scratch, "book_meeting", undefined, async () => {
          if (!this.state.meta.preview) {
            writeEvent(this.env.AE, {
              page_url: this.state.meta.page_url ?? "",
              intent: scratch.intent,
              model: scratch.model,
              outcome: "chat",
              source: "book_meeting",
              ttft_ms: 0,
              total_ms: 0,
              retrieval_top_score: 0,
              grounded_score: 0,
              grounded_commit: 0,
              conversation_id: this.name,
            });
          }
          return executeBookMeeting(this.env);
        }),
    });
    }

    if (enabled.handoff !== false && !this.state.handoffDone) {
      tools.handoff = tool({
        description:
          'ONLY for buying intent WITH a visitor email (lead), or unresolved support / explicit ask for a human. Do NOT call for ordinary FAQ answers (services, offerings, pod timelines, how migration works). type "lead" needs a valid email (required) and mobile/phone when available; type "support" when you cannot resolve or they ask for a person (email if given; mobile if natural). At most once per conversation.',
        inputSchema: z.object({
          type: z.enum(["lead", "support"]),
          email: z.string().optional(),
          phone: z.string().optional(),
          name: z.string().optional(),
          company: z.string().optional(),
          pillar: z.string().optional(),
          timeline: z.string().optional(),
          scale: z.string().optional(),
          summary: z.string(),
        }),
        execute: (input) =>
          this.traceTool(scratch, "handoff", input.type, async () => {
            const parsed = parseHandoffInput(input);
            if (!parsed) return "Invalid handoff input.";
            if (this.state.handoffDone) {
              return "Handoff already recorded for this conversation.";
            }

            const preview = this.state.meta.preview === true;
            const convId = preview ? `preview_${this.name}` : this.name;

            await this.env.DB.prepare(
              `INSERT INTO conversations (id, visitor_id, page_url, referrer, started_at, last_message_at, message_count)
               VALUES (?, ?, ?, ?, ?, ?, 0)
               ON CONFLICT(id) DO NOTHING`,
            )
              .bind(
                convId,
                this.state.meta.visitor_id ?? null,
                this.state.meta.page_url ?? null,
                this.state.meta.referrer ?? null,
                Date.now(),
                Date.now(),
              )
              .run();

            const result = await executeHandoff(parsed, {
              env: this.env,
              db: this.env.DB,
              conversationId: convId,
              pageUrl: this.state.meta.page_url,
              settings: scratch.settings,
              host: this.requestHost,
              waitUntil: (p) => this.ctx.waitUntil(p),
              preview,
            });

            if (result.handoffDone) {
              this.setState({ ...this.state, handoffDone: true });
              scratch.outcome =
                result.handoffType === "support" ? "support" : "lead";
              if (result.handoffId && !preview) {
                await this.schedule(86400, "followUp", {
                  handoffId: result.handoffId,
                });
              }
            }
            return result.toolResult;
          }),
      });
    }

    return tools;
  }

  async onConnect(_connection: Connection, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    const preview = url.searchParams.get("preview") === "1";
    const trace =
      url.searchParams.get("trace") === "1" ||
      url.searchParams.get("debug") === "1";
    this.requestHost = url.host || "localhost";
    const meta = this.state.meta;
    const verified = preview ? true : meta.verified;
    // Unconditional setState here was a SQLite row write on every reconnect.
    if (
      meta.preview !== preview ||
      meta.verified !== verified ||
      meta.trace !== trace
    ) {
      this.setState({
        ...this.state,
        meta: { ...meta, preview, verified, trace },
      });
    }
    this.ctx.waitUntil(this.armExpiry().then(() => undefined));
  }

  /**
   * Objects expire on the same clock as the D1 retention sweep, so a
   * conversation's Durable Object never outlives its transcript. Armed off the
   * hot path and idempotent on callback+payload, so repeated wakes reuse the
   * one schedule row instead of stacking new ones.
   */
  private async armExpiry(): Promise<void> {
    // Preview/playground must not pin DOs for retentionDays.
    const preview = this.state.meta.preview === true;
    const seconds = preview
      ? 6 * 3_600
      : (await this.cachedSettings()).retentionDays * 86_400;
    await this.schedule(seconds, "expire", {}, { idempotent: true });
  }

  /** Scheduled teardown: drops every table and clears this object's storage. */
  async expire(): Promise<void> {
    // Never kill a session mid-conversation; look again in an hour.
    const live = [...this.getConnections()].length > 0;
    if (live) {
      await this.schedule(3_600, "expire", {}, { idempotent: true });
      return;
    }
    await this.destroy();
  }

  /** Operator-triggered wipe used by the one-off purge sweep. */
  async purge(): Promise<void> {
    await this.destroy();
  }

  private captureMeta(body: Record<string, unknown> | undefined): void {
    const meta = this.state.meta;
    const visitor_id = bodyString(body, "visitor_id");
    const page_url = bodyString(body, "page_url");
    const referrer = bodyString(body, "referrer");
    const next = {
      ...(visitor_id && visitor_id !== meta.visitor_id ? { visitor_id } : {}),
      ...(page_url && page_url !== meta.page_url ? { page_url } : {}),
      ...(referrer && referrer !== meta.referrer ? { referrer } : {}),
    };
    if (Object.keys(next).length === 0) return;
    this.setState({ ...this.state, meta: { ...meta, ...next } });
  }

  private claimPreviewBudget(): boolean {
    const hourUtc = Math.floor(Date.now() / 3_600_000);
    const budget = this.state.previewBudget;
    const turns = budget && budget.hourUtc === hourUtc ? budget.turns : 0;
    if (turns >= PREVIEW_TURNS_PER_HOUR) return false;
    this.setState({ ...this.state, previewBudget: { hourUtc, turns: turns + 1 } });
    return true;
  }

  /** Canned replies skip the model entirely — the text is already decided. */
  private fixedReply(text: string): Response {
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const id = crypto.randomUUID();
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: text });
        writer.write({ type: "text-end", id });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  private modelTextStream(
    scratch: TurnScratch,
    onFinish: GenerateTextOnFinishCallback<ToolSet>,
    options: OnChatMessageOptions | undefined,
    messages: Awaited<ReturnType<typeof convertToModelMessages>>,
  ) {
    scratch.stepStartedAt = Date.now();
    const result = streamText({
      model: this.resolveModel(scratch.model),
      system: scratch.system,
      messages,
      tools: this.buildTools(scratch),
      toolChoice: "auto",
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: options?.abortSignal,
      // Only Grok 4.5/4.6 accept reasoning_effort — sending it elsewhere burns retries.
      ...(supportsReasoningEffort(scratch.model)
        ? {
            providerOptions: {
              openai: { reasoningEffort: scratch.settings.reasoningEffort },
            },
          }
        : {}),
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta" && scratch.trace.ttft_ms === 0) {
          scratch.trace.ttft_ms = Date.now() - scratch.startedAt;
        }
      },
      onStepFinish: (step) => {
        const now = Date.now();
        scratch.trace.generate.push({
          pass: scratch.trace.generate.length + 1,
          duration_ms: now - scratch.stepStartedAt,
          ttft_ms: scratch.trace.ttft_ms,
          tool_names: step.toolCalls.map((c) => c.toolName),
        });
        scratch.stepStartedAt = now;
      },

      onError: ({ error }) => {
        const e = error as {
          name?: string;
          message?: string;
          statusCode?: number;
          responseBody?: string;
          url?: string;
        };
        console.log(
          "streamText onError",
          e?.name,
          e?.statusCode,
          e?.url,
          String(e?.message ?? ""),
          String(e?.responseBody ?? "").slice(0, 800),
        );
      },
      onFinish,
    });
    return result;
  }

  private connectionIds(): string[] {
    return [...this.getConnections()].map((c) => c.id);
  }

  /**
   * Queued submits can append the same user message again (u·a·u). Replay the
   * prior assistant instead of running another full turn.
   */
  private async skipDuplicateUserTurn(): Promise<Response | null> {
    const msgs = this.messages;
    const last = msgs.at(-1);
    if (last?.role !== "user") return null;

    const dupText = textFromUiMessage(last).trim();
    if (!dupText) return null;

    let i = msgs.length - 2;
    while (i >= 0 && msgs[i]?.role !== "assistant") i--;
    if (i < 0) return null;

    let j = i - 1;
    while (j >= 0 && msgs[j]?.role !== "user") j--;
    if (j < 0) return null;
    if (textFromUiMessage(msgs[j]).trim() !== dupText) return null;

    const trimmed = msgs.slice(0, -1);
    await this.persistMessages(trimmed, this.connectionIds());
    return this.fixedReply(textFromUiMessage(msgs[i]));
  }

  private runModel(
    scratch: TurnScratch,
    onFinish: GenerateTextOnFinishCallback<ToolSet>,
    options: OnChatMessageOptions | undefined,
    messages: Awaited<ReturnType<typeof convertToModelMessages>>,
  ): Response {
    scratch.stepStartedAt = Date.now();
    return streamText({
      model: this.resolveModel(scratch.model),
      system: scratch.system,
      messages,
      tools: this.buildTools(scratch),
      toolChoice: "auto",
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: options?.abortSignal,
      ...(supportsReasoningEffort(scratch.model)
        ? {
            providerOptions: {
              openai: { reasoningEffort: scratch.settings.reasoningEffort },
            },
          }
        : {}),
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta" && scratch.trace.ttft_ms === 0) {
          scratch.trace.ttft_ms = Date.now() - scratch.startedAt;
        }
      },
      onStepFinish: (step) => {
        const now = Date.now();
        scratch.trace.generate.push({
          pass: scratch.trace.generate.length + 1,
          duration_ms: now - scratch.stepStartedAt,
          ttft_ms: scratch.trace.ttft_ms,
          tool_names: step.toolCalls.map((c) => c.toolName),
        });
        scratch.stepStartedAt = now;
      },

      onError: ({ error }) => {
        const e = error as {
          name?: string;
          message?: string;
          statusCode?: number;
          responseBody?: string;
          url?: string;
        };
        console.log(
          "streamText onError",
          e?.name,
          e?.statusCode,
          e?.url,
          String(e?.message ?? ""),
          String(e?.responseBody ?? "").slice(0, 800),
        );
      },
      onFinish,
    }).toUIMessageStreamResponse({ sendReasoning: false });
  }

  /**
   * Cheap safety only — no refine LLM, no speculative retrieve.
   * Knowledge enters via search_knowledge tool results in the agent loop.
   */
  private prepareKnowledge(scratch: TurnScratch): Outcome | null {
    const trimmed = scratch.userText.trim();
    // Hard-block injection/abuse/off-topic via cheap regex; model never sees these.
    // jailbreak already covered by INJECTION_RE; extra local abuse hard-block
    const ABUSE_RE = /\b(kill yourself|kys)\b/i;
    if (INJECTION_RE.test(trimmed) || ABUSE_RE.test(trimmed)) {
      scratch.outcome = INJECTION_RE.test(trimmed)
        ? "declined_injection"
        : "declined_abuse";
      scratch.trace.intent = scratch.outcome.replace("declined_", "");
      scratch.intent = scratch.trace.intent;
      return scratch.outcome;
    }
    if (OFF_TOPIC_RE.test(trimmed)) {
      scratch.outcome = "declined_off_topic";
      scratch.trace.intent = "off_topic";
      scratch.intent = "off_topic";
      return scratch.outcome;
    }

    const lower = trimmed.toLowerCase();
    let intent = "question";
    if (
      /\b(price|pricing|cost|quote|buy|buying|engage|engagement|talk to|book a call|can you help)\b/.test(
        lower,
      )
    ) {
      intent = "buying";
    } else if (
      /\b(support|broken|issue|problem|complaint|human|person|someone)\b/.test(
        lower,
      )
    ) {
      intent = "support";
    }
    scratch.intent = intent;
    scratch.trace.intent = intent;
    scratch.pillar = null;
    scratch.context = "";
    scratch.searched = false;
    // No prep refine/retrieve — retrieve_ms only from tool calls.
    scratch.trace.refine_ms = 0;
    return null;
  }

  /**
   * Stream the turn immediately with a Thinking… activity; knowledge comes from tools.
   */
  private streamTurn(
    scratch: TurnScratch,
    onFinish: GenerateTextOnFinishCallback<ToolSet>,
    options: OnChatMessageOptions | undefined,
    modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>,
  ): Response {
    const emitStreamTrace = (
      writer: { write: (part: { type: string; data?: unknown }) => void },
    ) => {
      const elapsed = Math.max(
        scratch.trace.ttft_ms || 1,
        Date.now() - scratch.startedAt,
      );
      const trace = this.finalizeTrace(scratch, elapsed);
      this.logTraceSummary(trace);
      if (this.wantsTrace(options?.body)) {
        writer.write({ type: "data-turn-trace", data: trace });
      }
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({
          type: "data-activity",
          data: { label: "Thinking…" },
        });

        const declined = this.prepareKnowledge(scratch);
        if (declined) {
          const text =
            declined === "declined_off_topic"
              ? DECLINE_OFF_TOPIC
              : DECLINE_ABUSE;
          const id = crypto.randomUUID();
          writer.write({ type: "text-start", id });
          writer.write({ type: "text-delta", id, delta: text });
          writer.write({ type: "text-end", id });
          scratch.trace.ttft_ms = Math.max(
            1,
            Date.now() - scratch.startedAt,
          );
          emitStreamTrace(writer);
          // No follow-ups on declined turns.
          return;
        }

        // Identity short-circuit — no model / tools / search.
        if (isIdentityQuestion(scratch.userText)) {
          scratch.intent = "identity";
          scratch.trace.intent = "identity";
          scratch.outcome = "chat";
          const text = identityReply(scratch.settings);
          scratch.trace.ttft_ms = Math.max(
            1,
            Date.now() - scratch.startedAt,
          );
          scratch.trace.retrieve_ms = 0;
          scratch.trace.generate.push({
            pass: 1,
            duration_ms: scratch.trace.ttft_ms,
            ttft_ms: scratch.trace.ttft_ms,
            tool_names: ["short_circuit"],
          });
          const id = crypto.randomUUID();
          writer.write({ type: "text-start", id });
          writer.write({ type: "text-delta", id, delta: text });
          writer.write({ type: "text-end", id });
          const chips = scratch.settings.suggestions?.slice(0, 4) ?? [];
          if (chips.length > 0) {
            writer.write({
              type: "data-follow-ups",
              data: { suggestions: chips },
            });
          }
          emitStreamTrace(writer);
          return;
        }

        scratch.system = buildSystemPrompt({
          settings: scratch.settings,
          context: "",
          pageUrl: this.state.meta.page_url,
          pillar: null,
        });

        const result = this.modelTextStream(
          scratch,
          (finishResult) => {
            onFinish(finishResult);
            emitStreamTrace(writer);
          },
          options,
          modelMessages,
        );
        writer.merge(result.toUIMessageStream({ sendReasoning: false }));

        // After the answer streams — does not block TTFT.
        try {
          const assistantText = await result.text;
          const suggestions = await generateFollowUps({
            env: this.env,
            userText: scratch.userText,
            assistantText,
            pillar: scratch.pillar,
            fallback: scratch.settings.suggestions,
          });
          if (suggestions.length > 0) {
            writer.write({
              type: "data-follow-ups",
              data: { suggestions },
            });
          }
        } catch (err) {
          console.log("follow-ups skipped", String(err));
        }
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  async onChatMessage(
    onFinish: GenerateTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions,
  ): Promise<Response> {
    const messages = await convertToModelMessages(this.messages);

    // Tool continuations reuse the turn already budgeted, so the preview
    // counter runs once per visitor message, not per step.
    if (options?.continuation && this.turn) {
      return this.runModel(this.turn, onFinish, options, messages);
    }

    const dup = await this.skipDuplicateUserTurn();
    if (dup) return dup;

    const settings = await this.cachedSettings();
    const builtinEnabled = await this.cachedBuiltinEnabled();
    this.captureMeta(options?.body);
    // Body debug/trace so verify-ihello / FAQ smoke can request data-turn-trace.
    if (this.wantsTrace(options?.body) && !this.state.meta.trace && !this.state.meta.preview) {
      this.setState({
        ...this.state,
        meta: { ...this.state.meta, trace: true },
      });
    }

    const modelId = resolveModelId(
      settings.modelMain || this.env.MODEL_MAIN_DEFAULT,
      this.env.MODEL_MAIN_DEFAULT,
    );
    const startedAt = Date.now();
    const scratch: TurnScratch = {
      intent: "question",
      model: modelId,
      system: "",
      outcome: "chat",
      userText: lastUserText(this.messages),
      retrievalScore: 0,
      context: "",
      searched: false,
      pillar: null,
      startedAt,
      settings,
      builtinEnabled,
      trace: emptyTurnTrace({
        model: modelId,
        intent: "question",
        reasoning_effort: settings.reasoningEffort,
        page_url: this.state.meta.page_url ?? "",
      }),
      stepStartedAt: startedAt,
    };
    this.turn = scratch;

    if (this.state.meta.preview === true && !this.claimPreviewBudget()) {
      return this.fixedReply(
        `Playground rate limit reached (${PREVIEW_TURNS_PER_HOUR}/hour). Wait for the next hour or continue on the live widget.`,
      );
    }

    if (!settings.enabled) {
      scratch.outcome = "refused_disabled";
      return this.fixedReply(
        "The assistant is unavailable right now - please try again later.",
      );
    }

    return this.streamTurn(scratch, onFinish, options, messages);
  }

  private finalizeTrace(scratch: TurnScratch, total: number): TurnTrace {
    const trace = scratch.trace;
    trace.total_ms = total;
    trace.bottleneck = findBottleneck(trace);
    return trace;
  }

  protected async onChatResponse(result: ChatResponseResult): Promise<void> {
    const scratch = this.turn;
    this.turn = null;
    if (result.status !== "completed" || !scratch) return;

    const total = Date.now() - scratch.startedAt;
    // Stream path already logs for model turns; short-circuit/declined may skip
    // onFinish — still ensure a compact summary lands in wrangler tail.
    if (scratch.trace.total_ms === 0) {
      this.logTraceSummary(this.finalizeTrace(scratch, total));
    }

    if (this.state.meta.preview || this.state.meta.trace) {
      const trace = this.finalizeTrace(scratch, total);
      // Persist trace on the DO only — rebroadcasting cf_agent_chat_messages here
      // races the live stream and can duplicate the last turn in the client.
      await this.persistMessages(
        this.messages.map((m) =>
          m.id === result.message.id
            ? {
                ...m,
                metadata: {
                  ...(m.metadata ?? {}),
                  turnTrace: trace,
                },
              }
            : m,
        ),
        this.connectionIds(),
      );
      // Playground skips D1 transcript persistence.
      if (this.state.meta.preview) return;
    }

    const assistantText = polishAssistantText(textFromUiMessage(result.message));
    this.ctx.waitUntil(
      this.persistTurn({
        scratch,
        assistantText,
        total,
      }),
    );
  }

  private async persistTurn(opts: {
    scratch: TurnScratch;
    assistantText: string;
    total: number;
  }): Promise<void> {
    const convId = this.name;
    const now = Date.now();
    const { scratch, assistantText, total } = opts;

    await this.env.DB.prepare(
      `INSERT INTO conversations (id, visitor_id, page_url, referrer, started_at, last_message_at, message_count)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         last_message_at = excluded.last_message_at,
         message_count = conversations.message_count + 1,
         page_url = COALESCE(excluded.page_url, conversations.page_url),
         visitor_id = COALESCE(excluded.visitor_id, conversations.visitor_id)`,
    )
      .bind(
        convId,
        this.state.meta.visitor_id ?? null,
        this.state.meta.page_url ?? null,
        this.state.meta.referrer ?? null,
        now,
        now,
      )
      .run();

    await this.env.DB.prepare(
      `INSERT INTO messages (conversation_id, role, content, created_at, retrieval_score)
       VALUES (?, 'user', ?, ?, ?)`,
    )
      .bind(convId, scratch.userText, now, scratch.retrievalScore)
      .run();

    const validateAt = Date.now();
    const grounded = await validateGroundedness({
      env: this.env,
      context: scratch.context,
      reply: assistantText,
    });

    const trace = this.finalizeTrace(scratch, total);
    trace.validate_ms = Date.now() - validateAt;
    trace.bottleneck = findBottleneck(trace);

    await this.env.DB.prepare(
      `INSERT INTO messages (conversation_id, role, content, created_at, grounded_score, grounded_commit, trace_json)
       VALUES (?, 'assistant', ?, ?, ?, ?, ?)`,
    )
      .bind(
        convId,
        assistantText,
        now + 1,
        grounded.score < 0 ? null : grounded.score,
        grounded.score < 0 ? null : grounded.commit ? 1 : 0,
        JSON.stringify(trace),
      )
      .run();

    writeEvent(this.env.AE, {
      page_url: this.state.meta.page_url ?? "",
      intent: scratch.intent,
      model: scratch.model,
      outcome: scratch.outcome,
      source: "typed",
      ttft_ms: scratch.trace.ttft_ms,
      total_ms: total,
      retrieval_top_score: scratch.retrievalScore,
      grounded_score: grounded.score < 0 ? 0 : grounded.score,
      grounded_commit: grounded.commit ? 1 : 0,
      conversation_id: convId,
    });
  }

  async followUp(payload: { handoffId: string }): Promise<void> {
    const row = await this.env.DB.prepare(
      `SELECT id, type, email, phone, name, company, pillar, timeline, scale, summary, page_url, status, conversation_id
       FROM handoffs WHERE id = ?`,
    )
      .bind(payload.handoffId)
      .first<{
        id: string;
        type: "lead" | "support";
        email: string;
        phone: string | null;
        name: string | null;
        company: string | null;
        pillar: string | null;
        timeline: string | null;
        scale: string | null;
        summary: string;
        page_url: string | null;
        status: string;
        conversation_id: string;
      }>();
    if (!row || row.status !== "new") return;
    await notifyHandoff(
      {
        type: row.type,
        email: row.email,
        phone: row.phone ?? undefined,
        name: row.name ?? undefined,
        company: row.company ?? undefined,
        pillar: row.pillar ?? undefined,
        timeline: row.timeline ?? undefined,
        scale: row.scale ?? undefined,
        summary: row.summary,
        page_url: row.page_url ?? undefined,
        conversation_id: row.conversation_id,
        host: this.requestHost,
        kind: "reminder",
      },
      this.env,
    );
  }
}
