export const sampleDraft = {
  unitLabel: "Test Unit",
  rooms: [
    {
      label: "Living Room",
      kind: "living",
      polygon: [[10, 10], [140, 10], [140, 110], [10, 110]],
      confidence: 0.94,
    },
    {
      label: "Kitchen",
      kind: "kitchen",
      polygon: [[145, 10], [290, 10], [290, 110], [145, 110]],
      confidence: 0.9,
    },
  ],
  walls: [
    {
      start: [142, 10],
      end: [142, 110],
      roomLabel: "Living Room",
      confidence: 0.88,
    },
  ],
  orientationHint: 0,
  overallConfidence: 0.92,
};

export const sampleUnitPlan = {
  id: "plan-verified-1",
  source: "upload",
  status: "verified",
  version: 1,
  bounds: { width: 300, height: 120 },
  rooms: [
    {
      id: "room-living",
      label: "Living Room",
      kind: "living",
      polygon: [[10, 10], [140, 10], [140, 110], [10, 110]],
      centroid: [75, 60],
    },
    {
      id: "room-kitchen",
      label: "Kitchen",
      kind: "kitchen",
      polygon: [[150, 10], [290, 10], [290, 110], [150, 110]],
      centroid: [220, 60],
    },
  ],
  walls: [
    {
      id: "wall-divider",
      roomId: "room-living",
      start: [145, 10],
      end: [145, 110],
      length: 100,
      surfaceType: "wall",
      adjacentRoomId: "room-kitchen",
    },
  ],
};

export const sampleDefects = [
  {
    id: "defect-1",
    room: "Living Room",
    defect_type: "Wall crack",
    severity: "Moderate",
    description: "Visible crack on living room wall.",
    recommendation: "Patch and repaint.",
    confidence: 0.88,
    timestamp: 1,
  },
  {
    id: "defect-2",
    room: "Kitchen",
    defect_type: "Water stain",
    severity: "Critical",
    description: "Water stain near sink.",
    recommendation: "Inspect plumbing.",
    confidence: 0.9,
    timestamp: 2,
  },
  {
    id: "defect-3",
    room: "Kitchen",
    defect_type: "Tile spalling",
    severity: "Minor",
    description: "Minor spalling on floor tile.",
    recommendation: "Monitor and patch.",
    confidence: 0.73,
    timestamp: 3,
  },
];

export const sampleReportData = {
  flat_id: "HB-402-A",
  inspection_date: "2026-03-09",
  overall_health_score: 81,
  room_scores: [
    { room: "Living Room", score: 82, summary: "1 issue logged." },
    { room: "Kitchen", score: 74, summary: "2 issues logged." },
    { room: "Master Bedroom", score: 95, summary: "Clear." },
  ],
  priority_defects: sampleDefects,
  inspector_note: "Focus on the water stain first.",
  conquas_grade: "Conditional",
};

export function makePersistedState(overrides = {}) {
  return {
    currentRoom: "Living Room",
    flatType: "4-room",
    audioMode: "prerecorded",
    defects: [],
    reportData: null,
    spatialMode: "fallback",
    unitPlan: null,
    defectPlacements: {},
    ...overrides,
  };
}

export async function seedStore(page, persistedState) {
  await page.addInitScript((state) => {
    window.sessionStorage.setItem(
      "bto-store",
      JSON.stringify({
        state,
        version: 2,
      }),
    );
  }, persistedState);
}

export async function seedPlanDraft(page, draft = sampleDraft) {
  await page.addInitScript((payload) => {
    window.__BTO_TEST_PLAN_DRAFT__ = payload;
  }, draft);
}

export function makeTinyPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9m7WcAAAAASUVORK5CYII=",
    "base64",
  );
}

export function makeTinyPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}
