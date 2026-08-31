interface Env {
  ChatAgent: DurableObjectNamespace;
  DB: D1Database;
  AE: AnalyticsEngineDataset;
  RATE_LIMITER: RateLimit;
  AI_SEARCH: AiSearchInstance;
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
  ANTHROPIC_API_KEY?: string;
  TURNSTILE_SECRET?: string;
  SLACK_WEBHOOK_URL?: string;
  CF_API_TOKEN?: string;
}

interface AiSearchInstance {
  search(params: {
    query?: string;
    messages?: { role: string; content: string }[];
    ai_search_options?: {
      retrieval?: {
        max_num_results?: number;
        match_threshold?: number;
      };
      query_rewrite?: { enabled?: boolean };
    };
  }): Promise<{
    search_query: string;
    chunks: Array<{
      id: string;
      type: string;
      score: number;
      text: string;
      item: { key: string; timestamp?: number; metadata?: Record<string, unknown> };
    }>;
  }>;
}

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
