import vendorV1 from "@/config/vendor.questionnaire.v1.json";

export interface VendorQuestion {
  key: string;
  type: "text" | "bool" | "enum";
  prompt: string;
  options?: string[];
  ai_relevant?: boolean;
  clause_type?: string;
}

export interface VendorSection {
  key: string;
  title: string;
  questions: VendorQuestion[];
}

export const VENDOR_QUESTIONNAIRE_VERSION = vendorV1.version;

export function vendorSections(): VendorSection[] {
  return vendorV1.sections as VendorSection[];
}
