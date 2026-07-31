import { REPO_URL, SDK_URL } from "../lib/config";

export function Nav() {
  return (
    <nav className="eb-nav">
      <a className="eb-logo" href="#">
        Zacca
      </a>
      <div className="eb-nav-links">
        <a className="eb-nav-link" href="#try-it">
          Try it live
        </a>
        <a className="eb-nav-link" href={SDK_URL} target="_blank" rel="noreferrer">
          SDK
        </a>
        <a className="chip" href={REPO_URL} target="_blank" rel="noreferrer">
          Source
        </a>
        <a className="chip primary" href="#try-it">
          <span className="dot" aria-hidden="true" />
          Pay-per-query
        </a>
      </div>
    </nav>
  );
}
