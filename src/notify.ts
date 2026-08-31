export interface HandoffNotifyInput {
  type: "lead" | "support";
  email: string;
  name?: string;
  company?: string;
  pillar?: string;
  timeline?: string;
  scale?: string;
  summary: string;
  page_url?: string;
  conversation_id: string;
  host: string;
  kind?: "new" | "reminder";
}

export interface NotifyChannel {
  readonly name: string;
  send(input: HandoffNotifyInput, env: Env): Promise<void>;
}

function formatBody(input: HandoffNotifyInput): string {
  const lines = [
    `Type: ${input.type}`,
    `Email: ${input.email || "(none)"}`,
    `Name: ${input.name || ""}`,
    `Company: ${input.company || ""}`,
    `Pillar: ${input.pillar || ""}`,
    `Timeline: ${input.timeline || ""}`,
    `Scale: ${input.scale || ""}`,
    `Summary: ${input.summary}`,
    `Page: ${input.page_url || ""}`,
    `Transcript: https://${input.host}/admin#conv=${input.conversation_id}`,
  ];
  return lines.join("\n");
}

function subjectFor(input: HandoffNotifyInput): string {
  if (input.kind === "reminder") return "Reminder: unactioned handoff";
  if (input.type === "lead") return `New lead: ${input.email}`;
  return `Support handoff: ${input.email || "no email"}`;
}

export class SlackWebhookChannel implements NotifyChannel {
  readonly name = "slack";

  async send(input: HandoffNotifyInput, env: Env): Promise<void> {
    const url = env.SLACK_WEBHOOK_URL;
    if (!url) {
      console.log("notify: SLACK_WEBHOOK_URL not set — skipping");
      return;
    }
    const text = `*${subjectFor(input)}*\n\`\`\`\n${formatBody(input)}\n\`\`\``;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.log(`notify slack failed: ${res.status} ${await res.text()}`);
    }
  }
}

/** Reserved for a future email channel — interface stays extendable. */
export class EmailChannel implements NotifyChannel {
  readonly name = "email";
  async send(_input: HandoffNotifyInput, _env: Env): Promise<void> {
    // Not configured in v1 (Slack is the active channel).
  }
}

/** Reserved for a future WhatsApp channel — interface stays extendable. */
export class WhatsAppChannel implements NotifyChannel {
  readonly name = "whatsapp";
  async send(_input: HandoffNotifyInput, _env: Env): Promise<void> {
    // Not configured in v1.
  }
}

const channels: NotifyChannel[] = [new SlackWebhookChannel()];

export async function notifyHandoff(input: HandoffNotifyInput, env: Env): Promise<void> {
  for (const channel of channels) {
    try {
      await channel.send(input, env);
    } catch (err) {
      console.log(`notify ${channel.name} error:`, err);
    }
  }
}
