import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, type Gap } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { FormError, PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export const Route = createFileRoute("/knowledge")({
  component: KnowledgePage,
});

type ImportMode = "page" | "document";

type CrawlTarget = {
  url: string;
  label: string;
  source: "seed" | "page" | "sitemap";
};

type SourceRow = {
  key: string;
  id: string;
  name?: string;
  title?: string;
  source_url?: string | null;
  updated_at?: number;
};

const PAGE_SIZE = 20;

function KnowledgePage() {
  const { toast } = useToast();
  const [status, setStatus] = useState("Index status: —");
  const [docsTotal, setDocsTotal] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const [files, setFiles] = useState<SourceRow[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>("page");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [vectorizeBusy, setVectorizeBusy] = useState(false);
  const [vectorizeStatus, setVectorizeStatus] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [targets, setTargets] = useState<CrawlTarget[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await api<{
        result?: {
          total?: number;
          docs?: number;
          chunks?: number;
        };
        error?: string;
      }>("/api/knowledge/status");
      if (s.error) {
        setStatus("Index status: " + s.error);
        setDocsTotal(0);
        setChunkCount(0);
      } else {
        const r = s.result;
        const total = r?.docs ?? r?.total ?? 0;
        const chunks = r?.chunks ?? 0;
        setDocsTotal(total);
        setChunkCount(chunks);
        setStatus(`Index status: docs ${total} · chunks ${chunks}`);
      }
    } catch (e) {
      setStatus(
        "Index status: " + (e instanceof Error ? e.message : "unavailable"),
      );
      setDocsTotal(0);
      setChunkCount(0);
    }
  }, []);

  const loadFiles = useCallback(
    async (nextOffset = offset, nextQ = q) => {
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(nextOffset),
        });
        if (nextQ.trim()) params.set("q", nextQ.trim());
        const f = await api<{
          result?: SourceRow[];
          files?: SourceRow[];
          result_info?: {
            total_count?: number;
            limit?: number;
            offset?: number;
          };
        }>(`/api/knowledge/files?${params.toString()}`);
        const list = f.result || f.files || [];
        setFiles(
          list.map((x) => ({
            key: x.key || x.id || x.name || "",
            id: x.id || x.key || x.name || "",
            name: x.name,
            title: x.title,
            source_url: x.source_url,
            updated_at: x.updated_at,
          })).filter((x) => x.key),
        );
        setListTotal(f.result_info?.total_count ?? list.length);
        setOffset(nextOffset);
      } catch {
        setFiles([]);
        setListTotal(0);
      }
    },
    [offset, q],
  );

  const loadGaps = useCallback(async () => {
    try {
      const g = await api<{ gaps: Gap[] }>("/api/gaps");
      setGaps(g.gaps || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const reload = useCallback(async () => {
    setErr(null);
    await Promise.all([loadStatus(), loadFiles(offset, q), loadGaps()]);
  }, [loadStatus, loadFiles, loadGaps, offset, q]);

  useEffect(() => {
    void reload();
    // initial + when q/offset change via explicit loadFiles calls
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadFiles(offset, q);
  }, [offset, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const showingFrom = listTotal === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + files.length, listTotal);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < listTotal;

  let vectorizeCardValue = chunkCount ? `${chunkCount} chunks` : "Empty index";
  let vectorizeCardMeta = "Rebuild to re-chunk all documents";
  if (vectorizeBusy) {
    vectorizeCardValue = "Rebuilding…";
    vectorizeCardMeta = "Re-chunking from D1 docs";
  } else if (vectorizeStatus) {
    vectorizeCardValue = "Ready";
    vectorizeCardMeta = vectorizeStatus.replace(/^Index:\s*/, "");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Knowledge"
        title="Knowledge"
        description="Sources and gaps — keep the agent grounded."
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-[10px]"
            disabled={vectorizeBusy}
            onClick={async () => {
              setVectorizeBusy(true);
              setErr(null);
              try {
                const res = await api<{
                  ok?: boolean;
                  chunks?: number;
                  sources?: number;
                  error?: string;
                }>("/api/knowledge/vectorize-sync", {
                  method: "POST",
                  body: "{}",
                });
                if (res.error) throw new Error(res.error);
                const chunks = res.chunks ?? 0;
                const sources = res.sources ?? 0;
                setVectorizeStatus(
                  `Index: ${chunks} chunks · ${sources} sources`,
                );
                toast(
                  `Index rebuilt · ${chunks} chunks · ${sources} sources`,
                );
                await Promise.all([loadStatus(), loadFiles(offset, q)]);
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              } finally {
                setVectorizeBusy(false);
              }
            }}
          >
            {vectorizeBusy ? "Rebuilding…" : "Rebuild index"}
          </Button>
        }
      />
      {err ? <FormError message={err} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface px-4 py-3.5">
          <p className="mono-label font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
            Documents
          </p>
          <p className="mt-1.5 text-[22px] font-medium tracking-[-0.02em] tabular-nums text-[var(--ink)]">
            {docsTotal}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-[var(--ink-3)]">
            {docsTotal ? "Stored in D1" : "No documents yet"}
          </p>
        </div>
        <div className="surface px-4 py-3.5">
          <p className="mono-label font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
            Vectorize
          </p>
          <p className="mt-1.5 truncate text-[15px] font-medium tracking-[-0.01em] text-[var(--ink)]">
            {vectorizeCardValue}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-[var(--ink-3)]">
            {vectorizeCardMeta}
          </p>
        </div>
      </div>
      <p className="mono-label -mt-2 font-mono text-[11px] text-[var(--ink-3)]">
        {status}
        {vectorizeStatus ? ` · ${vectorizeStatus}` : ""}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] lg:gap-5">
        <section className="surface flex max-h-[min(640px,70vh)] flex-col overflow-hidden">
          <div className="space-y-3 border-b border-[var(--line)] px-5 py-3.5">
            <h2 className="text-[15px] font-medium tracking-[-0.01em]">
              Sources · {listTotal}
            </h2>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setOffset(0);
                setQ(qInput.trim());
              }}
            >
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Filter by title or id"
                className="h-8"
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="shrink-0 rounded-[10px]"
              >
                Search
              </Button>
            </form>
          </div>
          {files.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-[var(--ink-3)]">
              {q
                ? "No sources match this filter."
                : "No documents yet — import a page or add markdown."}
            </p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-[var(--line)] overflow-y-auto">
              {files.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-[var(--signal-tint)]/30"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[13px] font-medium text-[var(--ink)]"
                      title={row.title || row.key}
                    >
                      {row.title || row.key}
                    </span>
                    {row.source_url ? (
                      <span
                        className="mono-label block truncate font-mono text-[11px] text-[var(--ink-3)]"
                        title={row.source_url}
                      >
                        {row.source_url.length > 72
                          ? `${row.source_url.slice(0, 72)}…`
                          : row.source_url}
                      </span>
                    ) : (
                      <span
                        className="mono-label block truncate font-mono text-[11px] text-[var(--ink-3)]"
                        title={row.key}
                      >
                        {row.key}
                      </span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 rounded-[10px]"
                    onClick={async () => {
                      try {
                        await api(
                          `/api/knowledge/files/${encodeURIComponent(row.key)}`,
                          {
                            method: "DELETE",
                          },
                        );
                        toast("Deleted");
                        const nextOffset =
                          files.length === 1 && offset > 0
                            ? Math.max(0, offset - PAGE_SIZE)
                            : offset;
                        setOffset(nextOffset);
                        await Promise.all([
                          loadStatus(),
                          loadFiles(nextOffset, q),
                        ]);
                      } catch (e) {
                        setErr(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-4 py-2.5">
            <p className="mono-label font-mono text-[11px] text-[var(--ink-3)]">
              Showing {showingFrom}–{showingTo} of {listTotal}
            </p>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-[10px]"
                disabled={!canPrev}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Prev
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-[10px]"
                disabled={!canNext}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </div>
        </section>

        <section className="surface p-5">
          <Tabs
            value={importMode}
            onValueChange={(value) => {
              if (value === "page" || value === "document") {
                setImportMode(value);
              }
            }}
          >
            <div className="mb-4 space-y-2">
              <h2 className="text-[15px] font-medium tracking-[-0.01em]">
                Add knowledge
              </h2>
              <p className="text-[13px] text-[var(--ink-3)]">
                Import pages or paste markdown — indexed into Vectorize.
              </p>
              <TabsList aria-label="Import mode">
                <TabsTrigger value="page">Import pages</TabsTrigger>
                <TabsTrigger value="document">Markdown / file</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="page" className="space-y-3">
              <p className="text-sm text-[var(--ink-3)]">
                Find same-site links (and sitemap URLs), pick which pages to
                import — no Cloudflare zone required.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="import-url">Site or page URL</Label>
                <Input
                  id="import-url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://example.com"
                  autoComplete="url"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="rounded-[10px]"
                  disabled={discoverBusy || importBusy || !importUrl.trim()}
                  onClick={async () => {
                    setDiscoverBusy(true);
                    setErr(null);
                    try {
                      const res = await api<{
                        targets?: CrawlTarget[];
                        error?: string;
                      }>("/api/knowledge/discover", {
                        method: "POST",
                        body: JSON.stringify({ url: importUrl.trim() }),
                      });
                      if (res.error) throw new Error(res.error);
                      const list = res.targets || [];
                      setTargets(list);
                      setSelected(new Set(list.map((t) => t.url)));
                      toast(
                        list.length
                          ? `Found ${list.length} page${list.length === 1 ? "" : "s"}`
                          : "No pages found",
                      );
                    } catch (e) {
                      setTargets([]);
                      setSelected(new Set());
                      setErr(e instanceof Error ? e.message : String(e));
                    } finally {
                      setDiscoverBusy(false);
                    }
                  }}
                >
                  {discoverBusy ? "Finding…" : "Find pages"}
                </Button>
                {targets.length > 0 ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={discoverBusy || importBusy}
                      onClick={() =>
                        setSelected(new Set(targets.map((t) => t.url)))
                      }
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={discoverBusy || importBusy}
                      onClick={() => setSelected(new Set())}
                    >
                      Clear
                    </Button>
                  </>
                ) : null}
              </div>

              {targets.length > 0 ? (
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-[10px] border border-[var(--line)] p-3">
                  {targets.map((t) => {
                    const checked = selected.has(t.url);
                    return (
                      <label
                        key={t.url}
                        className="flex cursor-pointer items-start gap-2 rounded-[8px] px-2 py-1.5 hover:bg-[var(--paper-3)]"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={() => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(t.url)) next.delete(t.url);
                              else next.add(t.url);
                              return next;
                            });
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--ink)]">
                            {t.label}
                          </span>
                          <span className="mono-label block truncate font-mono text-[11px] text-[var(--ink-3)]">
                            {t.url}
                            {t.source !== "seed" ? ` · ${t.source}` : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              <Button
                type="button"
                size="sm"
                className="rounded-[10px]"
                disabled={importBusy || discoverBusy || selected.size === 0}
                onClick={async () => {
                  setImportBusy(true);
                  setErr(null);
                  try {
                    const urls = [...selected].slice(0, 25);
                    if (selected.size > 25) {
                      toast("Importing first 25 selected pages");
                    }
                    const res = await api<{
                      imported?: Array<{ filename: string }>;
                      failed?: Array<{ url: string; error: string }>;
                      error?: string;
                    }>("/api/knowledge/import-url", {
                      method: "POST",
                      body: JSON.stringify({ urls }),
                    });
                    if (res.error) throw new Error(res.error);
                    const ok = res.imported?.length ?? 0;
                    const fail = res.failed?.length ?? 0;
                    if (fail && res.failed?.length) {
                      const lines = res.failed
                        .slice(0, 8)
                        .map((f) => `${f.url} — ${f.error}`)
                        .join("\n");
                      const more =
                        fail > 8 ? `\n…and ${fail - 8} more` : "";
                      setErr(
                        fail === 1
                          ? `${res.failed[0]!.url} — ${res.failed[0]!.error}`
                          : `${fail} pages failed:\n${lines}${more}`,
                      );
                    }
                    toast(
                      fail
                        ? `Imported ${ok}, ${fail} failed`
                        : `Imported ${ok} page${ok === 1 ? "" : "s"}`,
                    );
                    if (ok) {
                      setOffset(0);
                      await Promise.all([loadStatus(), loadFiles(0, q)]);
                    }
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                  } finally {
                    setImportBusy(false);
                  }
                }}
              >
                {importBusy
                  ? "Importing…"
                  : `Import selected (${selected.size})`}
              </Button>
            </TabsContent>

            <TabsContent value="document" className="space-y-3">
              <p className="text-sm text-[var(--ink-3)]">
                Paste markdown or upload a file into D1 + Vectorize.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="doc-name">Filename</Label>
                <Input
                  id="doc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="about.md"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-body">Markdown</Label>
                <Textarea
                  id="doc-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="# About..."
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="rounded-[10px]"
                  onClick={async () => {
                    await api("/api/knowledge/files", {
                      method: "POST",
                      body: JSON.stringify({ filename: name, content: body }),
                    });
                    toast("Added");
                    setName("");
                    setBody("");
                    setOffset(0);
                    await Promise.all([loadStatus(), loadFiles(0, q)]);
                  }}
                >
                  Add document
                </Button>
                <Input
                  type="file"
                  className="max-w-xs"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const fd = new FormData();
                    fd.append("file", file, file.name);
                    const res = await fetch("/api/knowledge/files", {
                      method: "POST",
                      body: fd,
                    });
                    if (!res.ok) throw new Error(await res.text());
                    toast("Uploaded");
                    setOffset(0);
                    await Promise.all([loadStatus(), loadFiles(0, q)]);
                  }}
                />
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="mono-label font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--ink-3)] uppercase">
          Coverage gaps
        </h2>
        {gaps.length === 0 ? (
          <p className="text-[13px] text-[var(--ink-3)]">
            No gaps yet — low-score answers will show up here.
          </p>
        ) : (
          <ul className="surface divide-y divide-[var(--line)] overflow-hidden">
            {gaps.map((g, i) => (
              <li
                key={`${g.question}-${i}`}
                className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
              >
                <p className="min-w-0 flex-1 text-[14px] text-[var(--ink)]">
                  {g.question || "—"}
                </p>
                <span className="inline-flex h-[22px] w-fit shrink-0 items-center rounded-full bg-[var(--paper-3)] px-2 font-mono text-[10px] font-medium tracking-[0.04em] text-[var(--ink-3)] tabular-nums uppercase">
                  {g.score != null ? `score ${g.score}` : "—"}
                </span>
                <span className="min-w-0 truncate text-[12px] text-[var(--ink-3)] sm:max-w-[40%]">
                  {g.page || ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
