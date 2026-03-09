import { useBTOStore } from "../../lib/store";

export function SpatialBadge() {
  const spatialMode = useBTOStore((s) => s.spatialMode);
  const unitPlan = useBTOStore((s) => s.unitPlan);
  const planDraft = useBTOStore((s) => s.planDraft);

  if (unitPlan?.status === "verified") {
    return <span className="plan-badge plan-badge--verified">Verified Plan</span>;
  }
  if (planDraft || unitPlan?.status === "draft") {
    return <span className="plan-badge plan-badge--draft">Draft Plan</span>;
  }
  if (spatialMode === "fallback") {
    return <span className="plan-badge plan-badge--fallback">Quick Layout</span>;
  }
  return null;
}
