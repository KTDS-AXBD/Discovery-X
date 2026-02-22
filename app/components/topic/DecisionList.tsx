import { useFetcher } from "@remix-run/react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/Button";

interface Decision {
  "@id": string;
  "@type": string;
  "dx:summary"?: string;
  "dx:date"?: string;
  "dx:context"?: string;
  "dx:decidedBy"?: string;
}

export function DecisionList({ topicId }: { topicId: string }) {
  const listFetcher = useFetcher<{ decisions: Decision[] }>();
  const addFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const [showForm, setShowForm] = useState(false);
  const [summary, setSummary] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [decisionContext, setDecisionContext] = useState("");

  useEffect(() => {
    if (listFetcher.state === "idle" && !listFetcher.data) {
      listFetcher.load(`/api/topics/${topicId}/decisions`);
    }
  }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 추가 완료 후 리로드
  useEffect(() => {
    if (addFetcher.state === "idle" && addFetcher.data) {
      listFetcher.load(`/api/topics/${topicId}/decisions`);
    }
  }, [addFetcher.state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data) {
      listFetcher.load(`/api/topics/${topicId}/decisions`);
    }
  }, [deleteFetcher.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const decisions = listFetcher.data?.decisions ?? [];

  const handleAdd = () => {
    addFetcher.submit(
      JSON.stringify({ summary, date, context: decisionContext }),
      {
        method: "post",
        action: `/api/topics/${topicId}/decisions`,
        encType: "application/json",
      },
    );
    // 폼 초기화 (submit 직후)
    setSummary("");
    setDecisionContext("");
    setShowForm(false);
  };

  const handleDelete = (decisionId: string) => {
    const idPart = decisionId.split("/").pop()!;
    deleteFetcher.submit(null, {
      method: "delete",
      action: `/api/topics/${topicId}/decisions/${idPart}`,
    });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">
          결정 기록{" "}
          <span className="font-normal text-fg-tertiary">
            ({decisions.length})
          </span>
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "닫기" : "+ 결정 추가"}
        </Button>
      </div>

      {showForm && (
        <div className="mb-4 space-y-3 rounded-lg border border-line bg-surface p-4">
          <input
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="결정 내용 (필수)"
            className="w-full rounded border border-line bg-surface-secondary px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-line bg-surface-secondary px-3 py-2 text-sm"
            />
          </div>
          <textarea
            value={decisionContext}
            onChange={(e) => setDecisionContext(e.target.value)}
            placeholder="배경/맥락 (선택)"
            rows={2}
            className="w-full rounded border border-line bg-surface-secondary px-3 py-2 text-sm"
          />
          <Button size="sm" onClick={handleAdd} disabled={!summary.trim()}>
            추가
          </Button>
        </div>
      )}

      {decisions.length === 0 ? (
        <p className="text-sm text-fg-tertiary">
          기록된 결정이 없습니다
        </p>
      ) : (
        <ul className="space-y-3">
          {decisions.map((d) => {
            const id = d["@id"] || "";
            return (
              <li
                key={id}
                className="rounded-lg border border-line bg-surface p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-fg">
                      {d["dx:summary"]}
                    </p>
                    {d["dx:date"] && (
                      <p className="mt-1 text-xs text-fg-tertiary">
                        {d["dx:date"]}
                      </p>
                    )}
                    {d["dx:context"] && (
                      <p className="mt-1 text-xs text-fg-secondary">
                        {d["dx:context"]}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(id)}
                    className="text-xs text-fg-tertiary hover:text-red-500"
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
