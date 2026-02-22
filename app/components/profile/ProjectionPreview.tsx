import { MarkdownViewer } from "~/components/docs/MarkdownViewer";
import { Button } from "~/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";

interface ProjectionMeta {
  graphVersion: number;
  sourceHash: string;
  generatedAt: string | null;
}

interface ProjectionPreviewProps {
  content: string | null;
  meta: ProjectionMeta | null;
  syncing?: boolean;
  onSync: () => void;
}

export function ProjectionPreview({ content, meta, syncing, onSync }: ProjectionPreviewProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">USER.md 미리보기</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSync}
            loading={syncing}
          >
            Projection 동기화
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {content ? (
          <>
            <MarkdownViewer content={content} />
            {meta && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <Badge variant="subtle">v{meta.graphVersion}</Badge>
                {meta.generatedAt && (
                  <span className="text-xs text-fg-tertiary">
                    마지막 동기화: {formatDate(meta.generatedAt)}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="py-8 text-center text-sm text-fg-tertiary">
            프로필을 저장하면 Projection이 자동 생성됩니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}
