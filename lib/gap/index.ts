import type { AiSystem, Control, RiskTier } from "@/lib/domain/types";
import { controlDefsForTier, getControlDef } from "@/lib/controls";

export interface ControlGap {
  control_key: string;
  title: string;
  citation: string;
  status: Control["status"];
}

export interface SystemGapReport {
  system_id: string;
  system_name: string;
  risk_tier: RiskTier | null;
  classified: boolean;
  required_count: number;
  satisfied_count: number;      // DONE or N_A
  open_gaps: ControlGap[];      // MISSING or IN_PROGRESS
  complete: boolean;
}

/**
 * Compute the gap report for one system: of the controls required by its tier,
 * which remain open (MISSING/IN_PROGRESS). A control counted as satisfied is
 * DONE or explicitly N_A. Systems that have not been classified are flagged.
 */
export function buildSystemGapReport(system: AiSystem, controls: Control[]): SystemGapReport {
  const tier = system.risk_tier;
  const classified = Boolean(tier && system.classified_at);

  if (!classified || !tier) {
    return {
      system_id: system.id,
      system_name: system.name,
      risk_tier: tier,
      classified: false,
      required_count: 0,
      satisfied_count: 0,
      open_gaps: [],
      complete: false,
    };
  }

  const required = controlDefsForTier(tier);
  const byKey = new Map(controls.map((c) => [c.control_key, c]));

  const open_gaps: ControlGap[] = [];
  let satisfied = 0;

  for (const def of required) {
    const row = byKey.get(def.key);
    const status = row?.status ?? "MISSING";
    if (status === "DONE" || status === "N_A") {
      satisfied += 1;
    } else {
      open_gaps.push({
        control_key: def.key,
        title: def.title,
        citation: def.citation,
        status,
      });
    }
  }

  return {
    system_id: system.id,
    system_name: system.name,
    risk_tier: tier,
    classified: true,
    required_count: required.length,
    satisfied_count: satisfied,
    open_gaps,
    complete: required.length > 0 && open_gaps.length === 0,
  };
}

export { getControlDef };
