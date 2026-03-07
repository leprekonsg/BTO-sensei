import type { FlatType, RoomName } from "./types";

export const ROOM_CENTERS: Record<RoomName, { x: number; y: number }> = {
  "Master Bedroom": { x: 125, y: 125 },
  "Common Bedroom": { x: 125, y: 365 },
  "Master Bathroom": { x: 300, y: 70 },
  "Common Bathroom": { x: 300, y: 190 },
  Kitchen: { x: 475, y: 130 },
  "Living Room": { x: 475, y: 370 },
  Balcony: { x: 630, y: 370 },
};

export const FLAT_ROOM_CENTERS: Record<FlatType, Record<RoomName, { x: number; y: number }>> = {
  "3-room": {
    "Master Bedroom": { x: 150, y: 150 },
    "Common Bedroom": { x: 150, y: 390 },
    "Master Bathroom": { x: 350, y: 100 },
    "Common Bathroom": { x: 350, y: 250 },
    Kitchen: { x: 530, y: 130 },
    "Living Room": { x: 530, y: 370 },
    Balcony: { x: 650, y: 370 },
  },
  "4-room": {
    "Master Bedroom": { x: 125, y: 125 },
    "Common Bedroom": { x: 125, y: 365 },
    "Master Bathroom": { x: 300, y: 70 },
    "Common Bathroom": { x: 300, y: 190 },
    Kitchen: { x: 475, y: 130 },
    "Living Room": { x: 475, y: 370 },
    Balcony: { x: 630, y: 370 },
  },
  "5-room": {
    "Master Bedroom": { x: 110, y: 120 },
    "Common Bedroom": { x: 110, y: 310 },
    "Master Bathroom": { x: 270, y: 70 },
    "Common Bathroom": { x: 270, y: 190 },
    Kitchen: { x: 460, y: 120 },
    "Living Room": { x: 460, y: 350 },
    Balcony: { x: 620, y: 350 },
  },
};

export function getRoomCenters(flatType: FlatType): Record<RoomName, { x: number; y: number }> {
  return FLAT_ROOM_CENTERS[flatType];
}
