# BTO-Sensei

<div align="center">
  <img src="./public/bto_sensei_logo_transparent.png" alt="BTO-Sensei Logo" width="200" />
</div>

BTO-Sensei is a **mobile, AI-assisted construction quality inspection tool** designed for new home owners, developers, main contractors, defect inspectors, and property managers. Anchored in Singapore’s CONQUAS national standard, it helps users detect likely cracks, stains, spalling, and hollow tiles on-site. By combining on-device HUD workflows and Gemini-powered analysis, it explains likely CONQUAS-style issues and generates contractor-ready reports in real time to compress inspection time and improve consistency before handover.

## Market Positioning

- **Core Use Cases:** Pre-handover residential inspections and internal developer/contractor QA/QC workflows.

## Current Status

- React 19 + TypeScript + Vite app.
- Fully client-side. No backend server.
- Works in offline fallback mode, but Gemini features are limited without an API key.
- Vercel-ready in its default configuration.
- HUD auto-detection defaults to the lightweight canvas detector.
- YOLO HUD detection is optional and not enabled by default.
- YOLO26 ONNX is a candidate runtime path only; this repo does not ship a trained YOLO26 model yet.

## What It Does

- Detects likely **2D visual defects** (cracks, stains, spalling) and runs **acoustic hollow-tile checks** locally on-device.
- Captures inspection photos and uses Gemini to explain likely rule breaches and generate contractor-ready defect reports.
- Optionally runs a second, agentic verification pass with code execution for ambiguous or measurement-heavy cases.
- Supports measurement mode using an SG 10-cent coin as the reference object.
- Maps measured results to CONQUAS checks for door gaps, lippage, verticality, and surface evenness.
- Provides a heads-up HUD flow for ROI review and tap-to-location acoustic checks.
- Logs defects with severity, rationale, provenance, measurement details, and CONQUAS metadata.
- Generates a CONQUAS-ready inspection report and browser PDF export.

## Architecture

![Architecture Diagram](./public/architecture_diagram.png)

- `src/components/bto/`: UI surfaces including camera capture, HUD, defect cards, blueprint, and report dashboard.
- `src/hooks/`: app workflows such as camera analysis, Gemini live configuration, HUD detector lifecycle, and audio inspection.
- `src/lib/`: shared logic including CONQUAS rules, DSP, fallback handling, Gemini prompts/functions, report generation, state, and types.
- `src/lib/vision/`: detector contract, canvas detector, optional YOLO detector, tracking, frame scheduling, and HUD utilities.
- `scripts/vision-defect-harness.ts`: lightweight harness for targeted validation.

## Tech Stack

- React 19
- TypeScript
- Vite
- Zustand
- `@google/genai`
- Framer Motion

## Getting Started

### Prerequisites

- Node.js 22 or newer
- npm
- A Gemini API key if you want live AI features

### 1. Install dependencies

Windows PowerShell:

```powershell
npm.cmd install
```

macOS / Linux:

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Then set at least:

```env
VITE_GEMINI_API_KEY=your_key_here
```

Supported overrides today:

```env
VITE_GEMINI_FAST_VISION_MODELS=gemini-2.5-flash,gemini-2.5-flash-lite
VITE_GEMINI_AGENTIC_VISION_MODEL=gemini-3-flash-preview
VITE_GEMINI_DWELL_MODEL=gemini-3.1-flash-lite-preview
VITE_GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
VITE_GEMINI_LIVE_MODELS=gemini-2.5-flash-native-audio-preview-12-2025,gemini-2.5-flash-native-audio-preview-09-2025
VITE_GEMINI_VOICE_NAME=Kore
VITE_ENABLE_YOLO26_ONNX=
```

Notes:

- You can also paste a Gemini API key into the in-app API config panel. It is stored in the browser only.
- Without an API key, the app still runs, but vision, live audio, and report generation fall back to reduced offline behavior.

### 3. Start the app

Windows PowerShell:

```powershell
npm.cmd run dev
```

macOS / Linux:

```bash
npm run dev
```

Open `http://localhost:5173`.

### 4. Run checks

Windows PowerShell:

```powershell
npm.cmd run build
npm.cmd run lint
npm.cmd run test:vision-harness
```

## Optional YOLO HUD Setup

The repository is deployable without YOLO. By default, the HUD uses the canvas detector and only attempts YOLO when all of the following are true:

- `VITE_ENABLE_YOLO_HUD=true`
- `@tensorflow/tfjs` is installed
- `public/models/yolo11n-conquas/model.json` and its related model files are present

If any of those are missing, the app falls back to the canvas detector automatically. This is the intended default for Vercel deployment.

### YOLO26 ONNX candidate path

The v12 codebase also includes an optional ONNX Runtime Web detector path behind `VITE_ENABLE_YOLO26_ONNX=true`.

- This is a runtime integration seam, not a shipped production model.
- No trained `yolo26n-conquas` ONNX model is included in this repository today.
- Until that model is trained and validated on target devices, the production default remains the canvas heuristic detector.
- If you enable the flag without providing a compatible model asset, the app falls back gracefully.

## Runtime Behavior

### Vision pipeline

- Fast pass: Gemini vision classification with model fallback.
- Agentic pass: optional second-pass verification with code execution.
- Measurement mode: requests structured numeric measurement output.
- App-side CONQUAS logic computes PASS/FAIL from returned measurements instead of relying only on prompt wording.
- Live optical auto-detection is limited to app-safe 2D textural classes: cracks, stains/discoloration, spalling, and delamination.
- Dwell-triggered HUD explanation runs on stable live detections without blocking overlay rendering.

### Live API

- Native-audio live models are tried first by default.
- If a configured live model is text-only, the app downgrades the session config accordingly.
- API keys can come from `VITE_GEMINI_API_KEY` or browser local storage through the in-app config panel.

### HUD

- Vision mode supports manual ROI review and auto-detection.
- Acoustic mode supports tap-to-location checks for hollow tiles.
- Detector state is ephemeral and does not persist between sessions.
- Auto-detected HUD pills can escalate into dwell-triggered cloud explanations and logged findings.

## Deployment

The default app is suitable for Vercel as a static client deployment.

### Before deploying

- `npm.cmd run build` should pass
- `npm.cmd run lint` should pass
- `npm.cmd run test:vision-harness` should pass

### Vercel environment variables

Set these as needed:

```env
VITE_GEMINI_API_KEY=
VITE_GEMINI_FAST_VISION_MODELS=
VITE_GEMINI_AGENTIC_VISION_MODEL=
VITE_GEMINI_DWELL_MODEL=
VITE_GEMINI_LIVE_MODEL=
VITE_GEMINI_LIVE_MODELS=
VITE_GEMINI_VOICE_NAME=
VITE_ENABLE_YOLO_HUD=
VITE_ENABLE_YOLO26_ONNX=
```

### Recommended Vercel posture

- Leave `VITE_ENABLE_YOLO_HUD` unset unless you are also deploying TF.js and model assets.
- Leave `VITE_ENABLE_YOLO26_ONNX` unset unless you have a trained ONNX model and have validated it on target devices.
- Treat YOLO as an optional feature flag, not a required runtime dependency.
- Use the default canvas detector for the safest deploy path.

## Project Scripts

- `npm.cmd run dev`: start the Vite dev server
- `npm.cmd run build`: TypeScript build check and production bundle
- `npm.cmd run lint`: ESLint
- `npm.cmd run preview`: preview the production build locally
- `npm.cmd run test:vision-harness`: run the lightweight vision harness

## Repository Layout

```text
src/
  components/bto/
  hooks/
  lib/
    vision/
public/
scripts/
```

Key entry files:

- `src/main.tsx`
- `src/App.tsx`
- `src/BtoApp.tsx`

## Debugging

The app emits structured console logs for vision and live workflows, including:

- `[vision:fast-pass-start]`
- `[vision:fast-pass-success]`
- `[vision:model-fallback]`
- `[vision:agentic-pass-start]`
- `[vision:agentic-pass-success]`
- `[live:connect-start]`
- `[live:connect-success]`
- `[live:model-fallback]`

These are useful when validating model fallback behavior, timeout handling, and Live API connection issues.

## Notes

- This repository currently ships without TensorFlow.js or YOLO model assets.
- This repository currently ships without a trained YOLO26 ONNX model.
- Browser support matters for camera, microphone, and canvas/HUD features.
- The production build currently emits a Vite large-chunk warning for the main app bundle, but the app builds successfully.
