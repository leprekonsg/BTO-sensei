import type { RoomName } from "./types";

export const ROOM_CENTERS: Record<RoomName, { x: number; y: number }> = {
  "Master Bedroom": { x: 125, y: 125 },
  "Common Bedroom": { x: 125, y: 365 },
  "Master Bathroom": { x: 300, y: 70 },
  "Common Bathroom": { x: 300, y: 190 },
  Kitchen: { x: 475, y: 130 },
  "Living Room": { x: 475, y: 370 },
  Balcony: { x: 630, y: 370 },
};
