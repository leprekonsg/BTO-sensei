export function shouldFinalizeWorkingAnchor(
  requestGeneration: number,
  currentGeneration: number,
  requestAnchorId: string,
  activeAnchorId: string | null,
): boolean {
  return requestGeneration === currentGeneration && requestAnchorId === activeAnchorId;
}

export function shouldClearHudTapPoint(
  requestGeneration: number,
  currentGeneration: number,
  requestTapTimestamp: number,
  currentTapTimestamp: number | null,
): boolean {
  return requestGeneration === currentGeneration && requestTapTimestamp === currentTapTimestamp;
}
