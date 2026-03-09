import { expect, test } from "@playwright/test";
import {
  makePersistedState,
  sampleDefects,
  sampleReportData,
  sampleUnitPlan,
  seedStore,
} from "./helpers.js";

async function openReport(page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Report/ }).click();
  await expect(page.getByTestId("report-dashboard")).toBeVisible();
}

test("verified plan report renders only markers from placements scoped to the active plan", async ({ page }) => {
  await seedStore(page, makePersistedState({
    defects: sampleDefects,
    reportData: sampleReportData,
    spatialMode: "verified-plan",
    unitPlan: sampleUnitPlan,
    defectPlacements: {
      "defect-1": {
        defectId: "defect-1",
        planId: "plan-verified-1",
        planVersion: 1,
        mode: "point",
        roomId: "room-living",
        localPos: [48, 36],
        screenTap: [48, 36],
        confirmedByUser: true,
      },
      "defect-2": {
        defectId: "defect-2",
        planId: "old-plan",
        planVersion: 1,
        mode: "room",
        roomId: "room-kitchen",
        confirmedByUser: true,
      },
      "defect-3": {
        defectId: "defect-3",
        planId: "plan-verified-1",
        planVersion: 1,
        mode: "unplaced",
        confirmedByUser: false,
      },
    },
  }));

  await openReport(page);

  await expect(page.getByText("Verified Plan // 2 Rooms")).toBeVisible();
  await expect(page.getByTestId("verified-plan-marker")).toHaveCount(1);
  await expect(page.locator("[data-defect-id='defect-1']")).toBeVisible();
});

test("removing a verified plan clears persisted placements and returns to fallback mode", async ({ page }) => {
  await seedStore(page, makePersistedState({
    defects: sampleDefects.slice(0, 1),
    spatialMode: "verified-plan",
    unitPlan: sampleUnitPlan,
    defectPlacements: {
      "defect-1": {
        defectId: "defect-1",
        planId: "plan-verified-1",
        planVersion: 1,
        mode: "room",
        roomId: "room-living",
        confirmedByUser: true,
      },
    },
  }));

  await page.goto("/");
  await page.getByRole("button", { name: /Report/ }).click();
  await page.getByTestId("plan-import-toggle").click();
  await page.getByRole("button", { name: /Remove Plan/i }).click();

  await expect(page.getByText("Quick Layout")).toBeVisible();

  const persisted = await page.evaluate(() => {
    const raw = window.sessionStorage.getItem("bto-store");
    return raw ? JSON.parse(raw) : null;
  });

  expect(persisted.state.unitPlan).toBeNull();
  expect(persisted.state.defectPlacements).toEqual({});
});

test("room selection does not auto-commit placement before explicit confirmation", async ({ page }) => {
  await page.goto("/?harness=placement-overlay");
  await expect(page.getByTestId("placement-harness")).toBeVisible();

  await page.getByTestId("placement-room-room-a").click();
  await expect(page.getByTestId("placement-prompt")).toContainText("selected. Confirm or tap exact spot.");
  await expect(page.getByTestId("placement-result")).toHaveText("none");

  await page.getByTestId("placement-confirm").click();
  await expect(page.getByTestId("placement-result")).toContainText('"mode":"room"');
  await expect(page.getByTestId("placement-result")).toContainText('"roomId":"room-a"');
  await expect(page.getByTestId("placement-done-count")).toContainText("done:1");
});

test("logger exposes the placement overlay when a verified plan is active", async ({ page }) => {
  await seedStore(page, makePersistedState({
    defects: sampleDefects.slice(0, 1),
    spatialMode: "verified-plan",
    unitPlan: sampleUnitPlan,
    defectPlacements: {},
  }));

  await page.goto("/");
  await page.getByRole("button", { name: /Logger/ }).click();

  await expect(page.getByTestId("defect-place-defect-1")).toBeVisible();
  await page.getByTestId("defect-place-defect-1").click();
  await expect(page.getByTestId("placement-overlay-shell")).toBeVisible();

  await page.getByTestId("placement-room-room-living").click();
  await expect(page.getByTestId("placement-overlay-shell")).toBeVisible();
  await page.getByTestId("placement-confirm").click();
  await expect(page.getByTestId("placement-overlay-shell")).toHaveCount(0);

  const persisted = await page.evaluate(() => {
    const raw = window.sessionStorage.getItem("bto-store");
    return raw ? JSON.parse(raw) : null;
  });

  expect(persisted.state.defectPlacements["defect-1"]).toMatchObject({
    mode: "room",
    roomId: "room-living",
    planId: "plan-verified-1",
    planVersion: 1,
    confirmedByUser: true,
  });
});
