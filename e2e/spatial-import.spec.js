import { expect, test } from "@playwright/test";
import { makeTinyPdf, makeTinyPng, sampleDraft, seedPlanDraft } from "./helpers.js";

async function openReport(page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Report/ }).click();
  await expect(page.getByText("Log defects first, then generate a report.")).toBeVisible();
}

test("plan import stays in draft state until editor confirmation and lazy-loads on demand", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });

  await seedPlanDraft(page, sampleDraft);
  await openReport(page);

  expect(requests.some((url) => url.includes("/src/components/bto/PlanImport.tsx"))).toBeFalsy();
  expect(requests.some((url) => url.includes("/src/lib/pdf-rasterizer.ts"))).toBeFalsy();

  const importRequest = page.waitForRequest((request) =>
    request.url().includes("/src/components/bto/PlanImport.tsx"),
  );
  await page.getByTestId("plan-import-toggle").click();
  await importRequest;

  await page.getByTestId("plan-import-file-input").setInputFiles({
    name: "floorplan.png",
    mimeType: "image/png",
    buffer: makeTinyPng(),
  });

  await expect(page.getByText(/Extracted 2 rooms, 1 walls/i)).toBeVisible();
  await expect(page.getByTestId("review-adjust-plan")).toBeVisible();
  await expect(page.getByText(/Verified floor plan active/i)).toHaveCount(0);
  await expect(page.getByText("Verified Plan")).toHaveCount(0);

  await page.getByTestId("review-adjust-plan").click();
  await expect(page.getByTestId("plan-editor")).toBeVisible();
  await expect(page.getByText(/Verified floor plan active/i)).toHaveCount(0);

  await page.getByTestId("confirm-plan").click();
  await expect(page.getByText(/Verified floor plan active \(2 rooms\)/i)).toBeVisible();
});

test("pdf import loads the rasterizer only when a PDF is uploaded", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });

  await seedPlanDraft(page, sampleDraft);
  await openReport(page);

  await page.getByTestId("plan-import-toggle").click();
  await expect(page.getByTestId("plan-import-file-input")).toBeAttached();
  expect(requests.some((url) => url.includes("/src/lib/pdf-rasterizer.ts"))).toBeFalsy();

  const rasterizerRequest = page.waitForRequest((request) =>
    request.url().includes("/src/lib/pdf-rasterizer.ts"),
  );
  await page.getByTestId("plan-import-file-input").setInputFiles({
    name: "floorplan.pdf",
    mimeType: "application/pdf",
    buffer: makeTinyPdf(),
  });
  await rasterizerRequest;

  await expect(page.getByText(/Extracted 2 rooms, 1 walls/i)).toBeVisible();
  await expect(page.getByTestId("review-adjust-plan")).toBeVisible();
});
