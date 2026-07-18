import type { RiskTier } from "@/lib/domain/types";

const COLOURS: Record<string, string> = {
  PROHIBITED: "#b91c1c",
  HIGH: "#c2410c",
  LIMITED: "#a16207",
  MINIMAL: "#15803d",
};

export function TierBadge({ tier }: { tier: RiskTier | null }) {
  if (!tier) {
    return (
      <span className="tier-badge" style={{ background: "#94a3b8" }}>
        UNCLASSIFIED
      </span>
    );
  }
  return (
    <span className="tier-badge" style={{ background: COLOURS[tier] ?? "#334155" }}>
      {tier}
    </span>
  );
}
