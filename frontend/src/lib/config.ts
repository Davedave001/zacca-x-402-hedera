/** API base URL. In dev, Vite proxies /catalog and /data to the local backend
 * (see vite.config.ts) so this stays empty (relative requests). In
 * production, set VITE_API_BASE_URL at build time (e.g. https://pay-api.zacca.ai). */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "";

export const REPO_URL = "https://github.com/Davedave001/zacca-x-402-hedera";

export const DEFAULT_BUSINESS_ID = "biz-alice-mboga";

export const HASHSCAN_TESTNET = "https://hashscan.io/testnet";
