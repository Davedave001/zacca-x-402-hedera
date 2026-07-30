import { useState } from "react";
import { PayFlowError, runPaidRequest, type PayResult, type PayStep } from "../lib/payClient";
import { DEFAULT_BUSINESS_ID, HASHSCAN_TESTNET } from "../lib/config";

const PRODUCTS = [
  { id: "vbr-lookup", label: "vbr-lookup — 0.01 HBAR" },
  { id: "dcs-score", label: "dcs-score — 0.02 HBAR" },
  { id: "credit-limit", label: "credit-limit — 0.05 HBAR" },
];

type Status = "idle" | "running" | "done" | "error";

export function TryItLive() {
  const [productId, setProductId] = useState("dcs-score");
  const [businessId, setBusinessId] = useState(DEFAULT_BUSINESS_ID);
  const [accountId, setAccountId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [steps, setSteps] = useState<PayStep[]>([]);
  const [result, setResult] = useState<PayResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = accountId.trim() !== "" && privateKey.trim() !== "" && status !== "running";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("running");
    setSteps([]);
    setResult(null);
    setError(null);

    try {
      const res = await runPaidRequest(productId, businessId, accountId.trim(), privateKey.trim(), (step) =>
        setSteps((prev) => [...prev, step]),
      );
      setResult(res);
      setStatus("done");
    } catch (err) {
      if (err instanceof PayFlowError) {
        setSteps(err.steps);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setStatus("error");
    }
  }

  return (
    <section id="try-it">
      <p className="section-label">003 / Try it live</p>
      <h2>Run the real 402 → sign → pay → 200 round trip, from this page.</h2>

      <div className="callout">
        Testnet HBAR only — no real money. Your private key is used only in
        this browser tab to locally sign a Hedera transfer transaction; it is
        never sent to Zacca or anyone else. Get a free funded testnet account
        at the{" "}
        <a href="https://portal.hedera.com/" target="_blank" rel="noreferrer">
          Hedera Portal
        </a>
        .
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid cols-3">
          <div className="field">
            <label htmlFor="product">Product</label>
            <select id="product" value={productId} onChange={(e) => setProductId(e.target.value)}>
              {PRODUCTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="businessId">Business id</label>
            <input
              id="businessId"
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              placeholder="biz-alice-mboga"
            />
          </div>
          <div className="field">
            <label htmlFor="accountId">Your testnet account id</label>
            <input
              id="accountId"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="0.0.xxxxx"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="privateKey">Your testnet private key (DER or raw hex)</label>
          <input
            id="privateKey"
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="302e0201003005..."
            autoComplete="off"
          />
        </div>
        <button className="btn" type="submit" disabled={!canSubmit}>
          {status === "running" ? "Paying…" : "Pay & Fetch →"}
        </button>
      </form>

      {steps.length > 0 && (
        <div className="log" style={{ marginTop: 24 }}>
          {steps.map((s, i) => (
            <div className="step" key={i}>
              <span className="step-label">{s.label}</span>
              {s.detail && <span className="step-detail"> — {s.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="callout error" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 16 }}>
          <pre className="result-json">{JSON.stringify(result.body, null, 2)}</pre>
          {result.settlement?.transactionHash && (
            <p style={{ marginTop: 12 }}>
              Settlement transaction:{" "}
              <a
                className="hashscan-link"
                href={`${HASHSCAN_TESTNET}/transaction/${result.settlement.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {result.settlement.transactionHash} ↗
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
