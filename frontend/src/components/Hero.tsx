import { REPO_URL } from "../lib/config";

export function Hero() {
  return (
    <section style={{ paddingTop: 96 }}>
      <p className="section-label">Zacca Credit Intelligence API / x402 on Hedera</p>
      <h1>Credit scoring and stablecoin lending for people already living on-chain.</h1>
      <p className="lead">
        GenZ freelancers, gig workers, and crypto-native earners already get paid,
        pay bills, and shop in stablecoins &mdash; with no legacy credit file to
        show for it. Zacca reads that on-chain income directly, scores it through
        a decentralized, LLM-reasoning pipeline, and lets a lender extend real
        stablecoin credit against the result. Pay-per-query, no accounts, settled
        on Hedera testnet.
      </p>
      <div className="hero-ctas">
        <a className="btn" href="#try-it">
          Try it live →
        </a>
        <a className="btn secondary" href={REPO_URL} target="_blank" rel="noreferrer">
          View source →
        </a>
      </div>
    </section>
  );
}
