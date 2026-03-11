/**
 * 클라이언트사이드 파일 텍스트 추출 유틸
 * CF Workers 메모리 제한(128MB) 회피를 위해 브라우저에서 파싱.
 * PDF: pdfjs-dist, DOCX: mammoth, TXT: FileReader
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface ExtractedFile {
  fileName: string;
  fileType: "pdf" | "docx" | "txt";
  fileSize: number;
  title: string;
  content: string;
  excerpt: string;
  pageCount?: number;
}

export class FileExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileExtractionError";
  }
}

export function detectFileType(
  file: File,
): "pdf" | "docx" | "txt" | null {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "txt" || ext === "text" || ext === "md") return "txt";

  // MIME fallback
  if (file.type === "application/pdf") return "pdf";
  if (
    file.type ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (file.type.startsWith("text/")) return "txt";

  return null;
}

function validateFile(file: File): "pdf" | "docx" | "txt" {
  if (file.size > MAX_FILE_SIZE) {
    throw new FileExtractionError(
      `파일 크기가 10MB를 초과해요. (${(file.size / 1024 / 1024).toFixed(1)}MB)`,
    );
  }

  const fileType = detectFileType(file);
  if (!fileType) {
    throw new FileExtractionError(
      "지원하지 않는 파일 형식이에요. PDF, DOCX, TXT만 가능해요.",
    );
  }

  return fileType;
}

async function extractPdf(file: File): Promise<ExtractedFile> {
  const pdfjsLib = await import("pdfjs-dist");

  // Vite 환경에서 worker 설정 — CDN fallback
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(pageText);
  }

  const content = pages.join("\n\n");
  const titleFromName = file.name.replace(/\.pdf$/i, "");

  return {
    fileName: file.name,
    fileType: "pdf",
    fileSize: file.size,
    title: titleFromName,
    content,
    excerpt: content.slice(0, 200),
    pageCount: pdf.numPages,
  };
}

async function extractDocx(file: File): Promise<ExtractedFile> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const content = result.value;
  const titleFromName = file.name.replace(/\.docx$/i, "");

  return {
    fileName: file.name,
    fileType: "docx",
    fileSize: file.size,
    title: titleFromName,
    content,
    excerpt: content.slice(0, 200),
  };
}

async function extractTxt(file: File): Promise<ExtractedFile> {
  const content = await file.text();
  const titleFromName = file.name.replace(/\.(txt|text|md)$/i, "");

  return {
    fileName: file.name,
    fileType: "txt",
    fileSize: file.size,
    title: titleFromName,
    content,
    excerpt: content.slice(0, 200),
  };
}

export async function extractTextFromFile(
  file: File,
): Promise<ExtractedFile> {
  const fileType = validateFile(file);

  switch (fileType) {
    case "pdf":
      return extractPdf(file);
    case "docx":
      return extractDocx(file);
    case "txt":
      return extractTxt(file);
  }
}

export const ACCEPTED_FILE_TYPES =
  ".pdf,.docx,.txt,.text,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";
