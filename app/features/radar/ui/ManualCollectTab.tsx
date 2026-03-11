import { UrlCollectForm } from "./UrlCollectForm";
import { TextCollectForm } from "./TextCollectForm";
import { FileUploadForm } from "./FileUploadForm";

export function ManualCollectTab() {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-medium text-fg mb-3">URL로 수집</h3>
        <UrlCollectForm />
      </section>
      <div className="border-t border-border" />
      <section>
        <h3 className="text-sm font-medium text-fg mb-3">파일 업로드</h3>
        <FileUploadForm />
      </section>
      <div className="border-t border-border" />
      <section>
        <h3 className="text-sm font-medium text-fg mb-3">텍스트 메모</h3>
        <TextCollectForm />
      </section>
    </div>
  );
}
