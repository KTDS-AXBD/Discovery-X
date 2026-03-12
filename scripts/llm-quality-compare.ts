/**
 * LLM Service 품질 비교 스크립트
 * 각 프로바이더(ChatGPT, Gemini, DeepSeek, Workers AI)에 동일 프롬프트를 보내
 * 응답 품질·속도·비용을 비교한다.
 *
 * 사용법: npx tsx scripts/llm-quality-compare.ts
 * 환경변수: .dev.vars 파일에서 API 키를 읽음
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .dev.vars에서 환경변수 로드
const devVarsPath = resolve(__dirname, "../.dev.vars");
const envVars: Record<string, string> = {};
try {
  const content = readFileSync(devVarsPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(\w+)=(.+)$/);
    if (match) envVars[match[1]] = match[2].trim();
  }
} catch {
  console.error(".dev.vars 파일을 찾을 수 없어요");
  process.exit(1);
}

// --- 프로바이더 설정 ---

interface ProviderConfig {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  models: { id: string; name: string; tier: "high" | "low" }[];
  authHeader: (key: string) => Record<string, string>;
}

const providers: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    apiKey: envVars.OPENAI_API_KEY || "",
    models: [
      { id: "gpt-5.4", name: "GPT-5.4", tier: "high" },
      { id: "gpt-4.1", name: "GPT-4.1", tier: "high" },
      { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", tier: "low" },
    ],
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    id: "google",
    name: "Google (Gemini)",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    apiKey: envVars.GOOGLE_AI_API_KEY || "",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tier: "high" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", tier: "low" },
    ],
    authHeader: () => ({}),
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    apiUrl: "https://api.deepseek.com/v1/chat/completions",
    apiKey: envVars.DEEPSEEK_API_KEY || "",
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3.2", tier: "high" },
    ],
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
];

// --- 테스트 프롬프트 ---

interface TestPrompt {
  id: string;
  name: string;
  category: "analysis" | "extraction" | "creative" | "reasoning";
  system?: string;
  user: string;
  expectedFormat?: "json" | "text";
}

const TEST_PROMPTS: TestPrompt[] = [
  {
    id: "kr-summary",
    name: "한국어 뉴스 요약",
    category: "analysis",
    system: "당신은 BD(사업개발) 전문 분석가입니다. 한국어로 답변하세요.",
    user: `다음 기사를 3줄로 요약하고, BD 관점에서 시사점을 2개 도출하세요:

"SK텔레콤이 AI 반도체 스타트업 '리벨리온'과 전략적 파트너십을 체결했다. 이번 협약으로 SKT는 자체 AI 인프라를 강화하고, 리벨리온은 대규모 고객 기반을 확보하게 된다. 양사는 AI 데이터센터용 반도체 공동 개발과 클라우드 AI 서비스 최적화에 협력할 예정이다. 업계에서는 이번 협약이 국내 AI 생태계의 수직 통합을 가속화할 것으로 전망하고 있다."`,
  },
  {
    id: "entity-extraction",
    name: "엔티티 추출 (JSON)",
    category: "extraction",
    system: "엔티티를 추출하여 JSON으로 반환하세요. 반드시 JSON만 출력하세요.",
    user: `다음 텍스트에서 기업명, 기술, 시장을 추출하세요:

"테슬라는 자율주행 기술인 FSD v12를 발표했다. 이 기술은 순수 비전 기반으로, LiDAR 없이 카메라만으로 Level 4 자율주행을 구현한다. 테슬라는 이를 통해 로보택시 시장에 진출할 계획이며, 우버와 리프트 같은 기존 사업자와 경쟁할 것으로 보인다."

JSON 형식: {"entities": {"companies": [...], "technologies": [...], "markets": [...]}}`,
  },
  {
    id: "scoring",
    name: "Radar 아이템 스코어링",
    category: "reasoning",
    system: `당신은 AI·신사업 트렌드 분석가입니다.
다음 기사의 사업 개발(BD) 관련성을 0-100으로 평가하세요.
평가 기준: AI/ML, 비즈니스 모델, 신기술, 스타트업, 혁신
JSON으로 반환: {"relevanceScore": number, "titleKo": "한국어 제목", "summaryKo": "한국어 요약 2줄", "reasoning": "점수 근거 1줄"}`,
    user: `Title: "OpenAI launches GPT-5 with reasoning capabilities"
Summary: "OpenAI has unveiled GPT-5, featuring advanced multi-step reasoning, integrated tool use, and improved accuracy on complex tasks. The model shows significant improvements in code generation, mathematical problem-solving, and scientific reasoning."`,
  },
  {
    id: "idea-gen",
    name: "아이디어 생성",
    category: "creative",
    system: "당신은 창의적인 BD 전문가입니다. 한국어로 답변하세요.",
    user: `다음 트렌드를 기반으로 사업 아이디어 1개를 제안하세요:

트렌드: "AI Agent가 기업의 업무 자동화에 본격 도입되기 시작함. Salesforce의 Agentforce, Microsoft의 Copilot Studio 등이 경쟁 중."

형식:
- 아이디어 제목
- 핵심 가설 (1줄)
- 목표 시장
- 차별화 포인트
- 최소 검증 행동 (1가지)`,
  },
];

// --- 가격 테이블 ($/M tokens) ---

const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.4": { input: 2.5, output: 15 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "deepseek-chat": { input: 0.28, output: 0.42 },
};

// --- API 호출 함수 ---

interface CallResult {
  providerId: string;
  modelId: string;
  modelName: string;
  promptId: string;
  response: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  error?: string;
}

async function callOpenAICompatible(
  provider: ProviderConfig,
  model: { id: string; name: string },
  prompt: TestPrompt,
): Promise<CallResult> {
  const start = Date.now();
  try {
    // GPT-5.4+는 max_completion_tokens 사용 (max_tokens 미지원)
    const isNewApi = model.id.startsWith("gpt-5") || model.id.startsWith("o3") || model.id.startsWith("o4");
    const body: Record<string, unknown> = {
      model: model.id,
      temperature: 0.3,
      messages: [
        ...(prompt.system ? [{ role: "system" as const, content: prompt.system }] : []),
        { role: "user" as const, content: prompt.user },
      ],
    };
    if (isNewApi) {
      body.max_completion_tokens = 1024;
    } else {
      body.max_tokens = 1024;
    }

    const response = await fetch(provider.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...provider.authHeader(provider.apiKey),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        providerId: provider.id,
        modelId: model.id,
        modelName: model.name,
        promptId: prompt.id,
        response: "",
        latencyMs,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        error: `HTTP ${response.status}: ${errorBody.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const text = data.choices?.[0]?.message?.content || "";
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    const pricing = PRICING[model.id] || { input: 0, output: 0 };
    const costUsd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

    return {
      providerId: provider.id,
      modelId: model.id,
      modelName: model.name,
      promptId: prompt.id,
      response: text,
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd: costUsd,
    };
  } catch (err) {
    return {
      providerId: provider.id,
      modelId: model.id,
      modelName: model.name,
      promptId: prompt.id,
      response: "",
      latencyMs: Date.now() - start,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function callGemini(
  provider: ProviderConfig,
  model: { id: string; name: string },
  prompt: TestPrompt,
): Promise<CallResult> {
  const start = Date.now();
  try {
    const url = provider.apiUrl.replace("{model}", model.id) + `?key=${provider.apiKey}`;
    const parts: Array<{ text: string }> = [];
    if (prompt.system) parts.push({ text: `[System] ${prompt.system}` });
    parts.push({ text: prompt.user });

    // Gemini 2.5 Pro: thinking 토큰이 maxOutputTokens에 포함되므로 충분히 확보
    const maxTokens = model.id.includes("pro") ? 8192 : 1024;
    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        providerId: provider.id,
        modelId: model.id,
        modelName: model.name,
        promptId: prompt.id,
        response: "",
        latencyMs,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        error: `HTTP ${response.status}: ${errorBody.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text?: string; thought?: boolean }> } }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; thoughtsTokenCount?: number };
    };

    // Gemini 2.5 Pro thinking 모드: thought=true인 파트 제외, text 파트만 추출
    const text = data.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought && p.text)
      .map((p) => p.text)
      .join("") || "";
    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const pricing = PRICING[model.id] || { input: 0, output: 0 };
    const costUsd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

    return {
      providerId: provider.id,
      modelId: model.id,
      modelName: model.name,
      promptId: prompt.id,
      response: text,
      latencyMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd: costUsd,
    };
  } catch (err) {
    return {
      providerId: provider.id,
      modelId: model.id,
      modelName: model.name,
      promptId: prompt.id,
      response: "",
      latencyMs: Date.now() - start,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// --- 품질 평가 ---

interface QualityScore {
  korean: number;       // 한국어 자연스러움 (0-10)
  relevance: number;    // 주제 관련성 (0-10)
  structure: number;    // 구조/형식 준수 (0-10)
  jsonValid: boolean;   // JSON 파싱 가능 여부
  total: number;        // 가중 평균 (0-100)
}

function evaluateQuality(result: CallResult, prompt: TestPrompt): QualityScore {
  const text = result.response;
  if (!text) return { korean: 0, relevance: 0, structure: 0, jsonValid: false, total: 0 };

  // 한국어 비율 체크
  const koreanChars = (text.match(/[\uac00-\ud7af]/g) || []).length;
  const totalChars = text.replace(/\s/g, "").length;
  const koreanRatio = totalChars > 0 ? koreanChars / totalChars : 0;
  const korean = prompt.category === "extraction" ? 5 : Math.min(10, Math.round(koreanRatio * 15));

  // 구조 점수
  let structure = 5;
  if (prompt.expectedFormat === "json" || prompt.category === "extraction") {
    try {
      JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      structure = 10;
    } catch {
      // JSON 블록 안에 있을 수도 있음
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          JSON.parse(jsonMatch[0]);
          structure = 8;
        } catch {
          structure = 3;
        }
      } else {
        structure = 2;
      }
    }
  } else {
    // 포맷 지시어 준수
    if (text.includes("-") || text.includes("•") || text.includes("1.")) structure = 8;
    if (text.length > 100) structure = Math.min(10, structure + 1);
  }

  // 관련성 — 키워드 기반 간단 평가
  let relevance = 5;
  const keywords: Record<string, string[]> = {
    "kr-summary": ["SKT", "리벨리온", "AI", "반도체", "파트너십", "시사점"],
    "entity-extraction": ["테슬라", "FSD", "자율주행", "로보택시", "우버"],
    "scoring": ["relevanceScore", "titleKo", "summaryKo", "GPT-5"],
    "idea-gen": ["AI Agent", "아이디어", "가설", "시장", "검증"],
  };
  const promptKeywords = keywords[prompt.id] || [];
  const matchCount = promptKeywords.filter((k) => text.includes(k)).length;
  relevance = Math.min(10, Math.round((matchCount / Math.max(promptKeywords.length, 1)) * 10));

  // JSON 유효성
  let jsonValid = false;
  if (prompt.category === "extraction" || prompt.category === "reasoning") {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { JSON.parse(jsonMatch[0]); jsonValid = true; } catch { /* noop */ }
    }
  }

  // 총점 (가중 평균)
  const total = Math.round(
    (korean * 3 + relevance * 4 + structure * 3) // max 100
  );

  return { korean, relevance, structure, jsonValid, total };
}

// --- 메인 ---

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  LLM Service 품질 비교 테스트");
  console.log("  프로바이더: OpenAI, Gemini, DeepSeek");
  console.log(`  테스트 프롬프트: ${TEST_PROMPTS.length}개`);
  console.log("═══════════════════════════════════════════════════\n");

  // API 키 체크
  for (const p of providers) {
    const hasKey = !!p.apiKey;
    console.log(`  ${hasKey ? "✅" : "❌"} ${p.name}: ${hasKey ? "키 설정됨" : "키 없음 — 스킵"}`);
  }
  console.log("");

  const activeProviders = providers.filter((p) => !!p.apiKey);
  if (activeProviders.length === 0) {
    console.error("활성 프로바이더가 없어요. .dev.vars 파일을 확인하세요.");
    process.exit(1);
  }

  const allResults: CallResult[] = [];
  const allScores: Array<CallResult & { quality: QualityScore }> = [];

  for (const prompt of TEST_PROMPTS) {
    console.log(`\n─── 테스트: ${prompt.name} (${prompt.category}) ───`);

    // 모든 프로바이더·모델을 병렬 호출
    const calls: Promise<CallResult>[] = [];
    for (const provider of activeProviders) {
      for (const model of provider.models) {
        if (provider.id === "google") {
          calls.push(callGemini(provider, model, prompt));
        } else {
          calls.push(callOpenAICompatible(provider, model, prompt));
        }
      }
    }

    const results = await Promise.all(calls);

    for (const result of results) {
      const quality = evaluateQuality(result, prompt);
      allResults.push(result);
      allScores.push({ ...result, quality });

      if (result.error) {
        console.log(`  ❌ ${result.modelName}: ${result.error.slice(0, 80)}`);
      } else {
        console.log(
          `  ✅ ${result.modelName.padEnd(20)} ` +
          `${result.latencyMs.toLocaleString().padStart(6)}ms | ` +
          `품질: ${quality.total.toString().padStart(3)}/100 | ` +
          `토큰: ${result.inputTokens}+${result.outputTokens} | ` +
          `비용: $${result.estimatedCostUsd.toFixed(6)}`
        );
      }
    }
  }

  // --- 종합 리포트 ---
  console.log("\n\n═══════════════════════════════════════════════════");
  console.log("  종합 리포트");
  console.log("═══════════════════════════════════════════════════\n");

  // 모델별 평균
  const modelGroups = new Map<string, Array<CallResult & { quality: QualityScore }>>();
  for (const item of allScores) {
    const key = item.modelName;
    if (!modelGroups.has(key)) modelGroups.set(key, []);
    modelGroups.get(key)!.push(item);
  }

  console.log("┌──────────────────────┬────────┬────────┬─────────────┬──────────────┐");
  console.log("│ 모델                 │ 평균ms │ 품질   │ 평균 토큰   │ 평균 비용    │");
  console.log("├──────────────────────┼────────┼────────┼─────────────┼──────────────┤");

  const summaryRows: Array<{
    model: string;
    avgLatency: number;
    avgQuality: number;
    avgTokens: number;
    avgCost: number;
    errors: number;
  }> = [];

  for (const [modelName, items] of modelGroups) {
    const successful = items.filter((i) => !i.error);
    if (successful.length === 0) {
      console.log(`│ ${modelName.padEnd(20)} │ FAILED │ FAILED │ FAILED      │ FAILED       │`);
      summaryRows.push({ model: modelName, avgLatency: -1, avgQuality: 0, avgTokens: 0, avgCost: 0, errors: items.length });
      continue;
    }

    const avgLatency = Math.round(successful.reduce((s, i) => s + i.latencyMs, 0) / successful.length);
    const avgQuality = Math.round(successful.reduce((s, i) => s + i.quality.total, 0) / successful.length);
    const avgTokens = Math.round(successful.reduce((s, i) => s + i.inputTokens + i.outputTokens, 0) / successful.length);
    const avgCost = successful.reduce((s, i) => s + i.estimatedCostUsd, 0) / successful.length;

    console.log(
      `│ ${modelName.padEnd(20)} │ ${avgLatency.toLocaleString().padStart(6)} │ ${(avgQuality + "/100").padStart(6)} │ ${avgTokens.toLocaleString().padStart(11)} │ $${avgCost.toFixed(6).padStart(11)} │`
    );

    summaryRows.push({ model: modelName, avgLatency, avgQuality, avgTokens, avgCost, errors: items.length - successful.length });
  }

  console.log("└──────────────────────┴────────┴────────┴─────────────┴──────────────┘");

  // 추천
  const ranked = summaryRows
    .filter((r) => r.avgLatency > 0)
    .sort((a, b) => {
      // 품질 우선, 같으면 비용 낮은 순
      if (Math.abs(a.avgQuality - b.avgQuality) > 5) return b.avgQuality - a.avgQuality;
      return a.avgCost - b.avgCost;
    });

  if (ranked.length > 0) {
    console.log(`\n🏆 추천: ${ranked[0].model} (품질 ${ranked[0].avgQuality}/100, 비용 $${ranked[0].avgCost.toFixed(6)}/호출)`);
    if (ranked.length > 1) {
      console.log(`🥈 차선: ${ranked[1].model} (품질 ${ranked[1].avgQuality}/100, 비용 $${ranked[1].avgCost.toFixed(6)}/호출)`);
    }
  }

  // 결과 파일 저장
  const outputPath = resolve(__dirname, "../docs/03-analysis/llm-quality-comparison.json");
  const report = {
    timestamp: new Date().toISOString(),
    testPrompts: TEST_PROMPTS.length,
    providers: activeProviders.map((p) => p.id),
    results: allScores.map((r) => ({
      provider: r.providerId,
      model: r.modelId,
      prompt: r.promptId,
      latencyMs: r.latencyMs,
      quality: r.quality,
      tokens: { input: r.inputTokens, output: r.outputTokens },
      costUsd: r.estimatedCostUsd,
      error: r.error || null,
      responsePreview: r.response.slice(0, 300),
    })),
    summary: summaryRows,
  };
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 상세 결과 저장: ${outputPath}`);

  // 개별 응답 출력
  console.log("\n\n═══════════════════════════════════════════════════");
  console.log("  개별 응답 미리보기 (각 200자)");
  console.log("═══════════════════════════════════════════════════\n");

  for (const prompt of TEST_PROMPTS) {
    console.log(`\n--- ${prompt.name} ---`);
    const promptResults = allScores.filter((r) => r.promptId === prompt.id);
    for (const r of promptResults) {
      if (r.error) {
        console.log(`  [${r.modelName}] ❌ ${r.error.slice(0, 100)}`);
      } else {
        console.log(`  [${r.modelName}] ${r.response.slice(0, 200).replace(/\n/g, " ↵ ")}`);
      }
    }
  }
}

main().catch(console.error);
