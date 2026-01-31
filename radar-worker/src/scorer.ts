import type { CollectedItem, ScoredItem } from "./types";

interface ScoreResult {
  title: string;
  relevanceScore: number;
  titleKo: string;
  summaryKo: string;
}

interface OpenAIMessage {
  role: "system" | "user";
  content: string;
}

interface OpenAIChoice {
  message: { content: string };
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
}

const SYSTEM_PROMPT = `You are a research topic evaluator for an AX (신사업) innovation team.
Score each item's relevance to these themes: AI/ML applications, new business models, emerging technology, startup ecosystem, enterprise innovation.

For each item, provide:
- relevanceScore: 0-100 (60+ means worth investigating as a new business opportunity)
- titleKo: Korean translation of title (max 80 chars)
- summaryKo: Korean summary of why it's relevant or not (max 400 chars)

Return JSON: {"results": [{"relevanceScore": N, "titleKo": "...", "summaryKo": "..."}, ...]}
The results array MUST have the same length and order as the input items.`;

/**
 * Score items using GPT-4o-mini for relevance and Korean translation.
 * Processes in batches of up to 20 items.
 */
export async function scoreItems(
  items: CollectedItem[],
  apiKey: string
): Promise<ScoredItem[]> {
  if (items.length === 0) return [];

  const batches: CollectedItem[][] = [];
  for (let i = 0; i < items.length; i += 20) {
    batches.push(items.slice(i, i + 20));
  }

  const allScored: ScoredItem[] = [];

  for (const batch of batches) {
    const scored = await scoreBatch(batch, apiKey);
    allScored.push(...scored);
  }

  return allScored;
}

async function scoreBatch(
  items: CollectedItem[],
  apiKey: string
): Promise<ScoredItem[]> {
  const userContent = items
    .map(
      (item, i) =>
        `[${i}] Title: ${item.title}\nURL: ${item.url}${item.summary ? `\nSummary: ${item.summary.substring(0, 300)}` : ""}`
    )
    .join("\n\n");

  const messages: OpenAIMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.3,
        max_tokens: 8000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as OpenAIResponse;
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error("Empty OpenAI response");

    const parsed = JSON.parse(content);
    const results: ScoreResult[] = Array.isArray(parsed)
      ? parsed
      : parsed.results || parsed.items || [];

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
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[scorer] AI scoring failed for batch of ${items.length}: ${msg}`);
    // Fallback: return items with zero scores
    return items.map((item) => ({
      ...item,
      titleKo: item.title,
      summaryKo: item.summary || "",
      relevanceScore: 0,
    }));
  }
}
