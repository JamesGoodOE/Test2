// Minimal declaration for the internal pdf-parse implementation module,
// which ships without types. We import the implementation directly to avoid
// pdf-parse's index.js debug harness (it reads a sample file at load time).
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
