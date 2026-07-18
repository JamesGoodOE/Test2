import ExcelJS from "exceljs";
import type { AiSystem, Vendor } from "@/lib/domain/types";

export interface RegisterExportData {
  tenantName: string;
  generatedAt: string;
  systems: Array<AiSystem & { vendorName?: string }>;
  vendors: Vendor[];
}

const HEADER_FILL = "FF1F47C2";

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle" };
  });
}

/** Build the AI register workbook (register + vendors) as an .xlsx buffer. */
export async function buildRegisterWorkbook(data: RegisterExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Registry";
  wb.created = new Date(data.generatedAt);

  // ── Cover / metadata ──
  const cover = wb.addWorksheet("About");
  cover.columns = [{ width: 28 }, { width: 70 }];
  cover.addRows([
    ["AI System Register", ""],
    ["Tenant", data.tenantName],
    ["Generated", data.generatedAt],
    ["Systems", data.systems.length],
    ["Vendors", data.vendors.length],
    ["", ""],
    ["Notice", "This product provides compliance tooling, not legal advice."],
  ]);
  cover.getCell("A1").font = { bold: true, size: 16 };
  cover.getColumn(1).font = { bold: true };

  // ── AI Systems ──
  const sheet = wb.addWorksheet("AI Register");
  sheet.columns = [
    { header: "Name", key: "name", width: 30 },
    { header: "Vendor", key: "vendor", width: 22 },
    { header: "Purpose", key: "purpose", width: 40 },
    { header: "Business owner", key: "owner", width: 22 },
    { header: "Deployment status", key: "status", width: 18 },
    { header: "Data categories", key: "data", width: 30 },
    { header: "EU AI Act tier", key: "tier", width: 16 },
    { header: "Classified at", key: "classified", width: 22 },
    { header: "Classifier version", key: "cv", width: 16 },
  ];
  styleHeader(sheet.getRow(1));
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const s of data.systems) {
    sheet.addRow({
      name: s.name,
      vendor: s.vendorName ?? "",
      purpose: s.purpose,
      owner: s.owner,
      status: s.status,
      data: (s.data_categories ?? []).join(", "),
      tier: s.risk_tier ?? "UNCLASSIFIED",
      classified: s.classified_at ?? "",
      cv: s.classifier_version ?? "",
    });
  }
  sheet.autoFilter = { from: "A1", to: "I1" };

  // ── Vendors ──
  const vsheet = wb.addWorksheet("Vendors");
  vsheet.columns = [
    { header: "Vendor", key: "name", width: 30 },
    { header: "Website", key: "website", width: 34 },
    { header: "Due-diligence status", key: "dd", width: 22 },
  ];
  styleHeader(vsheet.getRow(1));
  vsheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const v of data.vendors) {
    vsheet.addRow({ name: v.name, website: v.website, dd: v.dd_status });
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
