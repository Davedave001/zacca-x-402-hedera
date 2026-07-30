import { HASHSCAN_TESTNET } from "../lib/config";

const CONTRACTS = [
  { name: "VBRRegistry", address: "0x9e5B1EEf866112d4641C3034DdF8e8F4Fdb3aa04" },
  { name: "StatementRegistry", address: "0xd8cB93ec53098fc2e16796c47f5A262e2049f02A" },
  { name: "DCSRegistry", address: "0x0Fa9b992f554b04Dedf0d136Ea0dAAE8bdb92A83" },
  { name: "MockStablecoin (zUSD)", address: "0x1a25e6A46799865745a11D1250046eca04100747" },
  { name: "CreditLine", address: "0x08A86476f0224a1c847060E23b372083687B5800" },
];

const TRANSACTIONS = [
  {
    label: "Payment settlement (x402, native HBAR transfer)",
    hash: "0.0.7162784-1784634002-574637628",
  },
  {
    label: "DCS attestation written to DCSRegistry",
    hash: "0xa0a915bd0ac9324a08e4e5776bfab51b667ba26c3289666922dbaa238482e537",
  },
  {
    label: "zUSD stablecoin draw against CreditLine",
    hash: "0x7acaa96bafb860e5e208a0bd5fb5a6677b50cd3a416106287b71c4cc254dcc38",
  },
];

export function OnChainEvidence() {
  return (
    <section>
      <p className="section-label">004 / On-chain evidence</p>
      <h2>Real contracts, real transactions, on Hedera testnet.</h2>
      <p style={{ color: "var(--muted)" }}>
        Deployed 2026-07-21, independently confirmed via the Hedera testnet mirror
        node (not just trusted from script output). Full detail in{" "}
        <code>IMPLEMENTATION_PLAN.md</code> §6.
      </p>

      <h3 style={{ marginTop: 32 }}>Contracts</h3>
      <table>
        <tbody>
          {CONTRACTS.map((c) => (
            <tr key={c.address}>
              <td>{c.name}</td>
              <td className="mono">
                <a
                  href={`https://testnet.mirrornode.hedera.com/api/v1/contracts/${c.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.address} ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 32 }}>Transactions</h3>
      <table>
        <tbody>
          {TRANSACTIONS.map((t) => (
            <tr key={t.hash}>
              <td>{t.label}</td>
              <td className="mono">
                <a href={`${HASHSCAN_TESTNET}/transaction/${t.hash}`} target="_blank" rel="noreferrer">
                  {t.hash} ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
