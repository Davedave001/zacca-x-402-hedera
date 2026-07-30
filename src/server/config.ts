/** Server configuration from environment. */

export interface ServerConfig {
  /** CAIP-2 network id, e.g. "hedera:testnet". */
  network: string;
  /** x402 facilitator base URL. */
  facilitatorUrl: string;
  /** Hedera account id that receives payments (the resource server signs nothing). */
  payToAccount: string;
  /** Which DataProvider to serve. */
  dataProvider: string;
  port: number;
  /** Allowed CORS origins for the browser frontend (pay.zacca.ai, local dev). */
  corsOrigins: string[];
}

export function loadServerConfig(env = process.env): ServerConfig {
  const payToAccount = env.PAY_TO_ACCOUNT ?? "";
  if (!/^\d+\.\d+\.\d+$/.test(payToAccount)) {
    throw new Error(
      "PAY_TO_ACCOUNT must be set to a Hedera account id (e.g. 0.0.1234). Copy .env.example to .env and fill it in.",
    );
  }
  return {
    network: env.HEDERA_NETWORK ?? "hedera:testnet",
    facilitatorUrl: env.FACILITATOR_URL ?? "https://api.testnet.blocky402.com",
    payToAccount,
    dataProvider: env.DATA_PROVIDER ?? "zacca-decentralized",
    port: Number(env.PORT ?? 4021),
    corsOrigins: (env.CORS_ORIGIN ?? "https://pay.zacca.ai,http://localhost:5173")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
