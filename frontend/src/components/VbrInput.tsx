import { useState } from "react";
import { API_BASE_URL } from "../lib/config";
import { SectionHeader } from "./SectionHeader";

type Status = "idle" | "submitting" | "done" | "error";

export function VbrInput() {
  const [businessId, setBusinessId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [yearsInBusiness, setYearsInBusiness] = useState("1");
  const [sector, setSector] = useState("gig-delivery");
  const [status, setStatus] = useState<Status>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = businessId.trim() !== "" && businessName.trim() !== "" && status !== "submitting";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    setTxHash(null);

    try {
      const res = await fetch(`${API_BASE_URL}/vbr-input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: businessId.trim(),
          businessName: businessName.trim(),
          yearsInBusiness: Number(yearsInBusiness) || 0,
          sector: sector.trim() || "unspecified",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setTxHash(body.onChain?.transactionHash ?? null);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <section className="eb-section" id="vbr-input">
      <SectionHeader
        number="004"
        label="Submit your own VBR data"
        title="Input your business evidence — attested on-chain, credit limit updates immediately."
      >
        <p className="section-text">
          This writes directly to the on-chain <code>VBRRegistry</code> (Zacca's backend reviews and attests it —
          the same trust model as the seeded demo data, not a self-attestation). Try it with a brand-new business
          id: it starts with zero evidence, and after submitting, <code>dcs-score</code>/<code>credit-limit</code>{" "}
          above will immediately reflect a real (if modest, since there's no cash-flow statement yet) score instead
          of "no evidence on file."
        </p>
      </SectionHeader>

      <form onSubmit={handleSubmit}>
        <div className="grid cols-3">
          <div className="field">
            <label htmlFor="vbr-businessId">Business id (pick a new one)</label>
            <input
              id="vbr-businessId"
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              placeholder="biz-your-name-here"
            />
          </div>
          <div className="field">
            <label htmlFor="businessName">Business / trading name</label>
            <input
              id="businessName"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Alice's Deliveries"
            />
          </div>
          <div className="field">
            <label htmlFor="yearsInBusiness">Years active</label>
            <input
              id="yearsInBusiness"
              type="number"
              min={0}
              max={65535}
              value={yearsInBusiness}
              onChange={(e) => setYearsInBusiness(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="sector">Sector</label>
          <input id="sector" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="gig-delivery" />
        </div>
        <button className="btn" type="submit" disabled={!canSubmit}>
          {status === "submitting" ? "Attesting on-chain…" : "Submit & attest →"}
        </button>
      </form>

      {error && (
        <div className="callout error" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      {txHash && (
        <div className="callout" style={{ marginTop: 16 }}>
          Attested on-chain. Transaction: <span className="mono">{txHash}</span>
          <br />
          Now scroll up to <strong>Try it live</strong>, set business id to{" "}
          <span className="mono">{businessId}</span>, and run <code>dcs-score</code> or <code>credit-limit</code> to
          see it reflected.
        </div>
      )}
    </section>
  );
}
