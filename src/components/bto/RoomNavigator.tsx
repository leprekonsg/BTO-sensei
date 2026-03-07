import { useBTOStore } from "../../lib/store";
import { ROOMS, type RoomName } from "../../lib/types";
import "./RoomNavigator.css";

export function RoomNavigator() {
  const currentRoom = useBTOStore((s) => s.currentRoom);
  const setCurrentRoom = useBTOStore((s) => s.setCurrentRoom);

  return (
    <div className="room-nav">
      <div className="room-nav-scroll">
        {ROOMS.map((room) => (
          <button
            key={room}
            className={`room-tab ${room === currentRoom ? "room-tab--active" : ""}`}
            onClick={() => setCurrentRoom(room as RoomName)}
          >
            <span className="material-symbols-outlined room-tab-icon">
              {roomIcon(room)}
            </span>
            <span className="room-tab-label">{room}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function roomIcon(room: string): string {
  if (room.includes("Kitchen")) return "countertops";
  if (room.includes("Bathroom")) return "bathtub";
  if (room.includes("Bedroom")) return "bed";
  if (room.includes("Balcony")) return "balcony";
  return "living";
}
