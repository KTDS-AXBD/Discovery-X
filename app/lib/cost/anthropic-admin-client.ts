/**
 * Anthropic Admin API client for cost/usage monitoring.
 * Endpoints: Usage Report, Cost Report, Claude Code Analytics.
 */

const BASE_URL = "https://api.anthropic.com/v1/organizations";
const API_VERSION = "2023-06-01";

// ── Response Types ──────────────────────────────────────────────

export interface UsageBucket {
  start_time: string;
  end_time: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  total_tokens: number;
  request_count: number;
}

export interface UsageReportResponse {
  data: UsageBucket[];
  has_more: boolean;
  next_page?: string;
}

export interface CostBucket {
  start_time: string;
  end_time: string;
  model: string;
  cost_usd: number;
  input_cost_usd: number;
  output_cost_usd: number;
}

export interface CostReportResponse {
  data: CostBucket[];
  has_more: boolean;
  next_page?: string;
}

export interface ClaudeCodeMetric {
  timestamp: string;
  user_id: string;
  user_email: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  conversation_turns: number;
}

export interface ClaudeCodeAnalyticsResponse {
  data: ClaudeCodeMetric[];
  has_more: boolean;
  next_page?: string;
}

// ── Error Types ─────────────────────────────────────────────────

export class AnthropicAdminError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
    this.name = "AnthropicAdminError";
  }
}

// ── Client ──────────────────────────────────────────────────────

export class AnthropicAdminClient {
  private headers: Record<string, string>;

  constructor(adminApiKey: string) {
    this.headers = {
      "x-api-key": adminApiKey,
      "anthropic-version": API_VERSION,
      "content-type": "application/json",
    };
  }

  private async request<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401) {
        throw new AnthropicAdminError("Invalid Admin API Key", 401, "unauthorized");
      }
      if (res.status === 429) {
        throw new AnthropicAdminError("Rate limit exceeded", 429, "rate_limit");
      }
      if (res.status >= 500) {
        throw new AnthropicAdminError(`Server error: ${body}`, res.status, "server_error");
      }
      throw new AnthropicAdminError(`API error (${res.status}): ${body}`, res.status, "api_error");
    }

    return res.json() as Promise<T>;
  }

  private async fetchAll<T extends { data: unknown[]; has_more: boolean; next_page?: string }>(
    baseUrl: string,
  ): Promise<T["data"]> {
    const all: unknown[] = [];
    let url = baseUrl;

    for (;;) {
      const page = await this.request<T>(url);
      all.push(...page.data);

      if (!page.has_more || !page.next_page) break;

      const sep = url.includes("?") ? "&" : "?";
      url = `${baseUrl}${sep}next_page=${encodeURIComponent(page.next_page)}`;
    }

    return all as T["data"];
  }

  async getUsageReport(params: {
    startingAt: string;
    endingAt: string;
    bucketWidth?: "1m" | "1h" | "1d";
    groupBy?: string[];
  }): Promise<UsageBucket[]> {
    const qs = new URLSearchParams({
      starting_at: params.startingAt,
      ending_at: params.endingAt,
    });
    if (params.bucketWidth) qs.set("bucket_width", params.bucketWidth);
    if (params.groupBy?.length) qs.set("group_by", params.groupBy.join(","));

    return this.fetchAll<UsageReportResponse>(
      `${BASE_URL}/usage_report/messages?${qs}`,
    );
  }

  async getCostReport(params: {
    startingAt: string;
    endingAt: string;
    groupBy?: string[];
  }): Promise<CostBucket[]> {
    const qs = new URLSearchParams({
      starting_at: params.startingAt,
      ending_at: params.endingAt,
    });
    if (params.groupBy?.length) qs.set("group_by", params.groupBy.join(","));

    return this.fetchAll<CostReportResponse>(
      `${BASE_URL}/cost_report?${qs}`,
    );
  }

  async getClaudeCodeAnalytics(params: {
    startingAt: string;
    limit?: number;
  }): Promise<ClaudeCodeMetric[]> {
    const qs = new URLSearchParams({ starting_at: params.startingAt });
    if (params.limit) qs.set("limit", String(params.limit));

    return this.fetchAll<ClaudeCodeAnalyticsResponse>(
      `${BASE_URL}/usage_report/claude_code?${qs}`,
    );
  }
}
