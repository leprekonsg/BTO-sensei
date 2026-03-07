import { useEffect } from "react";
import "./ChopStamp.css";

interface ChopStampProps {
    visible: boolean;
    onDone?: () => void;
}

export function ChopStamp({ visible, onDone }: ChopStampProps) {
    useEffect(() => {
        if (!visible) return;
        if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(100);
        }
        const timer = setTimeout(() => onDone?.(), 1200);
        return () => clearTimeout(timer);
    }, [visible, onDone]);

    if (!visible) return null;

    return (
        <div className="chop-overlay">
            <div className="chop-stamp animate-stamp-in">APPROVED</div>
        </div>
    );
}
