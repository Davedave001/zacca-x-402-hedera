/**
 * The Hedera SDK (@hiero-ledger/sdk, used transitively by @x402/hedera) has
 * a few code paths that reference the bare Node global `Buffer` directly
 * rather than importing the `buffer` package, so it doesn't get bundled
 * automatically -- confirmed by inspecting the production build output.
 * Vite doesn't polyfill Node globals by default (unlike older Webpack), so
 * this shim is required for those paths to work in a real browser.
 */
import { Buffer } from "buffer";

if (typeof window !== "undefined" && !(window as unknown as { Buffer?: unknown }).Buffer) {
  (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}
