import { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/config";
import { SectionHeader } from "./SectionHeader";

interface CatalogProduct {
  id: string;
  description: string;
  params: string[];
  priceHbar: string;
  endpoint: string;
}

interface CatalogResponse {
  service: string;
  provider: string;
  network: string;
  payTo: string;
  products: CatalogProduct[];
}

export function Catalog() {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/catalog`)
      .then((res) => {
        if (!res.ok) throw new Error(`GET /catalog -> HTTP ${res.status}`);
        return res.json();
      })
      .then((json: CatalogResponse) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="eb-section" id="catalog">
      <SectionHeader number="002" label="Live catalog" title="Pulled live from GET /catalog -- not hardcoded." />
      {error && <div className="callout error">Could not reach the API: {error}</div>}
      {!data && !error && <p style={{ color: "var(--muted)" }}>Loading catalog…</p>}
      {data && (
        <>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Params</th>
                <th>Price</th>
                <th>Endpoint</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.id}</strong>
                    <div style={{ color: "var(--muted)", fontSize: 13 }}>{p.description}</div>
                  </td>
                  <td className="mono">{p.params.join(", ")}</td>
                  <td className="mono">{p.priceHbar} HBAR</td>
                  <td className="mono">{p.endpoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>
            provider: <span className="mono">{data.provider}</span> &middot; network:{" "}
            <span className="mono">{data.network}</span> &middot; payTo:{" "}
            <span className="mono">{data.payTo}</span>
          </p>
        </>
      )}
    </section>
  );
}
