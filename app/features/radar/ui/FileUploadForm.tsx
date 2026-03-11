import { useRef, useState, useCallback, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { FormField } from "~/components/ui/FormField";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Card, CardContent } from "~/components/ui/Card";
import {
  extractTextFromFile,
  FileExtractionError,
  ACCEPTED_FILE_TYPES,
  type ExtractedFile,
} from "~/features/radar/service/file-extractor";

interface FileUploadFormProps {
  onSuccess?: (item: unknown) => void;
}

export function FileUploadForm({ onSuccess }: FileUploadFormProps) {
  const fetcher = useFetcher<{ error?: string; success?: boolean; item?: unknown }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedFile | null>(null);
  const [editedTitle, setEditedTitle] = useState("");
  const submittedRef = useRef(false);

  const isSubmitting = fetcher.state === "submitting";
  const serverError = fetcher.data?.error;
  const error = localError || (submittedRef.current ? serverError : null);
  const showPreview = extracted && !extracting;

  // 성공 시 리셋 — side effect만 수행 (setState 호출 없음)
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success && submittedRef.current) {
      submittedRef.current = false;
      setExtracted(null);
      setEditedTitle("");
      setLocalError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onSuccess?.(fetcher.data.item);
    }
  }, [fetcher.state, fetcher.data, onSuccess]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setLocalError(null);
      setExtracting(true);
      submittedRef.current = false;

      try {
        const result = await extractTextFromFile(file);
        setExtracted(result);
        setEditedTitle(result.title);
      } catch (err) {
        if (err instanceof FileExtractionError) {
          setLocalError(err.message);
        } else {
          setLocalError("파일을 읽을 수 없어요. 다른 파일을 시도해주세요.");
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
      } finally {
        setExtracting(false);
      }
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    if (!extracted) return;
    setLocalError(null);
    submittedRef.current = true;

    fetcher.submit(
      {
        intent: "file",
        title: editedTitle || extracted.title,
        content: extracted.content,
        fileName: extracted.fileName,
        fileType: extracted.fileType,
        fileSize: String(extracted.fileSize),
      },
      { method: "post", action: "/api/radar/manual-collect/upload" },
    );
  }, [extracted, editedTitle, fetcher]);

  const handleCancel = useCallback(() => {
    setExtracted(null);
    setEditedTitle("");
    setLocalError(null);
    submittedRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        {error && <AlertBanner variant="destructive">{error}</AlertBanner>}

        {/* 파일 선택 */}
        <FormField label="파일 선택" htmlFor="collect-file">
          <Input
            ref={fileInputRef}
            id="collect-file"
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            onChange={handleFileSelect}
            disabled={extracting || isSubmitting}
          />
          <p className="mt-1 text-xs text-fg-tertiary">
            PDF, DOCX, TXT 파일 · 최대 10MB
          </p>
        </FormField>

        {/* 추출 중 */}
        {extracting && (
          <div className="flex items-center gap-2 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-fg-brand border-t-transparent" />
            <span className="text-sm text-fg-secondary">
              텍스트를 추출하고 있어요...
            </span>
          </div>
        )}

        {/* 미리보기 */}
        {showPreview && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center gap-2 text-xs text-fg-tertiary">
              <span className="uppercase font-medium">{extracted.fileType}</span>
              <span>·</span>
              <span>{(extracted.fileSize / 1024).toFixed(0)} KB</span>
              {extracted.pageCount && (
                <>
                  <span>·</span>
                  <span>{extracted.pageCount}페이지</span>
                </>
              )}
              <span>·</span>
              <span>{extracted.content.length.toLocaleString()}자</span>
            </div>

            <FormField label="제목" htmlFor="file-title">
              <Input
                id="file-title"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                disabled={isSubmitting}
              />
            </FormField>

            <div>
              <label className="text-xs font-medium text-fg-secondary">
                추출된 내용 미리보기
              </label>
              <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-surface-secondary p-2 text-xs text-fg-secondary">
                {extracted.content.slice(0, 2000)}
                {extracted.content.length > 2000 && "\n\n... (이하 생략)"}
              </pre>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                취소
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting}
                loading={isSubmitting}
              >
                등록
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
