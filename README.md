# BTO-Sensei

<div align="center">
  <img src="./public/bto_sensei_logo_transparent.png" alt="BTO-Sensei Logo" width="200" />
</div>

BTO-Sensei is an AI-powered HDB (Housing & Development Board) inspection assistant. Built with React, TypeScript, and Vite, it uses the Gemini Live API alongside custom audio DSP to perform real-time acoustic analysis of floor tiles, capture visible construction defects via camera, and auto-generate structural integrity reports.

## Features

- **Acoustic Scan**: Canvas-based FFT spectrogram visualizing tap frequencies in real-time. "Ah Seng" (AI safety officer persona) provides Singlish commentary based on DSP classification (hollow vs. solid tiles).
- **Defect Logger**: Camera viewfinder for capturing defect photos. Defects are logged into a scrollable list with severity badges, recommendations, and chop-stamp animations.
- **Report Dashboard**: Health score gauge, room-by-room breakdown, and SVG floor plan with defect markers.

## Architecture

Fully client-side. Two-agent parallel execution (Frontend + Backend) with strict file ownership to prevent merge conflicts.

- **Backend (Logic Layer)**: DSP (`dsp.ts`), Zustand store (`store.ts`), Gemini wiring, tool call handlers, shared type contract (`types.ts`). Wrapper: `BtoApp.tsx`.
- **Frontend (UI Layer)**: React components (lazy-loaded), CSS variables, Framer Motion animations. Entry: `App.tsx` wrapping `BtoApp`.

State is managed via Zustand. Only serializable primitives (current room, audio mode, defect array) persist to `sessionStorage`. Blobs and `Float32Array` are ephemeral.

## Tech Stack

- **Framework**: React 18, TypeScript, Vite
- **State**: Zustand (sessionStorage persistence)
- **AI**: Gemini Live API (streaming audio, vision, function calling, structured output)
- **DSP**: Custom FFT + cosine similarity for tap classification
- **UI**: Framer Motion, CSS variables, React Suspense for lazy loading

## Design & UI Generation

The UI was constructed using **Stitch MCP** and **Antigravity**. Stitch MCP provided a pipeline to high-fidelity design assets -- layout configurations, structural models, and a dark industrial "construction" design system. Antigravity consumed these visual directives and translated them into production code.

## Future Plans

- **Vision Measurement**: Gemini Code Execution with OpenCV for reference-coin measurement of cracks and gaps
- **Nano Banana Blueprint**: Imagen 3-generated annotated floor plan with defect markers
- **Report Cover**: AI-generated cover page for inspection reports
- **HDB Floor Plan Integration**: Real BTO flat type floor plans for spatial defect mapping

## Getting Started

1. Clone the repository.
2. `npm install`
3. Copy `.env.example` to `.env` and add your Gemini API key:
   ```
   VITE_GEMINI_API_KEY=your_key_here
   ```
4. `npm run dev`
5. Open `http://localhost:5173`.

## Deployment

1. `npm run build` must pass.
2. Deploy to Vercel.
3. Set `VITE_GEMINI_API_KEY`, `VITE_GEMINI_LIVE_MODEL`, and `VITE_GEMINI_VOICE_NAME` in Vercel Environment Variables.

## Graceful Degradation

All Gemini calls are wrapped with `withFallback()`. If the API is unreachable, fallback responses fire within 3 seconds. No loading spinner ever hangs.
