import { useCallback, useRef, useState, type DragEvent } from "react";
import { useBTOStore } from "../../lib/store";
import { extractFloorPlanDraft, readFileAsDataUrl } from "../../lib/plan-extraction";
import { normalizeDraft } from "../../lib/plan-helpers";
import { PlanEditor } from "./PlanEditor";
import type { UnitPlan } from "../../lib/types";
import "./PlanImport.css";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const ACCEPTED_EXTENSIONS = ".png,.jpeg,.jpg,.webp,.pdf";

export function PlanImport() {
  const setPlanDraft = useBTOStore((s) => s.setPlanDraft);
  const verifyUnitPlan = useBTOStore((s) => s.verifyUnitPlan);
  const clearUnitPlan = useBTOStore((s) => s.clearUnitPlan);
  const planImportState = useBTOStore((s) => s.planImportState);
  const setPlanImportState = useBTOStore((s) => s.setPlanImportState);
  const unitPlan = useBTOStore((s) => s.unitPlan);
  const planDraft = useBTOStore((s) => s.planDraft);

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(planImportState.rawImageUrl ?? null);
  const [normalizedPlan, setNormalizedPlan] = useState<UnitPlan | null>(null);
  const [editing, setEditing] = useState(false);

  const processFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setPlanImportState({ status: "error", error: "Unsupported file type. Use PNG, JPEG, WebP, or PDF." });
      return;
    }

    setPlanImportState({ status: "uploading" });

    try {
      let dataUrl: string;

      if (file.type === "application/pdf") {
        const { rasterizePdfToDataUrl } = await import("../../lib/pdf-rasterizer");
        dataUrl = await rasterizePdfToDataUrl(file);
      } else {
        dataUrl = await readFileAsDataUrl(file);
      }

      setPreviewUrl(dataUrl);
      setPlanImportState({ status: "extracting", rawImageUrl: dataUrl });

      const draft = await extractFloorPlanDraft(dataUrl);
      setPlanDraft(draft);

      setPlanImportState({ status: "normalizing" });
      const plan = normalizeDraft(draft, "upload");
      plan.rawAssetRef = dataUrl;
      setNormalizedPlan(plan);

      setPlanImportState({ status: "ready" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Extraction failed";
      setPlanImportState({ status: "error", error: message });
    }
  }, [setPlanDraft, setPlanImportState]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleEditorConfirm = useCallback((editedPlan: UnitPlan) => {
    verifyUnitPlan(editedPlan);
    setNormalizedPlan(null);
    setEditing(false);
  }, [verifyUnitPlan]);

  const handleEditorReset = useCallback(() => {
    // reset just the editor edits, keep normalizedPlan
  }, []);

  const handleClear = useCallback(() => {
    clearUnitPlan();
    setPreviewUrl(null);
    setNormalizedPlan(null);
    setEditing(false);
    if (fileRef.current) fileRef.current.value = "";
  }, [clearUnitPlan]);

  // Already have a verified plan
  if (unitPlan?.status === "verified") {
    return (
      <div className="plan-import">
        <div className="plan-import-status plan-import-status--success">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>verified</span>
          <span className="font-mono">Verified floor plan active ({unitPlan.rooms.length} rooms)</span>
        </div>
        <div className="plan-import-actions">
          <button className="plan-import-btn plan-import-btn--danger" onClick={handleClear}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
            Remove Plan
          </button>
        </div>
      </div>
    );
  }

  // Editing phase: show PlanEditor for adjustment before verification
  if (editing && normalizedPlan) {
    return (
      <div className="plan-import">
        <PlanEditor
          plan={normalizedPlan}
          onConfirm={handleEditorConfirm}
          onReset={handleEditorReset}
          onClear={handleClear}
        />
      </div>
    );
  }

  const isProcessing = planImportState.status === "uploading"
    || planImportState.status === "extracting"
    || planImportState.status === "normalizing";

  return (
    <div className="plan-import">
      {/* Upload zone */}
      <div
        data-testid="plan-import-upload"
        className={`plan-import-upload ${dragover ? "plan-import-upload--dragover" : ""}`}
        onClick={() => !isProcessing && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={handleDrop}
      >
        <span className="material-symbols-outlined plan-import-upload-icon">
          {isProcessing ? "hourglass_top" : "upload_file"}
        </span>
        <div className="plan-import-upload-text">
          <p className="font-mono" style={{ fontSize: 12 }}>
            {isProcessing ? statusLabel(planImportState.status) : "TAP OR DROP FLOOR PLAN"}
          </p>
          <p className="text-dim" style={{ fontSize: 11 }}>PNG, JPEG, WebP, or PDF</p>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        style={{ display: "none" }}
        onChange={handleFileSelect}
        data-testid="plan-import-file-input"
      />

      {/* Preview */}
      {previewUrl && (
        <div className="plan-import-preview">
          <img src={previewUrl} alt="Floor plan preview" />
        </div>
      )}

      {/* Status */}
      {planImportState.status === "error" && (
        <div className="plan-import-status plan-import-status--error">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
          <span>{planImportState.error}</span>
        </div>
      )}

      {/* Draft info */}
      {planDraft && planImportState.status === "ready" && (
        <div className="plan-import-status plan-import-status--success">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>
          <span className="font-mono">
            Extracted {planDraft.rooms.length} rooms, {planDraft.walls.length} walls
            (confidence: {Math.round(planDraft.overallConfidence * 100)}%)
          </span>
        </div>
      )}

      {/* Actions: go to editor for review/adjustment before verification */}
      {normalizedPlan && planImportState.status === "ready" && (
        <div className="plan-import-actions">
          <button className="plan-import-btn" onClick={handleClear}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>restart_alt</span>
            Reset
          </button>
          <button
            className="plan-import-btn plan-import-btn--primary"
            onClick={() => setEditing(true)}
            data-testid="review-adjust-plan"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
            Review & Adjust
          </button>
        </div>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "uploading": return "READING FILE...";
    case "extracting": return "AI EXTRACTING LAYOUT...";
    case "normalizing": return "PROCESSING GEOMETRY...";
    default: return "PROCESSING...";
  }
}
