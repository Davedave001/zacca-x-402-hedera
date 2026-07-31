import { SectionHeader } from "./SectionHeader";

const ORACLE_PROVIDERS = [
  {
    name: "Pyth Network",
    mechanism: "Pull oracle -- reads the last on-chain-cached update via getPriceUnsafe()",
    pair: "HBAR/USD",
    address: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  },
  {
    name: "Supra Oracles",
    mechanism: "Push oracle -- storage contract updated periodically by Supra's network, read via getSvalue()",
    pair: "HBAR/USDT",
    address: "0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917",
  },
];

export function Oracles() {
  return (
    <section className="eb-section" id="oracles">
      <SectionHeader
        number="002"
        label="Live oracles"
        title="Credit-limit conversion is priced off a real feed, not a hardcoded FX rate."
      >
        <p className="section-text">
          Pick a provider below in <strong>Try it live</strong> -- both are real, deployed Hedera testnet oracle
          networks, independently confirmed live (non-zero, non-stale, mutually consistent prices) during
          development. If a quote comes back stale or missing, the ICM pipeline flags it and falls back to a
          conservative fixed rate rather than silently trusting a bad price.
        </p>
      </SectionHeader>

      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Pair</th>
            <th>Mechanism</th>
            <th>Contract</th>
          </tr>
        </thead>
        <tbody>
          {ORACLE_PROVIDERS.map((o) => (
            <tr key={o.address}>
              <td>
                <strong>{o.name}</strong>
              </td>
              <td className="mono">{o.pair}</td>
              <td style={{ color: "var(--muted)", fontSize: 13 }}>{o.mechanism}</td>
              <td className="mono">
                <a
                  href={`https://testnet.mirrornode.hedera.com/api/v1/contracts/${o.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {o.address} ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
