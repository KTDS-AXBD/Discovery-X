import { useFetcher } from "@remix-run/react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/Button";

interface GlossaryEntry {
  "@id": string;
  "@type": string;
  "dx:term"?: string;
  "dx:definition"?: string;
}

export function GlossaryList({ topicId }: { topicId: string }) {
  const listFetcher = useFetcher<{ glossary: GlossaryEntry[] }>();
  const addFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const [showForm, setShowForm] = useState(false);
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");

  useEffect(() => {
    if (listFetcher.state === "idle" && !listFetcher.data) {
      listFetcher.load(`/api/topics/${topicId}/glossary`);
    }
  }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (addFetcher.state === "idle" && addFetcher.data) {
      listFetcher.load(`/api/topics/${topicId}/glossary`);
    }
  }, [addFetcher.state]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data) {
      listFetcher.load(`/api/topics/${topicId}/glossary`);
    }
  }, [deleteFetcher.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const glossary = listFetcher.data?.glossary ?? [];

  const handleAdd = () => {
    addFetcher.submit(
      JSON.stringify({ term, definition }),
      {
        method: "post",
        action: `/api/topics/${topicId}/glossary`,
        encType: "application/json",
      },
    );
    // 폼 초기화 (submit 직후)
    setTerm("");
    setDefinition("");
    setShowForm(false);
  };

  const handleDelete = (entryId: string) => {
    const idPart = entryId.split("/").pop()!;
    deleteFetcher.submit(null, {
      method: "delete",
      action: `/api/topics/${topicId}/glossary/${idPart}`,
    });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">
          용어 정의{" "}
          <span className="font-normal text-fg-tertiary">
            ({glossary.length})
          </span>
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "닫기" : "+ 용어 추가"}
        </Button>
      </div>

      {showForm && (
        <div className="mb-4 space-y-3 rounded-lg border border-line bg-surface p-4">
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="용어 (필수)"
            className="w-full rounded border border-line bg-surface-secondary px-3 py-2 text-sm"
          />
          <textarea
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            placeholder="정의 (필수)"
            rows={2}
            className="w-full rounded border border-line bg-surface-secondary px-3 py-2 text-sm"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!term.trim() || !definition.trim()}
          >
            추가
          </Button>
        </div>
      )}

      {glossary.length === 0 ? (
        <p className="text-sm text-fg-tertiary">
          정의된 용어가 없습니다
        </p>
      ) : (
        <ul className="space-y-3">
          {glossary.map((g) => {
            const id = g["@id"] || "";
            return (
              <li
                key={id}
                className="rounded-lg border border-line bg-surface p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-fg">
                      {g["dx:term"]}
                    </p>
                    {g["dx:definition"] && (
                      <p className="mt-1 text-sm text-fg-secondary">
                        {g["dx:definition"]}
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
