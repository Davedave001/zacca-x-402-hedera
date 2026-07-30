import { SectionHeader } from "./SectionHeader";

const STEPS = [
  {
    title: "Pay per call",
    body: "No accounts, invoices, or subscriptions. An agent -- a lender's underwriting bot, a BNPL checkout, a gig-payout app -- hits a 402, pays a few HBAR, and gets the result back in the same request.",
  },
  {
    title: "Evidence lives on-chain",
    body: "Verified-record (VBR) and payment/statement attestations are read from real smart contracts (VBRRegistry, StatementRegistry), not a centralized database only Zacca can see.",
  },
  {
    title: "Scored by an ICM reasoning pipeline",
    body: "DCS scoring runs through five numbered stages -- intake, cross-check, reasoning, review, attest -- each independently auditable, with the final score and rationale hash written to DCSRegistry on-chain.",
  },
  {
    title: "Stablecoin lending, not just a score",
    body: "CreditLine reads that attestation directly and disburses real (testnet) stablecoin on draw() -- score, approve, and fund, with no centralized loan-ops step in between.",
  },
];

export function HowItWorks() {
  return (
    <section className="eb-section">
      <SectionHeader number="001" label="How it works" title="Four steps, all verifiable independently of Zacca's backend." />
      <div className="grid">
        {STEPS.map((step, i) => (
          <div key={step.title} style={{ display: "flex", gap: 20 }}>
            <div
              className="mono"
              style={{ color: "var(--muted)", fontSize: 14, paddingTop: 2, width: 24, flexShrink: 0 }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <div>
              <h3 style={{ fontFamily: "var(--font-primary)", color: "var(--fg)", margin: "0 0 6px" }}>
                {step.title}
              </h3>
              <p style={{ color: "var(--subtitle)", margin: 0, fontSize: 14, lineHeight: 1.6 }}>{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
