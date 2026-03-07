export interface FunctionDeclaration {
  name: string;
  description: string;
}

export const reportAcousticDeclaration: FunctionDeclaration = {
  name: "report_acoustic_result",
  description: "Narrate acoustic classification in Ah Seng voice.",
};

export const logDefectDeclaration: FunctionDeclaration = {
  name: "log_defect",
  description: "Log a defect with room, severity, and recommendation.",
};

export const generateReportDeclaration: FunctionDeclaration = {
  name: "generate_report",
  description: "Generate an inspection report from logged evidence.",
};

export const geminiToolDeclarations = [
  reportAcousticDeclaration,
  logDefectDeclaration,
  generateReportDeclaration,
];
