import { useState } from "react";

const FAQ_ITEMS = [
  { q: "스코어카드란 무엇인가요?", a: "AI가 PRD를 8개 기준(문제 정의, 사용자, 목표, 요구사항, 해결방안, 리스크, 일정, 일관성)으로 평가한 점수표예요. 각 기준 10점, 총 100점 만점이에요." },
  { q: "판정(verdict)은 어떻게 결정되나요?", a: "총점 80점 이상이면 '착수 가능(READY)', 60~79점이면 '조건부(CONDITIONAL)', 60점 미만이면 '재작성 필요(NOT_READY)'예요." },
  { q: "왜 여러 AI가 검토하나요?", a: "GPT-4.1과 Gemini가 동시에 검토해요. 모델마다 강점이 달라서 더 폭넓은 피드백을 받을 수 있어요." },
  { q: "인터뷰 진행 중에 나가면 어떻게 되나요?", a: "작성 중인 답변은 자동으로 저장돼요. 네트워크 문제가 있어도 브라우저에 임시 저장되니 안심하세요." },
  { q: "PRD를 수정하고 다시 검토할 수 있나요?", a: "네, 생성된 PRD의 각 섹션을 편집한 후 'AI 검토' 버튼으로 재검토할 수 있어요. 검토 라운드가 기록돼요." },
];

export function FAQSection() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <span className="text-sm font-semibold text-fg">자주 묻는 질문</span>
        <span className="text-xs text-fg-tertiary">{open ? "접기" : "펼치기"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4 divide-y divide-border">
          {FAQ_ITEMS.map((item, i) => (
            <FAQItem key={i} question={item.q} answer={item.a} />
          ))}
        </div>
      )}
    </div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="py-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="text-xs text-fg-tertiary mt-0.5 shrink-0">{expanded ? "▾" : "▸"}</span>
        <span className="text-sm font-medium text-fg">{question}</span>
      </button>
      {expanded && (
        <p className="mt-1.5 pl-5 text-sm text-fg-secondary">{answer}</p>
      )}
    </div>
  );
}
