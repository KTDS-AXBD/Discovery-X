import { useOutletContext } from "@remix-run/react";
import { IdeaCardGrid } from "~/components/ideas/IdeaCardGrid";
import { SourceBrowser } from "~/components/ideas/SourceBrowser";

interface IdeaItem {
  id: string;
  title: string;
  status: string;
  ownerId: string;
  analysisData: Record<string, unknown> | null;
  createdAt: string | number | null;
}

interface SourceItem {
  id: string;
  title: string;
  titleKo: string | null;
  summaryKo: string | null;
  url: string;
  relevanceScore: number | null;
  status: string;
  collectedAt: Date | string | null;
  memo: string | null;
}

interface OutletCtx {
  user: { id: string; name: string; email: string };
  ideaList: IdeaItem[];
  allItems: SourceItem[];
}

export default function IdeasIndex() {
  const { user, ideaList, allItems } = useOutletContext<OutletCtx>();

  // 내 아이디어 vs 팀 아이디어 분리
  const myIdeas = ideaList.filter((idea) => idea.ownerId === user.id);
  const teamIdeas = ideaList.filter((idea) => idea.ownerId !== user.id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-8 px-6 py-6">
        {/* 상단: 내 아이디어 / 팀 아이디어 */}
        <IdeaCardGrid
          myIdeas={myIdeas}
          teamIdeas={teamIdeas}
          userName={user.name}
        />

        {/* 하단: 아이디어 시작하기 (소스 탐색 + 요약) */}
        <SourceBrowser sources={allItems} />
      </div>
    </div>
  );
}
