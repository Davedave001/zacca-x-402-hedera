/**
 * Live e2e client: runs the full 402 -> pay -> 200 flow against the local
 * resource server, paying real testnet HBAR through the configured
 * facilitator. This is what a buying agent does.
 *
 * Requires in .env: HEDERA_CLIENT_ID, HEDERA_CLIENT_KEY (funded testnet
 * payer). Prints the HashScan link for the settlement transaction.
 */
import "dotenv/config";
import {
  decodePaymentResponseHeader,
  wrapFetchWithPayment,
  x402Client,
} from "@x402/fetch";
import { PrivateKey, createClientHederaSigner } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import type { Network } from "@x402/core/types";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:4021";
const NETWORK = (process.env.HEDERA_NETWORK ?? "hedera:testnet") as Network;
const PRODUCT = process.env.E2E_PRODUCT ?? "dcs-score";
const SUBJECT = process.env.E2E_SYMBOL ?? "biz-alice-mboga";

function fail(message: string): never {
  console.error(`\n[e2e] ${message}`);
  process.exit(1);
}

async function main() {
  const clientId = process.env.HEDERA_CLIENT_ID;
  const clientKey = process.env.HEDERA_CLIENT_KEY;
  if (!clientId || !clientKey) {
    fail(
      "Set HEDERA_CLIENT_ID and HEDERA_CLIENT_KEY in .env (funded Hedera testnet account).",
    );
  }

  // 1. Discover the product from the live catalog.
  const catalogRes = await fetch(`${SERVER_URL}/catalog`);
  if (!catalogRes.ok) fail(`GET /catalog failed: ${catalogRes.status}`);
  const catalog = (await catalogRes.json()) as {
    products: { id: string; params: string[]; priceHbar: string }[];
  };
  const product = catalog.products.find((p) => p.id === PRODUCT);
  if (!product) {
    fail(
      `Product "${PRODUCT}" not in catalog. Available: ${catalog.products.map((p) => p.id).join(", ")}`,
    );
  }
  const paramName = product.params[0] ?? "businessId";
  const url = `${SERVER_URL}/data/${product.id}?${paramName}=${encodeURIComponent(SUBJECT)}`;
  console.log(`[e2e] product: ${product.id} (${product.priceHbar} HBAR)`);
  console.log(`[e2e] url:     ${url}`);

  // 2. Plain request — expect 402 Payment Required.
  const unpaid = await fetch(url);
  console.log(`\n[e2e] unpaid request  -> HTTP ${unpaid.status}`);
  if (unpaid.status !== 402) {
    fail(`Expected 402 for unpaid request, got ${unpaid.status}`);
  }
  console.log(`[e2e] 402 body: ${JSON.stringify(await unpaid.json())}`);

  // 3. Paid request — wrapFetchWithPayment handles 402 -> sign -> retry.
  const signer = createClientHederaSigner(
    clientId,
    PrivateKey.fromString(clientKey),
    { network: NETWORK },
  );
  const client = new x402Client().register(
    NETWORK,
    new ExactHederaScheme(signer),
  );
  const fetchWithPay = wrapFetchWithPayment(fetch, client);

  console.log(`\n[e2e] paying as ${clientId} on ${NETWORK} ...`);
  const paid = await fetchWithPay(url);
  console.log(`[e2e] paid request    -> HTTP ${paid.status}`);
  if (!paid.ok) {
    const headerDump = [...paid.headers.entries()]
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");
    fail(
      `Paid request failed: ${paid.status} ${await paid.text()}\n[e2e] response headers:\n${headerDump}`,
    );
  }

  const body = await paid.json();
  console.log(`\n[e2e] response body:\n${JSON.stringify(body, null, 2)}`);

  // 4. Decode settlement header -> HashScan link.
  const settlementHeader = paid.headers.get("PAYMENT-RESPONSE");
  if (settlementHeader) {
    const settlement = decodePaymentResponseHeader(settlementHeader);
    console.log(`\n[e2e] settlement: success=${settlement.success}`);
    if (settlement.transaction) {
      const hashscanNet = NETWORK.endsWith("mainnet") ? "mainnet" : "testnet";
      console.log(`[e2e] transaction id: ${settlement.transaction}`);
      console.log(
        `[e2e] HashScan: https://hashscan.io/${hashscanNet}/transaction/${encodeURIComponent(settlement.transaction)}`,
      );
    }
  } else {
    console.log(
      "\n[e2e] no PAYMENT-RESPONSE header on the response (check facilitator settlement).",
    );
  }

  console.log("\n[e2e] full 402 -> pay -> 200 round trip complete.");
}

main().catch((err) => {
  console.error("[e2e] error:", err);
  process.exit(1);
});
