import { useBTOStore } from "../../lib/store";
import "./AhSengAvatar.css";

export function AhSengAvatar() {
    const message = useBTOStore((s) => s.inspectorMessage);

    return (
        <div className="ahseng-card">
            {/* HDB watermark */}
            <div className="ahseng-watermark">HDB</div>

            {/* Avatar */}
            <div className="ahseng-avatar-wrap">
                <div className="ahseng-avatar">
                    <span className="material-symbols-outlined ahseng-avatar-icon">engineering</span>
                </div>
                <div className="ahseng-verified">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>verified</span>
                </div>
            </div>

            {/* Info */}
            <div className="ahseng-info">
                <div className="ahseng-name-row">
                    <h3 className="ahseng-name">AH SENG</h3>
                    <span className="ahseng-role font-mono">Safety Officer</span>
                </div>
                <p className="ahseng-message">{message}</p>
            </div>
        </div>
    );
}
