import { useCallback, useRef, useState, type DragEvent } from "react";
import { useBTOStore } from "../../lib/store";
import { extractFloorPlanDraft, readFileAsDataUrl } from "../../lib/plan-extraction";
import { normalizeDraft } from "../../lib/plan-helpers";
import type { UnitPlan } from "../../lib/types";
import "./PlanImport.css";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

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

  const processFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setPlanImportState({ status: "error", error: "Unsupported file type. Use PNG, JPEG, or WebP." });
      return;
    }

    setPlanImportState({ status: "uploading" });

    try {
      const dataUrl = await readFileAsDataUrl(file);
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

  const handleConfirm = useCallback(() => {
    if (normalizedPlan) {
      verifyUnitPlan(normalizedPlan);
      setNormalizedPlan(null);
    }
  }, [normalizedPlan, verifyUnitPlan]);

  const handleClear = useCallback(() => {
    clearUnitPlan();
    setPreviewUrl(null);
    setNormalizedPlan(null);
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

  const isProcessing = planImportState.status === "uploading"
    || planImportState.status === "extracting"
    || planImportState.status === "normalizing";

  return (
    <div className="plan-import">
      {/* Upload zone */}
      <div
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
            {isProcessing ? statusLabel(planImportState.status) : "TAP OR DROP FLOOR PLAN IMAGE"}
          </p>
          <p className="text-dim" style={{ fontSize: 11 }}>PNG, JPEG, or WebP</p>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={handleFileSelect}
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

      {/* Actions */}
      {normalizedPlan && planImportState.status === "ready" && (
        <div className="plan-import-actions">
          <button className="plan-import-btn" onClick={handleClear}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>restart_alt</span>
            Reset
          </button>
          <button className="plan-import-btn plan-import-btn--primary" onClick={handleConfirm}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
            Verify & Use Plan
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

export function SpatialBadge() {
  const spatialMode = useBTOStore((s) => s.spatialMode);
  const unitPlan = useBTOStore((s) => s.unitPlan);
  const planDraft = useBTOStore((s) => s.planDraft);

  if (unitPlan?.status === "verified") {
    return <span className="plan-badge plan-badge--verified">Verified Plan</span>;
  }
  if (planDraft || unitPlan?.status === "draft") {
    return <span className="plan-badge plan-badge--draft">Draft Plan</span>;
  }
  if (spatialMode === "fallback") {
    return <span className="plan-badge plan-badge--fallback">Quick Layout</span>;
  }
  return null;
}
