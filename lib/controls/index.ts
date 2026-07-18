import controlsV1 from "@/config/controls.v1.json";
import type { Control, ControlStatus, RiskTier } from "@/lib/domain/types";

export interface ControlDef {
  key: string;
  title: string;
  description: string;
  citation: string;
  applies_to: string[];
}

export const CONTROLS_VERSION = controlsV1.version;

const CATALOGUE = controlsV1.controls as ControlDef[];

/** Control definitions required for a given risk tier, in catalogue order. */
export function controlDefsForTier(tier: RiskTier): ControlDef[] {
  return CATALOGUE.filter((c) => c.applies_to.includes(tier));
}

/** Control keys required for a tier — used to instantiate the checklist. */
export function controlKeysForTier(tier: RiskTier): string[] {
  return controlDefsForTier(tier).map((c) => c.key);
}

export function getControlDef(key: string): ControlDef | undefined {
  return CATALOGUE.find((c) => c.key === key);
}

/** Join persisted control rows with their catalogue metadata for display. */
export interface ControlView extends Control {
  title: string;
  description: string;
  citation: string;
}

export function decorateControls(rows: Control[]): ControlView[] {
  return rows.map((r) => {
    const def = getControlDef(r.control_key);
    return {
      ...r,
      title: def?.title ?? r.control_key,
      description: def?.description ?? "",
      citation: def?.citation ?? "",
    };
  });
}

export const CONTROL_STATUSES: ControlStatus[] = ["MISSING", "IN_PROGRESS", "DONE", "N_A"];
