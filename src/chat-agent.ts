import { Agent, type Connection, type ConnectionContext, type WSMessage } from "agents";
import { writeEvent, writeFeedbackEvent } from "./analytics";
import { notifyHandoff } from "./notify";
import {
  DECLINE_ABUSE,
  DECLINE_OFF_TOPIC,
  TROUBLE,
  buildSystemPrompt,
  generate,
  refine,
  retrieve,
  validateGroundedness,
  type ContentBlock,
} from "./pipeline";
import { loadSettings, type Settings } from "./settings";
import {
  executeBookMeeting,
  executeHandoff,
  executeSearchKnowledge,
  parseHandoffInput,
  toolsForTurn,
} from "./tools";
import { customToolsForTurn, executeCustomAction } from "./actions";

export interface ConvState {
  messages: { role: "user" | "assistant"; content: string }[];
  handoffDone: boolean;
  meta: {
    visitor_id?: string;
    page_url?: string;
    referrer?: string;
    verified: boolean;
  };
  turnInFlight: boolean;
}

interface ConnState {
  role: "visitor" | "admin";
  helloDone: boolean;
  preview: boolean;
}

type ClientMsg =
  | { t: "hello"; visitor_id: string; page_url: string; referrer: string; turnstile_token: string }
  | { t: "msg"; text: string; source: "chip" | "typed" }
  | { t: "feedback"; message_index: number; rating: "up" | "down" };

function send(conn: Connection, payload: unknown): void {
  conn.send(JSON.stringify(payload));
}

function broadcastFrame(agent: ChatAgent, payload: unknown, includeAdmins = true): void {
  const raw = JSON.stringify(payload);
  for (const c of agent.getConnections<ConnState>()) {
    const role = c.state?.role ?? "visitor";
    if (role === "admin" && !includeAdmins) continue;
    c.send(raw);
  }
}

async function verifyTurnstile(token: string, secret: string, ip: string): Promise<boolean> {
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { success?: boolean };
  return Boolean(json.success);
}

export class ChatAgent extends Agent<Env, ConvState> {
  initialState: ConvState = {
    messages: [],
    handoffDone: false,
    meta: { verified: false },
    turnInFlight: false,
  };

  private isPreview(url: URL): boolean {
    return url.searchParams.get("preview") === "1";
  }

  private conversationId(): string {
    return this.name;
  }

  private waitUntil(p: Promise<unknown>): void {
    // Durable Object ExecutionContext
    const ctx = this.ctx as unknown as { waitUntil?: (p: Promise<unknown>) => void };
    if (typeof ctx.waitUntil === "function") {
      ctx.waitUntil(p);
    } else {
      void p.catch((err) => console.log("waitUntil error", err));
    }
  }

  async onConnect(connection: Connection<ConnState>, ctx: ConnectionContext): Promise<void> {
    const url = new URL(ctx.request.url);
    const preview = this.isPreview(url);
    const isAdmin =
      url.searchParams.get("admin") === "1" &&
      Boolean(ctx.request.headers.get("Cf-Access-Jwt-Assertion"));

    connection.setState({
      role: isAdmin ? "admin" : "visitor",
      helloDone: false,
      preview,
    });
  }

  /** Custom JSON protocol — do not send Agents SDK identity/state frames. */
  shouldSendProtocolMessages(): boolean {
    return false;
  }

  async onMessage(connection: Connection<ConnState>, message: WSMessage): Promise<void> {
    if (typeof message !== "string") return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(message) as ClientMsg;
    } catch {
      send(connection, { t: "err" });
      return;
    }

    switch (msg.t) {
      case "hello":
        await this.handleHello(connection, msg);
        break;
      case "msg":
        await this.handleMsg(connection, msg);
        break;
      case "feedback":
        await this.handleFeedback(connection, msg);
        break;
      default: {
        const _exhaustive: never = msg;
        void _exhaustive;
        send(connection, { t: "err" });
      }
    }
  }

  private async handleHello(
    connection: Connection<ConnState>,
    msg: Extract<ClientMsg, { t: "hello" }>,
  ): Promise<void> {
    const preview = connection.state?.preview === true;
    const isAdmin = connection.state?.role === "admin";

    if (!preview && !isAdmin) {
      const secret = this.env.TURNSTILE_SECRET;
      if (secret) {
        const ip = ""; // DO connections: IP may be unavailable; still verify token
        const ok = await verifyTurnstile(msg.turnstile_token || "", secret, ip);
        if (!ok) {
          send(connection, { t: "refuse", code: "turnstile" });
          connection.close(4001, "turnstile");
          return;
        }
      }
    }

    this.setState({
      ...this.state,
      meta: {
        visitor_id: msg.visitor_id,
        page_url: msg.page_url,
        referrer: msg.referrer,
        verified: true,
      },
    });
    connection.setState({
      ...(connection.state as ConnState),
      helloDone: true,
    });
    send(connection, {
      t: "ready",
      history: this.state.messages.map((m) => ({ role: m.role, content: m.content })),
    });
  }

  private async handleFeedback(
    connection: Connection<ConnState>,
    msg: Extract<ClientMsg, { t: "feedback" }>,
  ): Promise<void> {
    if (connection.state?.preview) return;
    if (msg.rating !== "up" && msg.rating !== "down") return;
    writeFeedbackEvent(
      this.env.AE,
      this.state.meta.page_url ?? "",
      msg.rating,
      this.conversationId(),
    );
  }

  private async handleMsg(
    connection: Connection<ConnState>,
    msg: Extract<ClientMsg, { t: "msg" }>,
  ): Promise<void> {
    const preview = connection.state?.preview === true;
    const isAdmin = connection.state?.role === "admin";

    // Admin live handoff: deliver verbatim to visitor as [Team] delta
    if (isAdmin) {
      const text = `[Team] ${msg.text}`;
      for (const c of this.getConnections<ConnState>()) {
        if (c.state?.role === "visitor") {
          send(c, { t: "delta", text });
          send(c, { t: "done", handoff: false });
        }
      }
      return;
    }

    const settings = await loadSettings(this.env.DB);
    const refuse = async (code: string): Promise<void> => {
      send(connection, { t: "refuse", code });
      if (!preview) {
        writeEvent(this.env.AE, {
          page_url: this.state.meta.page_url ?? "",
          intent: "",
          model: "",
          outcome: `refused_${code}`,
          source: msg.source,
          ttft_ms: 0,
          total_ms: 0,
          retrieval_top_score: 0,
          grounded_score: 0,
          grounded_commit: 0,
          conversation_id: this.conversationId(),
        });
      }
    };

    if (!settings.enabled) {
      await refuse("disabled");
      return;
    }
    if (!this.state.meta.verified && !preview) {
      await refuse("turnstile");
      return;
    }
    if (msg.text.length > settings.maxCharsPerMessage) {
      await refuse("too_long");
      return;
    }
    if (this.state.messages.length >= settings.maxMessages * 2) {
      await refuse("too_many");
      return;
    }
    if (this.state.turnInFlight) {
      await refuse("busy");
      return;
    }

    if (!preview) {
      const ipKey = "ip:unknown";
      const convKey = `conv:${this.conversationId()}`;
      const [a, b] = await Promise.all([
        this.env.RATE_LIMITER.limit({ key: ipKey }),
        this.env.RATE_LIMITER.limit({ key: convKey }),
      ]);
      if (!a.success || !b.success) {
        await refuse("rate");
        return;
      }
    }

    const turnStart = Date.now();
    this.setState({
      ...this.state,
      messages: [...this.state.messages, { role: "user", content: msg.text }],
      turnInFlight: true,
    });

    let assistantText = "";
    let intent = "question";
    let retrievalScore = 0;
    let outcome: "chat" | "lead" | "support" | `declined_${string}` = "chat";
    let ttft = 0;
    let model = settings.modelMain || this.env.MODEL_MAIN_DEFAULT;
    let handoffThisTurn = false;
    let context = "";
    let generateCalls = 0;
    let searchedThisTurn = false;

    try {
      const refined = await refine({
        env: this.env,
        messages: this.state.messages.slice(0, -1),
        newMessage: msg.text,
      });
      intent = refined.intent;

      if (refined.intent === "abuse" || refined.intent === "injection") {
        assistantText = DECLINE_ABUSE;
        outcome = `declined_${refined.intent}`;
        broadcastFrame(this, { t: "delta", text: assistantText });
        broadcastFrame(this, { t: "done", handoff: false });
        this.setState({
          ...this.state,
          messages: [...this.state.messages, { role: "assistant", content: assistantText }],
        });
      } else if (refined.intent === "off_topic") {
        assistantText = DECLINE_OFF_TOPIC;
        outcome = "declined_off_topic";
        broadcastFrame(this, { t: "delta", text: assistantText });
        broadcastFrame(this, { t: "done", handoff: false });
        this.setState({
          ...this.state,
          messages: [...this.state.messages, { role: "assistant", content: assistantText }],
        });
      } else {
        const retrieved = await retrieve({ env: this.env, query: refined.query });
        context = retrieved.context;
        retrievalScore = retrieved.topScore;

        const system = buildSystemPrompt({
          settings,
          context,
          pageUrl: this.state.meta.page_url,
          pillar: refined.pillar,
        });

        type AnthropicMsg = {
          role: "user" | "assistant";
          content: string | ContentBlock[];
        };

        const history: AnthropicMsg[] = this.state.messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const runGenerate = async (tools: unknown[], msgs: AnthropicMsg[]) => {
          generateCalls += 1;
          if (generateCalls > 2) {
            throw new Error("generate_cap");
          }
          return generate({
            env: this.env,
            settings,
            model,
            system,
            messages: msgs,
            tools,
            onDelta: (text) => broadcastFrame(this, { t: "delta", text }),
          });
        };

        const customTools = await customToolsForTurn(this.env.DB);
        const turnTools = toolsForTurn({
          handoffDone: this.state.handoffDone,
          closing: false,
          customTools,
        });

        let gen: Awaited<ReturnType<typeof generate>>;
        try {
          gen = await runGenerate(turnTools, history);
        } catch (err) {
          if (err instanceof Error && err.message === "gateway_5xx") {
            assistantText = TROUBLE;
            broadcastFrame(this, { t: "delta", text: assistantText });
            broadcastFrame(this, { t: "done", handoff: false });
            this.setState({
              ...this.state,
              messages: [...this.state.messages, { role: "assistant", content: assistantText }],
            });
            return;
          }
          throw err;
        }
        ttft = gen.ttft_ms;
        assistantText = gen.text;

        let msgs: AnthropicMsg[] = [
          ...history,
          { role: "assistant", content: gen.contentBlocks.length ? gen.contentBlocks : gen.text },
        ];

        const pushToolResult = (toolUseId: string, content: string) => {
          msgs.push({
            role: "user",
            content: [{ type: "tool_result", tool_use_id: toolUseId, content }],
          });
        };

        const runTool = async (tool: {
          id: string;
          name: string;
          input: unknown;
        }): Promise<string> => {
          if (tool.name === "search_knowledge") {
            const q =
              tool.input && typeof tool.input === "object" && "query" in tool.input
                ? String((tool.input as { query: string }).query)
                : "";
            const result = await executeSearchKnowledge(this.env, q, searchedThisTurn);
            searchedThisTurn = true;
            return result.text;
          }
          if (tool.name === "book_meeting") {
            if (!preview) {
              writeEvent(this.env.AE, {
                page_url: this.state.meta.page_url ?? "",
                intent,
                model,
                outcome: "chat",
                source: "book_meeting",
                ttft_ms: 0,
                total_ms: 0,
                retrieval_top_score: 0,
                grounded_score: 0,
                grounded_commit: 0,
                conversation_id: this.conversationId(),
              });
            }
            return executeBookMeeting(this.env);
          }
          if (tool.name === "handoff") {
            const parsed = parseHandoffInput(tool.input);
            if (!parsed) return "Invalid handoff input.";
            if (this.state.handoffDone) {
              return "Handoff already recorded for this conversation.";
            }
            const convId = preview ? `preview_${this.conversationId()}` : this.conversationId();
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
              settings,
              host: new URL(connection.uri ?? "https://localhost").host,
              waitUntil: (p) => this.waitUntil(p),
              preview,
            });
            if (result.handoffDone) {
              handoffThisTurn = true;
              outcome = result.handoffType === "support" ? "support" : "lead";
              this.setState({ ...this.state, handoffDone: true });
              if (result.handoffId && !preview) {
                await this.schedule(86400, "followUp", { handoffId: result.handoffId });
              }
            }
            return result.toolResult;
          }
          return executeCustomAction({
            db: this.env.DB,
            name: tool.name,
            input: tool.input,
            preview,
          });
        };

        if (gen.toolUses.length > 0) {
          for (const tool of gen.toolUses) {
            const toolResult = await runTool(tool);
            pushToolResult(tool.id, toolResult);
          }
          if (generateCalls < 2) {
            const closingTools = gen.toolUses.every((t) => t.name === "search_knowledge")
              ? toolsForTurn({
                  handoffDone: this.state.handoffDone,
                  closing: false,
                  customTools,
                })
              : [];
            try {
              const second = await runGenerate(closingTools, msgs);
              if (second.text) assistantText = second.text;
              ttft = ttft || second.ttft_ms;
              if (second.toolUses.length > 0 && closingTools.length > 0) {
                msgs = [
                  ...msgs,
                  {
                    role: "assistant",
                    content: second.contentBlocks.length ? second.contentBlocks : second.text,
                  },
                ];
                for (const tool of second.toolUses) {
                  const toolResult = await runTool(tool);
                  pushToolResult(tool.id, toolResult);
                }
                if (!assistantText) {
                  assistantText = "Thanks — I've noted that.";
                }
              }
            } catch (err) {
              if (err instanceof Error && err.message === "gateway_5xx") {
                if (!assistantText) assistantText = TROUBLE;
              } else if (!(err instanceof Error && err.message === "generate_cap")) {
                throw err;
              }
            }
          }
        }

        if (!assistantText) {
          assistantText = "Happy to help — what would you like to know?";
          broadcastFrame(this, { t: "delta", text: assistantText });
        }

        this.setState({
          ...this.state,
          messages: [...this.state.messages, { role: "assistant", content: assistantText }],
        });
        broadcastFrame(this, { t: "done", handoff: handoffThisTurn });
      }
    } catch (err) {
      console.log("turn error", err);
      send(connection, { t: "err" });
    } finally {
      this.setState({ ...this.state, turnInFlight: false });
      const total = Date.now() - turnStart;
      if (!preview) {
        this.waitUntil(
          this.afterTurn({
            settings,
            assistantText,
            context,
            retrievalScore,
            intent,
            model,
            outcome,
            source: msg.source,
            ttft,
            total,
            userText: msg.text,
          }),
        );
      }
    }
  }

  private async afterTurn(opts: {
    settings: Settings;
    assistantText: string;
    context: string;
    retrievalScore: number;
    intent: string;
    model: string;
    outcome: "chat" | "lead" | "support" | `declined_${string}`;
    source: string;
    ttft: number;
    total: number;
    userText: string;
  }): Promise<void> {
    const convId = this.conversationId();
    const now = Date.now();
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
      .bind(convId, opts.userText, now, opts.retrievalScore)
      .run();

    const grounded = await validateGroundedness({
      env: this.env,
      context: opts.context,
      reply: opts.assistantText,
    });

    await this.env.DB.prepare(
      `INSERT INTO messages (conversation_id, role, content, created_at, grounded_score, grounded_commit)
       VALUES (?, 'assistant', ?, ?, ?, ?)`,
    )
      .bind(
        convId,
        opts.assistantText,
        now + 1,
        grounded.score < 0 ? null : grounded.score,
        grounded.score < 0 ? null : grounded.commit ? 1 : 0,
      )
      .run();

    writeEvent(this.env.AE, {
      page_url: this.state.meta.page_url ?? "",
      intent: opts.intent,
      model: opts.model,
      outcome: opts.outcome,
      source: opts.source,
      ttft_ms: opts.ttft,
      total_ms: opts.total,
      retrieval_top_score: opts.retrievalScore,
      grounded_score: grounded.score < 0 ? 0 : grounded.score,
      grounded_commit: grounded.commit ? 1 : 0,
      conversation_id: convId,
    });
  }

  async followUp(payload: { handoffId: string }): Promise<void> {
    const row = await this.env.DB.prepare(
      `SELECT id, type, email, name, company, pillar, timeline, scale, summary, page_url, status, conversation_id
       FROM handoffs WHERE id = ?`,
    )
      .bind(payload.handoffId)
      .first<{
        id: string;
        type: "lead" | "support";
        email: string;
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
        name: row.name ?? undefined,
        company: row.company ?? undefined,
        pillar: row.pillar ?? undefined,
        timeline: row.timeline ?? undefined,
        scale: row.scale ?? undefined,
        summary: row.summary,
        page_url: row.page_url ?? undefined,
        conversation_id: row.conversation_id,
        host: "localhost",
        kind: "reminder",
      },
      this.env,
    );
  }
}
