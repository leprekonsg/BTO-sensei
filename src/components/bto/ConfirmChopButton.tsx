import "./ConfirmChopButton.css";

export function ConfirmChopButton() {
    return (
        <div className="action-area">
            <button className="confirm-chop-btn">
                <span className="confirm-chop-title">Confirm & Chop!</span>
                <span className="confirm-chop-subtitle">Official HDB Submission</span>
            </button>
        </div>
    );
}
