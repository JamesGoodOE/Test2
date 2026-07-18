// Server-side document text extraction. PDF via pdf-parse, DOCX via mammoth.
// These packages are marked serverExternalPackages in next.config.mjs.

export type SupportedDoc = "pdf" | "docx" | "txt";

export function detectDocType(fileName: string): SupportedDoc | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "txt";
  return null;
}

export async function extractText(buffer: Buffer, docType: SupportedDoc): Promise<string> {
  switch (docType) {
    case "pdf": {
      // pdf-parse is CommonJS; import the implementation module directly to
      // avoid its index.js debug harness that reads a sample file at load time.
      const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
        b: Buffer,
      ) => Promise<{ text: string }>;
      const parsed = await pdfParse(buffer);
      return parsed.text ?? "";
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return value ?? "";
    }
    case "txt":
      return buffer.toString("utf8");
    default:
      return "";
  }
}
