import type { CollectedItem, ScoredItem } from "./types";
import { fetchWithRetry } from "./lib/fetch-retry";

interface ScoreResult {
  title: string;
  relevanceScore: number;
  titleKo: string;
  summaryKo: string;
}

interface OpenAIChoice {
  message: { content: string };
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
}

interface AnthropicContent {
  type: string;
  text: string;
}

interface AnthropicResponse {
  content: AnthropicContent[];
}

export interface ScorerEnv {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_AI_API_KEY?: string;
  AI: Ai;
}

export interface ScoreItemsResult {
  items: ScoredItem[];
  errors: string[];
}

const SYSTEM_PROMPT = `You are a research topic evaluator for an AX (신사업) innovation team.
Score each item's relevance to these themes: AI/ML applications, new business models, emerging technology, startup ecosystem, enterprise innovation.

For each item, provide:
- relevanceScore: 0-100 (60+ means worth investigating as a new business opportunity)
- titleKo: Korean translation of title (max 80 chars)
- summaryKo: Korean summary of why it's relevant or not (max 400 chars)

Return JSON: {"results": [{"relevanceScore": N, "titleKo": "...", "summaryKo": "..."}, ...]}
The results array MUST have the same length and order as the input items.`;

const SYSTEM_PROMPT_WORKERS_AI = `${SYSTEM_PROMPT}

Return ONLY valid JSON. Do not include any text outside the JSON object.`;

type Provider = "anthropic" | "openai" | "gemini" | "workers-ai";

/**
 * Score items using a 4-step fallback chain: Anthropic → OpenAI → Gemini → Workers AI.
 * Processes in batches of up to 20 items.
 * Failed providers are skipped for remaining batches within the same run.
 */
export async function scoreItems(
  items: CollectedItem[],
  env: ScorerEnv
): Promise<ScoreItemsResult> {
  if (items.length === 0) return { items: [], errors: [] };

  const batches: CollectedItem[][] = [];
  for (let i = 0; i < items.length; i += 20) {
    batches.push(items.slice(i, i + 20));
  }

  const allScored: ScoredItem[] = [];
  const allErrors: string[] = [];
  const failedProviders = new Set<Provider>();

  for (const batch of batches) {
    const result = await scoreBatchWithFallback(batch, env, failedProviders);
    allScored.push(...result.items);
    allErrors.push(...result.errors);
  }

  return { items: allScored, errors: allErrors };
}

function buildUserContent(items: CollectedItem[]): string {
  return items
    .map(
      (item, i) =>
        `[${i}] Title: ${item.title}\nURL: ${item.url}${item.summary ? `\nSummary: ${item.summary.substring(0, 300)}` : ""}`
    )
    .join("\n\n");
}

function parseScoreResults(content: string): ScoreResult[] {
  const parsed = JSON.parse(content);
  return Array.isArray(parsed)
    ? parsed
    : parsed.results || parsed.items || [];
}

function mapToScoredItems(
  items: CollectedItem[],
  results: ScoreResult[]
): ScoredItem[] {
  return items.map((item, i) => {
    const result = results[i] || {
      relevanceScore: 0,
      titleKo: item.title,
      summaryKo: item.summary || "",
    };

    return {
      ...item,
      titleKo: result.titleKo.substring(0, 80),
      summaryKo: result.summaryKo.substring(0, 400),
      relevanceScore: Math.min(100, Math.max(0, result.relevanceScore)),
    };
  });
}

function zeroScoreFallback(items: CollectedItem[]): ScoredItem[] {
  return items.map((item) => ({
    ...item,
    titleKo: item.title,
    summaryKo: item.summary || "",
    relevanceScore: 0,
  }));
}

async function scoreBatchWithFallback(
  items: CollectedItem[],
  env: ScorerEnv,
  failedProviders: Set<Provider>
): Promise<ScoreItemsResult> {
  const errors: string[] = [];
  const providers: { name: Provider; fn: () => Promise<ScoredItem[]> }[] = [];

  // Fallback chain: Anthropic → OpenAI → Gemini → Workers AI
  if (env.ANTHROPIC_API_KEY && !failedProviders.has("anthropic")) {
    providers.push({
      name: "anthropic",
      fn: () => scoreBatchAnthropic(items, env.ANTHROPIC_API_KEY!),
    });
  }

  if (env.OPENAI_API_KEY && !failedProviders.has("openai")) {
    providers.push({
      name: "openai",
      fn: () => scoreBatchOpenAI(items, env.OPENAI_API_KEY!),
    });
  }

  if (env.GOOGLE_AI_API_KEY && !failedProviders.has("gemini")) {
    providers.push({
      name: "gemini",
      fn: () => scoreBatchGemini(items, env.GOOGLE_AI_API_KEY!),
    });
  }

  if (!failedProviders.has("workers-ai")) {
    providers.push({
      name: "workers-ai",
      fn: () => scoreBatchWorkersAI(items, env.AI),
    });
  }

  for (const provider of providers) {
    try {
      const scored = await provider.fn();
      console.log(`[scorer] Used provider: ${provider.name}`);
      return { items: scored, errors };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const errorMsg = `[scorer] ${provider.name} failed: ${msg}`;
      console.error(errorMsg);
      errors.push(errorMsg);
      failedProviders.add(provider.name);
    }
  }

  // All providers failed — zero score fallback
  console.error(
    `[scorer] All providers failed for batch of ${items.length}, returning zero scores`
  );
  return { items: zeroScoreFallback(items), errors };
}

async function scoreBatchOpenAI(
  items: CollectedItem[],
  apiKey: string
): Promise<ScoredItem[]> {
  const userContent = buildUserContent(items);

  const response = await fetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        max_tokens: 8000,
        response_format: { type: "json_object" },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as OpenAIResponse;
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error("Empty OpenAI response");

  const results = parseScoreResults(content);
  return mapToScoredItems(items, results);
}

async function scoreBatchAnthropic(
  items: CollectedItem[],
  apiKey: string
): Promise<ScoredItem[]> {
  const userContent = buildUserContent(items);

  const response = await fetchWithRetry(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
        temperature: 0.3,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as AnthropicResponse;
  const textBlock = data.content?.find((b) => b.type === "text");
  if (!textBlock?.text) throw new Error("Empty Anthropic response");

  const results = parseScoreResults(textBlock.text);
  return mapToScoredItems(items, results);
}

async function scoreBatchGemini(
  items: CollectedItem[],
  apiKey: string
): Promise<ScoredItem[]> {
  const userContent = buildUserContent(items);

  // No retries for Gemini — 429 quota errors won't recover with backoff
  const response = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userContent }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8000,
          responseMimeType: "application/json",
        },
      }),
    },
    0
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");

  const results = parseScoreResults(text);
  return mapToScoredItems(items, results);
}

async function scoreBatchWorkersAI(
  items: CollectedItem[],
  ai: Ai
): Promise<ScoredItem[]> {
  const userContent = buildUserContent(items);

  const response = await ai.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
    messages: [
      { role: "system", content: SYSTEM_PROMPT_WORKERS_AI },
      { role: "user", content: userContent },
    ],
    max_tokens: 8000,
  });

  const content =
    typeof response === "string"
      ? response
      : (response as { response?: string }).response;

  if (!content) throw new Error("Empty Workers AI response");

  // Workers AI doesn't support response_format — extract JSON manually
  let results: ScoreResult[];
  try {
    results = parseScoreResults(content);
  } catch {
    // Try extracting JSON from markdown code block or surrounding text
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Workers AI returned non-JSON response");
    results = parseScoreResults(jsonMatch[0]);
  }

  return mapToScoredItems(items, results);
}
