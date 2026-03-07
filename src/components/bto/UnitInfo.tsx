import "./UnitInfo.css";

export function UnitInfo() {
    return (
        <section className="unit-info industrial-border">
            <h2 className="unit-info-title">HDB Standard Check - Site 88A</h2>
            <div className="unit-info-grid">
                <div className="unit-info-field">
                    <label>Block No.</label>
                    <input type="text" defaultValue="321B" />
                </div>
                <div className="unit-info-field">
                    <label>Unit No.</label>
                    <input type="text" defaultValue="#12-452" />
                </div>
            </div>
        </section>
    );
}
