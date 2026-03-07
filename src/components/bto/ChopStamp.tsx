import { useEffect, useState } from "react";
import "./ChopStamp.css";

interface ChopStampProps {
    visible: boolean;
    onDone?: () => void;
}

export function ChopStamp({ visible, onDone }: ChopStampProps) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (visible) {
            setShow(true);
            if (typeof navigator !== "undefined" && navigator.vibrate) {
                navigator.vibrate(100);
            }
            const timer = setTimeout(() => {
                setShow(false);
                onDone?.();
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [visible, onDone]);

    if (!show) return null;

    return (
        <div className="chop-overlay">
            <div className="chop-stamp animate-stamp-in">APPROVED</div>
        </div>
    );
}
