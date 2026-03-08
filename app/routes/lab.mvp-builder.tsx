import { useState, useCallback, useRef, useEffect } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { proposals } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MvpBuildProgress =
  | { type: "step_start"; step: 1 | 2 | 3 | 4; label: string }
  | { type: "step_complete"; step: 1 | 2 | 3 | 4; data?: unknown }
  | { type: "file_generated"; path: string; language: string; lines: number }
  | { type: "error"; step: number; message: string }
  | { type: "complete"; buildId: string; fileCount: number; totalLines: number };

interface MvpBuildResult {
  buildId: string;
  projectName: string;
  stack: string;
  fileCount: number;
  totalLines: number;
  files: Array<{ path: string; language: string; lines: number; content: string }>;
}

type Phase = "select" | "generating" | "complete" | "error";

interface ProposalItem {
  id: string;
  title: string;
  status: string;
}

const STEPS = [
  { step: 1, label: "사업제안 분석" },
  { step: 2, label: "프로젝트 구조 설계" },
  { step: 3, label: "코드 생성" },
  { step: 4, label: "빌드 검증" },
] as const;

const SECTION_OPTIONS = [
  { id: "hero", label: "히어로 + CTA", defaultChecked: true },
  { id: "features", label: "기능 소개", defaultChecked: true },
  { id: "faq", label: "FAQ / 문의", defaultChecked: true },
] as const;

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ proposals: [] as ProposalItem[], existingBuild: null });
  }

  const proposalList = await db
    .select({ id: proposals.id, title: proposals.title, status: proposals.status })
    .from(proposals)
    .where(eq(proposals.tenantId, ctx.tenantId));

  // mvpBuilds 테이블은 아직 미구현 — 추후 API 완성 시 조회 추가
  const existingBuild: MvpBuildResult | null = null;

  return json({ proposals: proposalList, existingBuild });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MvpBuilderPage() {
  const { proposals: proposalList, existingBuild } = useLoaderData<typeof loader>();

  const [phase, setPhase] = useState<Phase>("select");
  const [selectedProposalId, setSelectedProposalId] = useState("");
  const [sections, setSections] = useState<string[]>(
    SECTION_OPTIONS.filter((s) => s.defaultChecked).map((s) => s.id),
  );
  const [progress, setProgress] = useState<MvpBuildProgress[]>([]);
  const [buildResult, setBuildResult] = useState<MvpBuildResult | null>(
    existingBuild ?? null,
  );
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const toggleSection = useCallback((id: string) => {
    setSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }, []);

  const startGeneration = useCallback(async () => {
    setPhase("generating");
    setProgress([]);
    setBuildResult(null);
    setErrorMsg("");

    const ac = new AbortController();
    abortRef.current = ac;

    const generatedFiles: MvpBuildResult["files"] = [];

    try {
      const res = await fetch("/api/lab/mvp-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: selectedProposalId, sections }),
        signal: ac.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const raw = line.slice(6).trim();
            if (!raw || raw === "[DONE]") continue;
            try {
              const evt = JSON.parse(raw) as MvpBuildProgress | { type: "heartbeat" };
              if (evt.type === "heartbeat") continue;

              const progress_evt = evt as MvpBuildProgress;
              setProgress((prev) => [...prev, progress_evt]);

              if (progress_evt.type === "file_generated") {
                generatedFiles.push({
                  path: progress_evt.path,
                  language: progress_evt.language,
                  lines: progress_evt.lines,
                  content: "", // content는 complete 이벤트 후 fetch
                });
              }

              if (progress_evt.type === "complete") {
                setBuildResult({
                  buildId: progress_evt.buildId,
                  projectName:
                    proposalList.find((p) => p.id === selectedProposalId)?.title ?? "MVP",
                  stack: "Next.js",
                  fileCount: progress_evt.fileCount,
                  totalLines: progress_evt.totalLines,
                  files: generatedFiles,
                });
                setPhase("complete");
              }

              if (progress_evt.type === "error") {
                setErrorMsg(progress_evt.message);
                setPhase("error");
              }
            } catch {
              // malformed JSON — skip
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setErrorMsg((err as Error).message || "알 수 없는 에러가 발생했어요.");
      setPhase("error");
    }
  }, [selectedProposalId, sections, proposalList]);

  const resetToSelect = useCallback(() => {
    abortRef.current?.abort();
    setPhase("select");
    setProgress([]);
    setBuildResult(null);
    setErrorMsg("");
  }, []);

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-lab-accent font-mono-dx">
          MVP Builder
        </h2>
        <p className="mt-1.5 text-sm text-fg-secondary leading-relaxed">
          사업제안서 기반 MVP 코드 자동 생성. 선택한 제안의 핵심 가치를 Next.js 프로젝트로 스캐폴딩해요.
        </p>
      </div>

      {phase === "select" && (
        <SelectPhase
          proposals={proposalList}
          selectedProposalId={selectedProposalId}
          onSelectProposal={setSelectedProposalId}
          sections={sections}
          onToggleSection={toggleSection}
          onStart={startGeneration}
          existingBuild={buildResult}
          onViewExisting={() => setPhase("complete")}
        />
      )}

      {phase === "generating" && (
        <GeneratingPhase progress={progress} />
      )}

      {(phase === "complete" || phase === "error") && (
        <ResultPhase
          phase={phase}
          buildResult={buildResult}
          errorMsg={errorMsg}
          expandedFile={expandedFile}
          onToggleFile={setExpandedFile}
          onRetry={startGeneration}
          onReset={resetToSelect}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SelectPhase
// ---------------------------------------------------------------------------

function SelectPhase({
  proposals: proposalList,
  selectedProposalId,
  onSelectProposal,
  sections,
  onToggleSection,
  onStart,
  existingBuild,
  onViewExisting,
}: {
  proposals: ProposalItem[];
  selectedProposalId: string;
  onSelectProposal: (id: string) => void;
  sections: string[];
  onToggleSection: (id: string) => void;
  onStart: () => void;
  existingBuild: MvpBuildResult | null;
  onViewExisting: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* 제안 선택 */}
      <div className="rounded-lg border border-line-subtle bg-surface p-5">
        <label className="block text-xs uppercase tracking-widest text-fg-tertiary font-mono-dx mb-2">
          사업제안 선택
        </label>
        <select
          className="w-full rounded-lg border border-line-subtle bg-surface-secondary px-3 py-2.5 text-sm text-fg focus:border-lab-accent focus:outline-none"
          value={selectedProposalId}
          onChange={(e) => onSelectProposal(e.target.value)}
        >
          <option value="">— 제안을 선택하세요 —</option>
          {proposalList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} [{p.status}]
            </option>
          ))}
        </select>
      </div>

      {/* 스택 선택 */}
      <div className="rounded-lg border border-line-subtle bg-surface p-5">
        <label className="block text-xs uppercase tracking-widest text-fg-tertiary font-mono-dx mb-2">
          기술 스택
        </label>
        <select
          className="w-full rounded-lg border border-line-subtle bg-surface-secondary px-3 py-2.5 text-sm text-fg opacity-60 cursor-not-allowed"
          disabled
          value="nextjs"
        >
          <option value="nextjs">Next.js (App Router)</option>
        </select>
        <p className="mt-1.5 text-xs text-fg-tertiary">
          현재 Next.js만 지원해요. 추후 Remix, Astro 등 추가 예정.
        </p>
      </div>

      {/* 포함 항목 */}
      <div className="rounded-lg border border-line-subtle bg-surface p-5">
        <label className="block text-xs uppercase tracking-widest text-fg-tertiary font-mono-dx mb-3">
          포함 섹션
        </label>
        <div className="space-y-2">
          {SECTION_OPTIONS.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={sections.includes(opt.id)}
                onChange={() => onToggleSection(opt.id)}
                className="h-4 w-4 rounded border-line-subtle text-lab-accent focus:ring-lab-accent"
              />
              <span className="text-sm text-fg">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          disabled={!selectedProposalId}
          onClick={onStart}
          className="px-4 py-2 rounded-lg bg-lab-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          MVP 생성 시작
        </button>
        {existingBuild && (
          <button
            onClick={onViewExisting}
            className="px-4 py-2 rounded-lg border border-line-subtle text-sm text-fg-secondary hover:text-fg transition-colors"
          >
            이전 결과 보기
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GeneratingPhase
// ---------------------------------------------------------------------------

function GeneratingPhase({ progress }: { progress: MvpBuildProgress[] }) {
  const completedSteps = new Set<number>();
  const activeStep = { current: 0 };
  const generatedFiles: Array<{ path: string; language: string; lines: number }> = [];

  for (const evt of progress) {
    if (evt.type === "step_start") activeStep.current = evt.step;
    if (evt.type === "step_complete") completedSteps.add(evt.step);
    if (evt.type === "file_generated") generatedFiles.push(evt);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line-subtle bg-surface p-5">
        <h3 className="text-xs uppercase tracking-widest text-lab-accent font-mono-dx mb-4">
          생성 진행 중…
        </h3>

        <div className="space-y-3">
          {STEPS.map(({ step, label }) => {
            const isDone = completedSteps.has(step);
            const isActive = activeStep.current === step && !isDone;
            const isPending = step > activeStep.current;

            return (
              <div key={step} className="flex items-start gap-3">
                {/* Icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {isDone && (
                    <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {isActive && (
                    <svg className="h-5 w-5 text-lab-accent animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {isPending && (
                    <div className="h-5 w-5 rounded-full border-2 border-line-subtle" />
                  )}
                </div>

                {/* Label */}
                <div className="flex-1">
                  <p className={`text-sm font-medium ${isDone ? "text-fg" : isActive ? "text-lab-accent" : "text-fg-tertiary"}`}>
                    Step {step}. {label}
                  </p>

                  {/* Step 3: 파일 목록 실시간 표시 */}
                  {step === 3 && generatedFiles.length > 0 && (isActive || isDone) && (
                    <div className="mt-2 space-y-1">
                      {generatedFiles.map((f) => (
                        <div key={f.path} className="flex items-center gap-2 text-xs text-fg-secondary font-mono">
                          <span className="text-emerald-500">+</span>
                          <span>{f.path}</span>
                          <span className="text-fg-tertiary">({f.lines}줄)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultPhase
// ---------------------------------------------------------------------------

function ResultPhase({
  phase,
  buildResult,
  errorMsg,
  expandedFile,
  onToggleFile,
  onRetry,
  onReset,
}: {
  phase: "complete" | "error";
  buildResult: MvpBuildResult | null;
  errorMsg: string;
  expandedFile: string | null;
  onToggleFile: (path: string | null) => void;
  onRetry: () => void;
  onReset: () => void;
}) {
  if (phase === "error") {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-5">
        <h3 className="text-sm font-semibold text-red-400 font-mono-dx mb-2">
          생성 실패
        </h3>
        <p className="text-sm text-fg-secondary mb-4">{errorMsg}</p>
        <div className="flex gap-3">
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-lg bg-lab-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            다시 시도
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 rounded-lg border border-line-subtle text-sm text-fg-secondary hover:text-fg transition-colors"
          >
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  if (!buildResult) return null;

  const copyToClipboard = async (content: string) => {
    await navigator.clipboard.writeText(content);
  };

  return (
    <div className="space-y-5">
      {/* 프로젝트 요약 */}
      <div className="rounded-lg border border-line-subtle bg-surface p-5">
        <h3 className="text-xs uppercase tracking-widest text-lab-accent font-mono-dx mb-3">
          프로젝트 요약
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <SummaryItem label="프로젝트" value={buildResult.projectName} />
          <SummaryItem label="파일 수" value={`${buildResult.fileCount}개`} />
          <SummaryItem label="총 줄 수" value={`${buildResult.totalLines.toLocaleString()}줄`} />
          <SummaryItem label="스택" value={buildResult.stack} />
        </div>
      </div>

      {/* 파일 목록 */}
      <div className="rounded-lg border border-line-subtle bg-surface">
        <div className="border-b border-line-subtle px-5 py-3">
          <h3 className="text-xs uppercase tracking-widest text-lab-accent font-mono-dx">
            생성된 파일
          </h3>
        </div>
        <div className="divide-y divide-line-subtle">
          {buildResult.files.map((file) => (
            <div key={file.path}>
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-lab-accent font-mono">{file.language}</span>
                  <span className="text-sm text-fg font-mono truncate">{file.path}</span>
                  <span className="text-xs text-fg-tertiary">({file.lines}줄)</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <button
                    onClick={() => onToggleFile(expandedFile === file.path ? null : file.path)}
                    className="px-3 py-1 rounded text-xs text-fg-secondary border border-line-subtle hover:text-fg hover:border-fg-tertiary transition-colors"
                  >
                    {expandedFile === file.path ? "접기" : "보기"}
                  </button>
                  <button
                    onClick={() => copyToClipboard(file.content)}
                    className="px-3 py-1 rounded text-xs text-fg-secondary border border-line-subtle hover:text-fg hover:border-fg-tertiary transition-colors"
                  >
                    복사
                  </button>
                </div>
              </div>

              {/* 인라인 코드 뷰 */}
              {expandedFile === file.path && (
                <div className="bg-gray-900 text-gray-100 p-4 overflow-x-auto text-sm font-mono mx-3 mb-3 rounded-lg">
                  <pre><code>{file.content || "// (내용 없음)"}</code></pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {buildResult.buildId && (
          <a
            href={`/api/lab/mvp-builder/${buildResult.buildId}/download`}
            className="px-4 py-2 rounded-lg bg-lab-accent text-white text-sm font-medium hover:opacity-90 transition-opacity inline-block"
          >
            ZIP 다운로드
          </a>
        )}
        <button
          onClick={onReset}
          className="px-4 py-2 rounded-lg border border-line-subtle text-sm text-fg-secondary hover:text-fg transition-colors"
        >
          재생성
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SummaryItem
// ---------------------------------------------------------------------------

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-widest text-fg-tertiary font-mono-dx">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-fg">{value}</dd>
    </div>
  );
}
