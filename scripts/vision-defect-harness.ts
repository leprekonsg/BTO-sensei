import assert from "node:assert/strict";
import {
  buildInvalidSeverityRationale,
  clampBBox,
  mergeVisionUpdate,
  validateSeverity,
} from "../src/lib/defect-utils.ts";
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

testClampBBox();
testValidateSeverity();
testInvalidSeverityMerge();

console.log("vision-defect harness passed");
