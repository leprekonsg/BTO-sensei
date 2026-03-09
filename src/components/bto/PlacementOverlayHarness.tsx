import { useEffect, useState } from "react";
import { useBTOStore } from "../../lib/store";
import type { UnitPlan } from "../../lib/types";
import { DefectPlacementOverlay } from "./DefectPlacementOverlay";

const HARNESS_DEFECT_ID = "harness-defect";

const HARNESS_PLAN: UnitPlan = {
  id: "harness-plan",
  source: "template",
  status: "verified",
  version: 1,
  bounds: { width: 300, height: 180 },
  rooms: [
    {
      id: "room-a",
      label: "Living Room",
      kind: "living",
      polygon: [[12, 12], [148, 12], [148, 168], [12, 168]],
      centroid: [80, 90],
    },
    {
      id: "room-b",
      label: "Kitchen",
      kind: "kitchen",
      polygon: [[152, 12], [288, 12], [288, 168], [152, 168]],
      centroid: [220, 90],
    },
  ],
  walls: [
    {
      id: "wall-mid",
      roomId: "room-a",
      start: [150, 12],
      end: [150, 168],
      length: 156,
      surfaceType: "wall",
      adjacentRoomId: "room-b",
    },
  ],
};

export function PlacementOverlayHarness() {
  const placement = useBTOStore((s) => s.defectPlacements[HARNESS_DEFECT_ID]);
  const removeDefectPlacement = useBTOStore((s) => s.removeDefectPlacement);
  const [doneCount, setDoneCount] = useState(0);

  useEffect(() => {
    removeDefectPlacement(HARNESS_DEFECT_ID);
  }, [removeDefectPlacement]);

  return (
    <div style={{ padding: 16 }} data-testid="placement-harness">
      <h2 className="font-mono" style={{ marginBottom: 12 }}>Placement Overlay Harness</h2>
      <DefectPlacementOverlay
        defectId={HARNESS_DEFECT_ID}
        plan={HARNESS_PLAN}
        onDone={() => setDoneCount((count) => count + 1)}
        existingPlacement={placement}
      />
      <div className="font-mono" style={{ marginTop: 12 }} data-testid="placement-result">
        {placement ? JSON.stringify(placement) : "none"}
      </div>
      <div className="font-mono text-dim" style={{ marginTop: 6 }} data-testid="placement-done-count">
        done:{doneCount}
      </div>
    </div>
  );
}
