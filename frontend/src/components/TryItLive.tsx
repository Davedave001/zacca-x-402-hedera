import { useEffect, useState } from "react";
import { PayFlowError, runPaidRequest, type PayResult, type PayStep } from "../lib/payClient";
import { runMetaMaskPaidRequest } from "../lib/metamaskPay";
import { API_BASE_URL, DEFAULT_BUSINESS_ID, HASHSCAN_TESTNET } from "../lib/config";
import { SectionHeader } from "./SectionHeader";

const PRODUCTS = [
  { id: "vbr-lookup", label: "vbr-lookup — 0.01 HBAR", priceTinybars: "1000000" },
  { id: "dcs-score", label: "dcs-score — 0.02 HBAR", priceTinybars: "2000000" },
  { id: "credit-limit", label: "credit-limit — 0.05 HBAR", priceTinybars: "5000000" },
];

const ORACLES = [
  { id: "pyth" as const, label: "Pyth Network" },
  { id: "supra" as const, label: "Supra Oracles" },
];

const STABLECOINS = [
  { id: "zusd" as const, label: "zUSD (testnet MockStablecoin, funded pool)" },
  { id: "usdc" as const, label: "USDC (real Hedera testnet USDC, pool not yet funded)" },
];

type Status = "idle" | "running" | "done" | "error";
type SignMethod = "key" | "metamask";

export function TryItLive() {
  const [productId, setProductId] = useState("dcs-score");
  const [businessId, setBusinessId] = useState(DEFAULT_BUSINESS_ID);
  const [signMethod, setSignMethod] = useState<SignMethod>("key");
  const [accountId, setAccountId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [oracleId, setOracleId] = useState<"pyth" | "supra">("pyth");
  const [stablecoin, setStablecoin] = useState<"zusd" | "usdc">("zusd");
  const [status, setStatus] = useState<Status>("idle");
  const [steps, setSteps] = useState<PayStep[]>([]);
  const [result, setResult] = useState<PayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payToAccount, setPayToAccount] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/catalog`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && typeof json.payTo === "string") setPayToAccount(json.payTo);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const usesOracle = productId === "dcs-score" || productId === "credit-limit";
  const usesStablecoin = productId === "credit-limit";
  const canSubmit =
    status !== "running" &&
    (signMethod === "metamask" ? payToAccount !== null : accountId.trim() !== "" && privateKey.trim() !== "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("running");
    setSteps([]);
    setResult(null);
    setError(null);

    const onStep = (step: PayStep) => setSteps((prev) => [...prev, step]);

    try {
      const res =
        signMethod === "key"
          ? await runPaidRequest(productId, businessId, accountId.trim(), privateKey.trim(), onStep, {
              oracleId: usesOracle ? oracleId : undefined,
              stablecoin: usesStablecoin ? stablecoin : undefined,
            })
          : await runMetaMaskPaidRequest(
              productId,
              businessId,
              PRODUCTS.find((p) => p.id === productId)!.priceTinybars,
              payToAccount!,
              onStep,
              {
                ...(usesOracle ? { oracle: oracleId } : {}),
                ...(usesStablecoin ? { stablecoin } : {}),
              },
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
    <section className="eb-section" id="try-it">
      <SectionHeader number="003" label="Try it live" title="Run the real 402 → sign → pay → 200 round trip, from this page." />

      <div className="callout">
        Testnet HBAR only — no real money. With "Paste a key," your private
        key is used only in this browser tab to locally sign a Hedera
        transfer transaction and never sent anywhere. Get a free funded
        testnet account at the{" "}
        <a href="https://portal.hedera.com/" target="_blank" rel="noreferrer">
          Hedera Portal
        </a>
        .
      </div>

      <div className="field">
        <label>Sign with</label>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={signMethod === "key" ? "btn" : "btn secondary"}
            onClick={() => setSignMethod("key")}
          >
            Paste a key
          </button>
          <button
            type="button"
            className={signMethod === "metamask" ? "btn" : "btn secondary"}
            onClick={() => setSignMethod("metamask")}
          >
            MetaMask
          </button>
        </div>
      </div>

      {signMethod === "metamask" && (
        <div className="callout">
          MetaMask signs a plain HBAR value transfer (not the native Hedera
          transaction the "paste a key" flow produces) — Zacca's backend
          verifies it by inspecting the transaction receipt instead. You'll
          be prompted to add/switch to Hedera Testnet (chain id 296) if your
          wallet isn't on it already.
        </div>
      )}

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
          {signMethod === "key" && (
            <div className="field">
              <label htmlFor="accountId">Your testnet account id</label>
              <input
                id="accountId"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="0.0.xxxxx"
              />
            </div>
          )}
        </div>
        {usesOracle && (
          <div className="field">
            <label htmlFor="oracle">Price oracle (HBAR/USD, live on Hedera testnet)</label>
            <select id="oracle" value={oracleId} onChange={(e) => setOracleId(e.target.value as "pyth" | "supra")}>
              {ORACLES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {usesStablecoin && (
          <div className="field">
            <label htmlFor="stablecoin">Disbursement stablecoin (CreditLine instance)</label>
            <select
              id="stablecoin"
              value={stablecoin}
              onChange={(e) => setStablecoin(e.target.value as "zusd" | "usdc")}
            >
              {STABLECOINS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {signMethod === "key" && (
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
        )}
        <button className="btn" type="submit" disabled={!canSubmit}>
          {status === "running" ? "Paying…" : signMethod === "metamask" ? "Connect & Pay →" : "Pay & Fetch →"}
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
          {(() => {
            const oracle = result.body.oracle as
              | { provider: string; pair: string; price: number; ageSeconds: number }
              | null
              | undefined;
            if (!oracle) return null;
            return (
              <div className="callout" style={{ marginBottom: 16 }}>
                Priced via <strong>{oracle.provider}</strong> {oracle.pair} @ ${oracle.price.toFixed(5)} (
                {oracle.ageSeconds}s old)
              </div>
            );
          })()}
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
