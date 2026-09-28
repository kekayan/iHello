import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormError, PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  api,
  type ActionPublic,
  type McpServerPublic,
  type SecretPublic,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/actions")({
  component: ActionsPage,
});

type Draft = {
  name: string;
  description: string;
  method: string;
  url: string;
  inputSchemaText: string;
  auth: string;
  secretRef: string;
  secretValue: string;
  confirmRequired: boolean;
  enabled: boolean;
  kind: "http" | "static" | "mcp";
  staticMessage: string;
  mcpServerId: string;
  mcpTool: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  description: "",
  method: "POST",
  url: "",
  inputSchemaText: '{"type":"object","properties":{},"required":[]}',
  auth: "bearer",
  secretRef: "",
  secretValue: "",
  confirmRequired: false,
  enabled: true,
  kind: "http",
  staticMessage: "",
  mcpServerId: "",
  mcpTool: "",
};

function kindBadge(a: ActionPublic): string {
  if (a.builtin) return "built-in";
  if (a.kind === "http" && a.confirmRequired) return "HTTP · confirm first";
  if (a.kind === "http") return "HTTP";
  if (a.kind === "mcp") return "MCP";
  return "static";
}

function summaryLine(a: ActionPublic): string {
  if (a.builtin) return a.description;
  if (a.kind === "http") {
    const method = String(a.config.method || "POST");
    const url = String(a.config.url || "");
    const host = (() => {
      try {
        return new URL(url.replace(/\{[^}]+\}/g, "x")).host;
      } catch {
        return url.slice(0, 40);
      }
    })();
    const secret = a.secretRef ? ` · secret: ${a.secretRef}` : "";
    return `${method} ${host}${secret}`;
  }
  if (a.kind === "mcp") {
    return `server ${String(a.config.serverId || "?")} · tool ${String(a.config.tool || "?")}`;
  }
  return a.description;
}

function ActionsPage() {
  const { toast } = useToast();
  const [actions, setActions] = useState<ActionPublic[]>([]);
  const [secrets, setSecrets] = useState<SecretPublic[]>([]);
  const [servers, setServers] = useState<McpServerPublic[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [testOut, setTestOut] = useState<string | null>(null);
  const [mcpDraft, setMcpDraft] = useState({
    id: "",
    name: "",
    url: "",
    allowedTools: [] as string[],
    discovered: [] as Array<{ name: string; description?: string }>,
    secretRef: "",
    secretValue: "",
  });
  const [mcpStatus, setMcpStatus] = useState<string | null>(null);
  const [tab, setTab] = useState("tools");
  const [secretDraft, setSecretDraft] = useState({ name: "", value: "" });

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [a, s, m] = await Promise.all([
        api<{ actions: ActionPublic[] }>("/api/actions"),
        api<{ secrets: SecretPublic[] }>("/api/secrets"),
        api<{ servers: McpServerPublic[] }>("/api/mcp-servers"),
      ]);
      setActions(a.actions || []);
      setSecrets(s.secrets || []);
      setServers(m.servers || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const editing = useMemo(
    () => actions.find((a) => a.name === selected) || null,
    [actions, selected],
  );

  function startNew() {
    setTab("tools");
    setSelected("__new__");
    setDraft(EMPTY_DRAFT);
    setTestOut(null);
  }

  function openAction(a: ActionPublic) {
    setTab("tools");
    if (a.builtin) {
      setSelected(a.name);
      setDraft({
        ...EMPTY_DRAFT,
        name: a.name,
        description: a.description,
        inputSchemaText: JSON.stringify(a.inputSchema, null, 2),
        kind: "http",
      });
      setTestOut(null);
      return;
    }
    setSelected(a.name);
    setDraft({
      name: a.name,
      description: a.description,
      method: String(a.config.method || "POST"),
      url: String(a.config.url || ""),
      inputSchemaText: JSON.stringify(a.inputSchema, null, 2),
      auth: String(a.config.auth || "bearer"),
      secretRef: a.secretRef || "",
      secretValue: "",
      confirmRequired: a.confirmRequired,
      enabled: a.enabled,
      kind: a.kind === "builtin" ? "http" : a.kind,
      staticMessage: String(a.config.message || ""),
      mcpServerId: String(a.config.serverId || ""),
      mcpTool: String(a.config.tool || ""),
    });
    setTestOut(
      a.lastError
        ? `last error · ${a.lastError}`
        : a.useCount
          ? `used ${a.useCount}×`
          : null,
    );
  }

  async function saveAction() {
    if (editing?.builtin) {
      toast("Built-ins aren’t editable");
      return;
    }
    let inputSchema: Record<string, unknown>;
    try {
      inputSchema = JSON.parse(draft.inputSchemaText) as Record<string, unknown>;
    } catch {
      toast("Parameters JSON is invalid");
      return;
    }
    if (draft.secretValue && draft.secretRef) {
      await api("/api/secrets", {
        method: "PUT",
        body: JSON.stringify({ name: draft.secretRef, value: draft.secretValue }),
      });
    }
    const config: Record<string, unknown> =
      draft.kind === "http"
        ? { method: draft.method, url: draft.url, auth: draft.auth }
        : draft.kind === "static"
          ? { message: draft.staticMessage }
          : { serverId: draft.mcpServerId, tool: draft.mcpTool };

    const res = await api<{ action: ActionPublic }>("/api/actions", {
      method: "PUT",
      body: JSON.stringify({
        name: draft.name,
        description: draft.description,
        inputSchema,
        kind: draft.kind,
        config,
        secretRef: draft.secretRef || null,
        confirmRequired: draft.confirmRequired,
        enabled: draft.enabled,
      }),
    });
    toast("Action saved");
    setSelected(res.action.name);
    setDraft((d) => ({ ...d, secretValue: "" }));
    await load();
  }

  async function runTest() {
    if (!draft.name || editing?.builtin) return;
    let input: unknown = {};
    try {
      const schema = JSON.parse(draft.inputSchemaText) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      const sample: Record<string, string> = {};
      for (const key of schema.required || Object.keys(schema.properties || {})) {
        sample[key] = "test";
      }
      input = sample;
    } catch {
      /* ignore */
    }
    const res = await api<{ ok: boolean; result: string }>(
      `/api/actions/${encodeURIComponent(draft.name)}/test`,
      { method: "POST", body: JSON.stringify({ input }) },
    );
    setTestOut(res.result);
    toast(res.ok ? "Test run OK" : "Test run failed");
    await load();
  }

  async function toggleEnabled(a: ActionPublic, enabled: boolean) {
    await api(`/api/actions/${encodeURIComponent(a.name)}/enabled`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    await load();
  }

  async function saveMcp() {
    if (mcpDraft.secretValue && mcpDraft.secretRef) {
      await api("/api/secrets", {
        method: "PUT",
        body: JSON.stringify({
          name: mcpDraft.secretRef,
          value: mcpDraft.secretValue,
        }),
      });
    }
    const res = await api<{ server: McpServerPublic }>("/api/mcp-servers", {
      method: "PUT",
      body: JSON.stringify({
        id: mcpDraft.id || undefined,
        name: mcpDraft.name || mcpDraft.url,
        url: mcpDraft.url,
        allowedTools: mcpDraft.allowedTools,
        secretRef: mcpDraft.secretRef || null,
        enabled: true,
      }),
    });
    toast("MCP server saved");
    setMcpDraft((d) => ({
      ...d,
      id: res.server.id,
      secretValue: "",
      allowedTools: res.server.allowedTools,
    }));
    await load();
  }

  async function testMcp(id: string) {
    const res = await api<{
      ok: boolean;
      message?: string;
      tools?: Array<{ name: string; description?: string }>;
      error?: string;
    }>(`/api/mcp-servers/${encodeURIComponent(id)}/test`, {
      method: "POST",
      body: "{}",
    });
    if (res.ok) {
      setMcpStatus(
        `${res.message || "connected"} · ${mcpDraft.allowedTools.length || res.tools?.length || 0} allowed`,
      );
      setMcpDraft((d) => ({
        ...d,
        discovered: res.tools || d.discovered,
        id,
      }));
      toast("MCP connected");
    } else {
      setMcpStatus(res.error || "connection failed");
      toast("MCP test failed");
    }
    await load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Setup"
        title="Actions"
        description="Tool registry — built-ins, HTTP, and MCP with an allowlist. Secrets are write-only."
      />
      {err ? <FormError message={err} /> : null}

      <section className="surface p-5">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (value === "tools" || value === "mcp" || value === "secrets") {
              setTab(value);
            }
          }}
        >
          <div className="mb-4 space-y-2">
            <h2 className="text-[15px] font-medium tracking-[-0.01em]">
              Registry
            </h2>
            <p className="text-[13px] text-[var(--ink-3)]">
              Manage tools, MCP servers, and write-only secrets.
            </p>
            <TabsList aria-label="Actions sections">
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="mcp">MCP</TabsTrigger>
              <TabsTrigger value="secrets">Secrets</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="tools" className="space-y-4">
            <div className="overflow-hidden rounded-[12px] border border-[var(--line)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-[7px] bg-[var(--signal-tint)] text-[var(--signal-deep)]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M13 2 4 14h7l-1 8 10-14h-7l0-6z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <h3 className="text-[15px] font-medium tracking-[-0.01em]">Tools</h3>
                </div>
                <Button type="button" size="sm" className="rounded-[10px]" onClick={startNew}>
                  + Add action
                </Button>
              </div>
              {actions.length === 0 ? (
                <p className="px-5 py-6 text-[13px] text-[var(--ink-3)]">
                  No actions yet.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {actions.map((a) => (
                    <li key={a.name}>
                      <button
                        type="button"
                        onClick={() => openAction(a)}
                        className={cn(
                          "flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[var(--paper-3)]/60",
                          selected === a.name && "bg-[var(--signal-tint)]/40",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[13px] font-medium text-[var(--ink)]">
                              {a.name}
                            </span>
                            <span className="rounded-full bg-[var(--paper-3)] px-2 py-0.5 font-mono text-[10px] tracking-[0.04em] text-[var(--ink-3)] uppercase">
                              {kindBadge(a)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[13px] text-[var(--ink-2)]">
                            {summaryLine(a)}
                          </p>
                          {a.lastError ? (
                            <p className="mt-1 truncate font-mono text-[11px] text-[var(--rose-ink)]">
                              err · {a.lastError}
                            </p>
                          ) : null}
                        </div>
                        <label
                          className="flex shrink-0 items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="font-mono text-[11px] text-[var(--ink-3)]">
                            {a.enabled ? "On" : "Off"}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={a.enabled}
                            onClick={() => void toggleEnabled(a, !a.enabled)}
                            className={cn(
                              "relative h-6 w-11 rounded-full transition-colors",
                              a.enabled ? "bg-[var(--mint-ink)]" : "bg-[var(--paper-3)]",
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
                                a.enabled && "translate-x-5",
                              )}
                            />
                          </button>
                        </label>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selected ? (
              <div className="space-y-4 rounded-[12px] border border-[var(--line)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-[7px] bg-[var(--paper-3)] text-[var(--ink-2)]">
                      ✎
                    </span>
                    <h3 className="text-[15px] font-medium tracking-[-0.01em]">
                      {editing?.builtin
                        ? `Built-in — ${draft.name}`
                        : selected === "__new__"
                          ? "New action"
                          : `Edit action — ${draft.name}`}
                    </h3>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-[10px]"
                    onClick={() => {
                      setSelected(null);
                      setTestOut(null);
                    }}
                  >
                    Close
                  </Button>
                </div>

                {editing?.builtin ? (
                  <p className="text-[14px] text-[var(--ink-2)]">
                    Built-ins are code-defined. Use Playground to exercise them. Add an HTTP or MCP
                    action for custom behaviour.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Name (shown to model)</Label>
                        <Input
                          value={draft.name}
                          disabled={selected !== "__new__"}
                          onChange={(e) =>
                            setDraft({ ...draft, name: e.target.value.trim() })
                          }
                          placeholder="book_meeting"
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Kind</Label>
                        <Select
                          value={draft.kind}
                          onValueChange={(v) =>
                            setDraft({
                              ...draft,
                              kind: (v as Draft["kind"]) || "http",
                            })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="http">HTTP</SelectItem>
                            <SelectItem value="mcp">MCP</SelectItem>
                            <SelectItem value="static">Static reply</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {draft.kind === "http" ? (
                      <div className="space-y-1.5">
                        <Label>Method + URL</Label>
                        <div className="flex gap-2">
                          <Select
                            value={draft.method}
                            onValueChange={(v) =>
                              setDraft({ ...draft, method: v || "POST" })
                            }
                          >
                            <SelectTrigger className="w-[7rem]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                                <SelectItem key={m} value={m}>
                                  {m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={draft.url}
                            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                            placeholder="https://api.example.com/v1/slots?date={date}"
                            className="font-mono text-[13px]"
                          />
                        </div>
                      </div>
                    ) : null}

                    {draft.kind === "static" ? (
                      <div className="space-y-1.5">
                        <Label>Reply template</Label>
                        <Textarea
                          value={draft.staticMessage}
                          onChange={(e) =>
                            setDraft({ ...draft, staticMessage: e.target.value })
                          }
                          placeholder="Share this link: https://…"
                        />
                      </div>
                    ) : null}

                    {draft.kind === "mcp" ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>MCP server id</Label>
                          <Select
                            value={draft.mcpServerId || "__none"}
                            onValueChange={(v) =>
                              setDraft({
                                ...draft,
                                mcpServerId: !v || v === "__none" ? "" : v,
                              })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select server" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">Select…</SelectItem>
                              {servers.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Tool name</Label>
                          <Input
                            value={draft.mcpTool}
                            onChange={(e) =>
                              setDraft({ ...draft, mcpTool: e.target.value })
                            }
                            className="font-mono"
                            placeholder="lookup_contact"
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-1.5">
                      <Label>Description (tells the model when to use it)</Label>
                      <Input
                        value={draft.description}
                        onChange={(e) =>
                          setDraft({ ...draft, description: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Parameters (JSON schema)</Label>
                      <Textarea
                        value={draft.inputSchemaText}
                        onChange={(e) =>
                          setDraft({ ...draft, inputSchemaText: e.target.value })
                        }
                        className="min-h-[100px] font-mono text-[12px]"
                      />
                    </div>

                    {draft.kind === "http" || draft.kind === "mcp" ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Auth</Label>
                          <Select
                            value={draft.auth}
                            onValueChange={(v) =>
                              setDraft({ ...draft, auth: v || "bearer" })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bearer">Bearer token</SelectItem>
                              <SelectItem value="none">None</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Secret</Label>
                          <div className="flex gap-2">
                            <Input
                              value={draft.secretRef}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  secretRef: e.target.value.toUpperCase(),
                                })
                              }
                              placeholder="CAL_KEY"
                              className="font-mono"
                            />
                            <Input
                              type="password"
                              value={draft.secretValue}
                              onChange={(e) =>
                                setDraft({ ...draft, secretValue: e.target.value })
                              }
                              placeholder={
                                secrets.some((s) => s.name === draft.secretRef)
                                  ? "••••••••"
                                  : "Set value"
                              }
                            />
                          </div>
                          <p className="text-[12px] text-[var(--ink-3)]">
                            Write-only — values are never returned after save.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="size-4 accent-foreground"
                        checked={draft.confirmRequired}
                        onChange={(e) =>
                          setDraft({ ...draft, confirmRequired: e.target.checked })
                        }
                      />
                      Confirm with visitor before running
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-[10px]"
                        onClick={() => void runTest()}
                        disabled={selected === "__new__"}
                      >
                        Test run
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-[10px]"
                        onClick={() => void saveAction()}
                      >
                        Save action
                      </Button>
                      {selected !== "__new__" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="rounded-[10px] text-[var(--rose-ink)]"
                          onClick={async () => {
                            await api(`/api/actions/${encodeURIComponent(draft.name)}`, {
                              method: "DELETE",
                            });
                            toast("Deleted");
                            setSelected(null);
                            await load();
                          }}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>

                    {testOut ? (
                      <pre className="overflow-x-auto rounded-[10px] bg-[var(--paper-3)] px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-[var(--ink-2)] whitespace-pre-wrap">
                        {testOut}
                      </pre>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="mcp" className="space-y-4">
            <div className="overflow-hidden rounded-[12px] border border-[var(--line)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-[7px] bg-[var(--paper-3)] text-[var(--ink-2)]">
                    ⧉
                  </span>
                  <h3 className="text-[15px] font-medium tracking-[-0.01em]">
                    MCP servers
                  </h3>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-[10px]"
                  onClick={() =>
                    setMcpDraft({
                      id: "",
                      name: "",
                      url: "",
                      allowedTools: [],
                      discovered: [],
                      secretRef: "",
                      secretValue: "",
                    })
                  }
                >
                  + Add server
                </Button>
              </div>

              <div className="space-y-4 p-5">
                {servers.length === 0 ? (
                  <p className="text-[13px] text-[var(--ink-3)]">
                    No MCP servers connected yet.
                  </p>
                ) : (
                  servers.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-[10px] border border-[var(--line)] px-4 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[13px] font-medium">{s.url}</p>
                          <p className="mt-1 text-[13px] text-[var(--ink-2)]">
                            {s.name}
                            {s.enabled ? " · enabled" : " · disabled"}
                            {s.allowedTools.length
                              ? ` · ${s.allowedTools.length} allowed`
                              : ""}
                            {s.lastError ? ` · err: ${s.lastError}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {s.allowedTools.map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-[var(--signal-tint)] px-2.5 py-1 font-mono text-[11px] text-[var(--signal-deep)]"
                              >
                                ✓ {t}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-[10px]"
                            onClick={() => {
                              setMcpDraft({
                                id: s.id,
                                name: s.name,
                                url: s.url,
                                allowedTools: s.allowedTools,
                                discovered: s.allowedTools.map((n) => ({ name: n })),
                                secretRef: s.secretRef || "",
                                secretValue: "",
                              });
                              void testMcp(s.id);
                            }}
                          >
                            Test connection
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="rounded-[10px]"
                            onClick={async () => {
                              await api(`/api/mcp-servers/${encodeURIComponent(s.id)}`, {
                                method: "DELETE",
                              });
                              toast("Server removed");
                              await load();
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                <div className="space-y-3 rounded-[10px] border border-dashed border-[var(--line-strong)] p-4">
                  <p className="mono-label font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
                    {mcpDraft.id ? "Edit server" : "New server"}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>URL</Label>
                      <Input
                        value={mcpDraft.url}
                        onChange={(e) =>
                          setMcpDraft({ ...mcpDraft, url: e.target.value })
                        }
                        placeholder="https://mcp.example.com/mcp"
                        className="font-mono text-[13px]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Name</Label>
                      <Input
                        value={mcpDraft.name}
                        onChange={(e) =>
                          setMcpDraft({ ...mcpDraft, name: e.target.value })
                        }
                        placeholder="Company CRM"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Secret ref</Label>
                      <div className="flex gap-2">
                        <Input
                          value={mcpDraft.secretRef}
                          onChange={(e) =>
                            setMcpDraft({
                              ...mcpDraft,
                              secretRef: e.target.value.toUpperCase(),
                            })
                          }
                          placeholder="MCP_TOKEN"
                          className="font-mono"
                        />
                        <Input
                          type="password"
                          value={mcpDraft.secretValue}
                          onChange={(e) =>
                            setMcpDraft({ ...mcpDraft, secretValue: e.target.value })
                          }
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                  </div>

                  {mcpDraft.discovered.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[13px] text-[var(--ink-2)]">
                        {mcpStatus ||
                          `connected · ${mcpDraft.discovered.length} tools found · ${mcpDraft.allowedTools.length} allowed`}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {mcpDraft.discovered.map((t) => {
                          const on = mcpDraft.allowedTools.includes(t.name);
                          return (
                            <button
                              key={t.name}
                              type="button"
                              onClick={() =>
                                setMcpDraft({
                                  ...mcpDraft,
                                  allowedTools: on
                                    ? mcpDraft.allowedTools.filter((x) => x !== t.name)
                                    : [...mcpDraft.allowedTools, t.name],
                                })
                              }
                              className={cn(
                                "rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors",
                                on
                                  ? "bg-[var(--signal-tint)] text-[var(--signal-deep)]"
                                  : "border border-[var(--line)] text-[var(--ink-3)]",
                              )}
                            >
                              {on ? `✓ ${t.name}` : t.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : mcpStatus ? (
                    <p className="text-[13px] text-[var(--ink-2)]">{mcpStatus}</p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-[10px]"
                      onClick={async () => {
                        await saveMcp();
                        if (mcpDraft.id || mcpDraft.url) {
                          const list = await api<{ servers: McpServerPublic[] }>(
                            "/api/mcp-servers",
                          );
                          const hit =
                            list.servers.find((s) => s.url === mcpDraft.url) ||
                            list.servers.find((s) => s.id === mcpDraft.id);
                          if (hit) await testMcp(hit.id);
                        }
                      }}
                    >
                      Test connection
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-[10px]"
                      onClick={() => void saveMcp()}
                    >
                      Save server
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="secrets" className="space-y-4">
            <div className="overflow-hidden rounded-[12px] border border-[var(--line)]">
              <div className="border-b border-[var(--line)] px-5 py-3.5">
                <h3 className="text-[15px] font-medium tracking-[-0.01em]">
                  Secrets
                </h3>
                <p className="mt-1 text-[13px] text-[var(--ink-3)]">
                  Write-only names — values are never returned after save.
                </p>
              </div>
              <div className="space-y-4 p-5">
                {secrets.length === 0 ? (
                  <p className="text-[13px] text-[var(--ink-3)]">
                    No secrets stored yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--line)] rounded-[10px] border border-[var(--line)]">
                    {secrets.map((s) => (
                      <li
                        key={s.name}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-[13px] font-medium text-[var(--ink)]">
                            {s.name}
                          </p>
                          <p className="mt-0.5 text-[12px] text-[var(--ink-3)]">
                            Updated {new Date(s.updatedAt).toLocaleString()} · ••••••••
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="rounded-[10px] text-[var(--rose-ink)]"
                          onClick={async () => {
                            await api(`/api/secrets/${encodeURIComponent(s.name)}`, {
                              method: "DELETE",
                            });
                            toast("Secret removed");
                            await load();
                          }}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="space-y-3 rounded-[10px] border border-dashed border-[var(--line-strong)] p-4">
                  <p className="mono-label font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
                    Set secret
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Name</Label>
                      <Input
                        value={secretDraft.name}
                        onChange={(e) =>
                          setSecretDraft({
                            ...secretDraft,
                            name: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="CAL_KEY"
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Value</Label>
                      <Input
                        type="password"
                        value={secretDraft.value}
                        onChange={(e) =>
                          setSecretDraft({
                            ...secretDraft,
                            value: e.target.value,
                          })
                        }
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-[10px]"
                    onClick={async () => {
                      if (!secretDraft.name.trim() || !secretDraft.value) {
                        toast("Name and value required");
                        return;
                      }
                      await api("/api/secrets", {
                        method: "PUT",
                        body: JSON.stringify({
                          name: secretDraft.name.trim(),
                          value: secretDraft.value,
                        }),
                      });
                      toast("Secret saved");
                      setSecretDraft({ name: "", value: "" });
                      await load();
                    }}
                  >
                    Save secret
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
