interface Env {
  // `import()` type rather than a top-level import: this is a global script,
  // and importing would turn it into a module and un-global `Env` — which
  // chat-agent.ts itself depends on. This is the shape `wrangler types` emits.
  ChatAgent: DurableObjectNamespace<import("./src/chat-agent").ChatAgent>;
  DB: D1Database;
  AE: AnalyticsEngineDataset;
  RATE_LIMITER: RateLimit;
  AI: Ai;
  AI_SEARCH: AiSearchNamespace;
  VECTORIZE: VectorizeIndex;
  ASSETS: Fetcher;
  AI_SEARCH_INSTANCE: string;
  CF_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
  MODEL_MAIN_DEFAULT: string;
  MODEL_SMALL: string;
  TURNSTILE_SITE_KEY: string;
  NOTIFY_TO: string;
  NOTIFY_FROM: string;
  BOOKING_URL: string;
  /** Access application AUD tag from Zero Trust. */
  CF_ACCESS_AUD?: string;
  /** e.g. https://your-team.cloudflareaccess.com */
  CF_ACCESS_TEAM_DOMAIN?: string;
  ANTHROPIC_API_KEY?: string;
  TURNSTILE_SECRET?: string;
  SLACK_WEBHOOK_URL?: string;
  /** Optional — Knowledge REST admin only; chat uses env.AI binding (no key). */
  CF_API_TOKEN?: string;
}

interface AiSearchItem {
  id?: string;
  key?: string;
  status?: string;
  chunks_count?: number;
  file_size?: number;
}

interface AiSearchChunk {
  id: string;
  type: string;
  score: number;
  text: string;
  item: { key: string; timestamp?: number; metadata?: Record<string, unknown> };
  instance_id?: string;
}

interface AiSearchResult {
  search_query: string;
  chunks: AiSearchChunk[];
}

interface AiSearchOptions {
  instance_ids?: string[];
  retrieval?: {
    max_num_results?: number;
    match_threshold?: number;
  };
  query_rewrite?: { enabled?: boolean };
}

interface AiSearchWebCrawlerParams {
  parse_type?: "sitemap" | "discover";
  discover_options?: {
    source?: "all" | "sitemaps" | "links";
    limit?: number;
    depth?: number;
    include_subdomains?: boolean;
    include_external_links?: boolean;
  };
  parse_options?: {
    include_images?: boolean;
    use_browser_rendering?: boolean;
    specific_sitemaps?: string[];
  };
}

interface AiSearchCreateParams {
  id: string;
  type?: "r2" | "web-crawler";
  source?: string;
  source_params?: {
    prefix?: string;
    include_items?: string[];
    exclude_items?: string[];
    web_crawler?: AiSearchWebCrawlerParams;
  };
  index_method?: { vector?: boolean; keyword?: boolean };
  sync_interval?: number;
}

interface AiSearchInfo {
  id: string;
  type: string | null;
  source?: string | null;
  status?: string;
  enable?: boolean;
  sync_interval?: number;
  last_activity?: string;
}

interface AiSearchStats {
  queued?: number;
  running?: number;
  completed?: number;
  failed?: number;
}

interface AiSearchInstance {
  search(params: {
    query?: string;
    messages?: { role: string; content: string }[];
    ai_search_options?: AiSearchOptions;
  }): Promise<AiSearchResult>;
  info(): Promise<AiSearchInfo>;
  stats(): Promise<AiSearchStats>;
  update(params: Partial<Omit<AiSearchCreateParams, "id" | "type">>): Promise<AiSearchInfo>;
  items: {
    list(opts?: {
      page?: number;
      per_page?: number;
      status?: string;
      search?: string;
      key?: string;
    }): Promise<{
      result: AiSearchItem[];
      result_info: {
        count?: number;
        total_count?: number;
        page?: number;
        per_page?: number;
      };
    }>;
    upload(
      name: string,
      content: string | Blob | ArrayBuffer | ReadableStream,
      options?: { metadata?: Record<string, string> },
    ): Promise<AiSearchItem>;
    delete(itemId: string): Promise<void>;
  };
}

interface AiSearchNamespace {
  get(id: string): AiSearchInstance;
  create(opts: AiSearchCreateParams): Promise<AiSearchInstance>;
  delete(id: string): Promise<void>;
  list(opts?: {
    page?: number;
    per_page?: number;
    search?: string;
  }): Promise<{
    result: AiSearchInfo[];
    result_info: { total_count?: number };
  }>;
  search(params: {
    query?: string;
    messages?: { role: string; content: string }[];
    ai_search_options: AiSearchOptions & { instance_ids: string[] };
  }): Promise<AiSearchResult>;
}

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
