import { REPO_URL } from "../lib/config";

export function Footer() {
  return (
    <footer>
      <span>Zacca.ai &middot; Hedera x402 bounty submission</span>
      <a href={REPO_URL} target="_blank" rel="noreferrer">
        github.com/Davedave001/zacca-x-402-hedera ↗
      </a>
    </footer>
  );
}
