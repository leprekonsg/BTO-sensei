import { Type } from "@google/genai";
import type { FunctionDeclaration } from "@google/genai";

export const reportAcousticDeclaration: FunctionDeclaration = {
  name: "report_acoustic_result",
  description:
    "Report an acoustic tile tap test result to the user. Called after DSP analysis classifies a tap as hollow or solid.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      tile_type: {
        type: Type.STRING,
        enum: ["hollow", "solid"],
        description: "Classification result from the DSP pipeline.",
      },
      confidence: {
        type: Type.NUMBER,
        description: "Classification confidence between 0 and 1.",
      },
      commentary: {
        type: Type.STRING,
        description:
          "Ah Seng's assessment of the result in Singlish. Keep it short and practical.",
      },
    },
    required: ["tile_type", "confidence", "commentary"],
  },
};

export const logDefectDeclaration: FunctionDeclaration = {
  name: "log_defect",
  description:
    "Log a defect found during BTO flat inspection. Called when visual or acoustic evidence confirms a defect.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      room: {
        type: Type.STRING,
        description: "Room where the defect was found.",
      },
      defect_type: {
        type: Type.STRING,
        description: "Type of defect, e.g. 'Hollow tile', 'Wall crack', 'Water stain'.",
      },
      severity: {
        type: Type.STRING,
        enum: ["Minor", "Moderate", "Critical"],
        description: "Severity per BCA CONQUAS 2022 R2: Critical = water seepage/leakage, structural cracks >0.3mm, broken glass, non-functional doors/windows/locks, waterproofing failure, electrical hazard, FCU leak. Moderate = hollow tiles, hairline cracks >50mm, paint spalling >50mm, misaligned frames >3mm, chipped tile edges, loose fittings. Minor = cosmetic scratches, small paint blemishes <50mm, tonality differences, minor alignment, removable stains, scuff marks. Reference CONQUAS Appendix 1 tolerances when applicable.",
      },
      description: {
        type: Type.STRING,
        description: "Brief description of the defect.",
      },
      recommendation: {
        type: Type.STRING,
        description: "Recommended action for the homeowner.",
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 1.",
      },
      severity_rationale: {
        type: Type.STRING,
        description: "One-line reason for the chosen severity.",
      },
      review_required: {
        type: Type.BOOLEAN,
        description: "True when the defect should be manually verified on site.",
      },
      bbox: {
        type: Type.ARRAY,
        description: "Optional normalized bounding box [ymin, xmin, ymax, xmax] in the 0-1000 range.",
        items: {
          type: Type.NUMBER,
        },
      },
    },
    required: ["room", "defect_type", "severity", "description", "recommendation", "confidence"],
  },
};

export const generateReportDeclaration: FunctionDeclaration = {
  name: "generate_report",
  description:
    "Generate a comprehensive inspection report for the BTO flat. Called when the user requests a summary.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      flat_id: {
        type: Type.STRING,
        description: "The BTO flat unit identifier.",
      },
      inspection_date: {
        type: Type.STRING,
        description: "Date of inspection in YYYY-MM-DD format.",
      },
    },
    required: ["flat_id", "inspection_date"],
  },
};

export const geminiToolDeclarations = [
  reportAcousticDeclaration,
  logDefectDeclaration,
  generateReportDeclaration,
];
