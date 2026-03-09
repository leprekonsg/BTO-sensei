/**
 * Lazy PDF rasterizer: renders the first page of a PDF to a PNG data URL.
 * Only loads pdfjs-dist when called.
 */
export async function rasterizePdfToDataUrl(file: File, dpi = 150): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");

  // Use the bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const scale = dpi / 72;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas 2D context for PDF rasterization.");

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  return canvas.toDataURL("image/png");
}
