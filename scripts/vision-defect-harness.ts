import assert from "node:assert/strict";
import {
  buildInvalidSeverityRationale,
  clampBBox,
  mergeVisionUpdate,
  validateSeverity,
} from "../src/lib/defect-utils.ts";
import {
  shouldClearHudTapPoint,
  shouldFinalizeWorkingAnchor,
} from "../src/lib/vision/hud-guards.ts";
import { buildHudAnchor, createManualHudDetection } from "../src/lib/vision/hud.ts";
import type { Defect } from "../src/lib/types.ts";

function makeDefect(overrides: Partial<Defect> = {}): Defect {
  return {
    id: "defect-1",
    room: "Living Room",
    defect_type: "Surface defect",
    severity: "Moderate",
    description: "Generic surface issue.",
    recommendation: "Log it for follow-up.",
    confidence: 0.8,
    timestamp: 1,
    ...overrides,
  };
}

function testClampBBox() {
  assert.deepEqual(clampBBox([100, 200, 300, 400]), [100, 200, 300, 400]);
  assert.deepEqual(clampBBox([1100, -50, 10, 1200]), [10, 0, 1000, 1000]);
  assert.deepEqual(clampBBox(["200", "900", "100", "300"]), [100, 300, 200, 900]);
  assert.equal(clampBBox([100, Number.NaN, 300, 400]), undefined);
}

function testValidateSeverity() {
  const water = validateSeverity(makeDefect({
    defect_type: "Water seepage near window",
    severity: "Minor",
    severity_rationale: "Model thought this was cosmetic.",
  }));
  assert.equal(water.severity, "Critical");
  assert.equal(water.review_required, true);
  assert.match(water.severity_rationale ?? "", /Upgraded to Critical/);

  const hollow = validateSeverity(makeDefect({
    defect_type: "Hollow tile",
    severity: "Moderate",
    description: "Tile sounds hollow with no visible surface damage.",
  }));
  assert.equal(hollow.severity, "Minor");
  assert.equal(hollow.review_required, true);

  const lowConfidence = validateSeverity(makeDefect({
    confidence: 0.4,
  }));
  assert.equal(lowConfidence.review_required, true);
}

function testInvalidSeverityMerge() {
  const merged = mergeVisionUpdate(
    makeDefect({
      severity_rationale: "Initial rationale.",
    }),
    {
      severity: "Severe",
    },
  );
  assert.equal(merged.severity, "Moderate");
  assert.equal(merged.review_required, true);
  assert.equal(
    merged.severity_rationale,
    buildInvalidSeverityRationale("Agentic pass", "Initial rationale."),
  );
}

function testHudAnchorPlacement() {
  const detection = createManualHudDetection({ x: 220, y: 510, timestamp: 1234 }, 200);
  assert.deepEqual(detection.bbox, [410, 120, 610, 320]);

  const anchor = buildHudAnchor(detection, 0, "explaining", {
    id: "anchor-1",
    title: "Analyzing ROI",
  });
  assert.equal(anchor.id, "anchor-1");
  assert.equal(anchor.side, "right");
  assert.equal(anchor.status, "explaining");
  assert.equal(anchor.title, "Analyzing ROI");
  assert.ok(anchor.x >= 4 && anchor.x <= 74);
  assert.ok(anchor.y >= 10 && anchor.y <= 78);
}

function testHudAsyncGuards() {
  assert.equal(
    shouldFinalizeWorkingAnchor(4, 4, "anchor-a", "anchor-a"),
    true,
  );
  assert.equal(
    shouldFinalizeWorkingAnchor(4, 5, "anchor-a", "anchor-a"),
    false,
  );
  assert.equal(
    shouldFinalizeWorkingAnchor(4, 4, "anchor-a", "anchor-b"),
    false,
  );

  assert.equal(
    shouldClearHudTapPoint(8, 8, 1001, 1001),
    true,
  );
  assert.equal(
    shouldClearHudTapPoint(8, 9, 1001, 1001),
    false,
  );
  assert.equal(
    shouldClearHudTapPoint(8, 8, 1001, 1002),
    false,
  );
}

testClampBBox();
testValidateSeverity();
testInvalidSeverityMerge();
testHudAnchorPlacement();
testHudAsyncGuards();

console.log("vision-defect harness passed");
