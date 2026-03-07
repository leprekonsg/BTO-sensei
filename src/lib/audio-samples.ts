import { buildFrequencyProfile } from "./dsp";

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function loadBaselineProfile(type: "hollow" | "solid") {
  await delay(60);
  return buildFrequencyProfile(type, type === "hollow" ? 5 : 11);
}

export async function loadTapSample(source: "prerecorded-hollow" | "prerecorded-solid") {
  await delay(120);
  return buildFrequencyProfile(
    source === "prerecorded-hollow" ? "hollow" : "solid",
    source === "prerecorded-hollow" ? 3 : 7,
  );
}
