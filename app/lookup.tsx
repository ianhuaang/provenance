"use client";

import { useEffect, useRef, useState } from "react";

type Done = { type: "done"; id: string; name: string; verdict: string; best: string | null; fromLibrary: boolean; costUsd: number; html: string };
type Phase = { kind: "idle" } | { kind: "running"; steps: string[] } | { kind: "error"; steps: string[]; message: string } | { kind: "done"; result: Done };

const CODE_KEY = "provenance-access-code";

export default function Lookup() {
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const started = useRef(0);

  useEffect(() => {
    try {
      setCode(localStorage.getItem(CODE_KEY) ?? "");
    } catch {}
  }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    try {
      localStorage.setItem(CODE_KEY, code);
    } catch {}
    started.current = Date.now();
    const steps: string[] = ["Starting…"];
    setPhase({ kind: "running", steps: [...steps] });

    let res: Response;
    try {
      res = await fetch("/api/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: url.trim(), code }) });
    } catch {
      setPhase({ kind: "error", steps, message: "Couldn't reach the server. Check your connection and try again." });
      return;
    }
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      setPhase({ kind: "error", steps, message: body.error ?? `Request failed (${res.status}).` });
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "progress") {
          steps.push(ev.message);
          setPhase({ kind: "running", steps: [...steps] });
        } else if (ev.type === "done") {
          setPhase({ kind: "done", result: ev });
          window.scrollTo({ top: 0 });
          return;
        } else if (ev.type === "error") {
          setPhase({ kind: "error", steps, message: ev.message });
          return;
        }
      }
    }
    setPhase({ kind: "error", steps, message: "The lookup stopped before finishing. It may have run past the server's time limit; try again." });
  }

  function openFull(html: string) {
    const blob = new Blob([html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener");
  }

  if (phase.kind === "done") {
    const r = phase.result;
    return (
      <>
        <div className="result-bar">
          <span>
            <b>{r.verdict}</b> · {r.best ?? "No verified price yet"} · {r.fromLibrary ? "From the library, prices refreshed" : "New profile"} · cost ${r.costUsd.toFixed(2)}
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <button onClick={() => openFull(r.html)}>Open full page</button>
            <button onClick={() => { setPhase({ kind: "idle" }); setUrl(""); }}>New lookup</button>
          </span>
        </div>
        <iframe className="profile" title={r.name} srcDoc={r.html} />
      </>
    );
  }

  const running = phase.kind === "running";
  return (
    <section className="hero">
      <div className="wrap">
        <div className="brand">Provenance</div>
        <h1>Paste a furniture link. See what it really is.</h1>
        <p>Who actually made it, whether it's a designer piece or a renamed factory item, and the cheapest place to buy the real thing.</p>
        <form className="paste" onSubmit={run}>
          <input
            id="url"
            type="url"
            inputMode="url"
            placeholder="https://www.example.com/products/that-lamp"
            aria-label="Product link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={running}
            required
          />
          <button type="submit" disabled={running}>
            {running ? "Looking…" : "Look it up"}
          </button>
        </form>
        <div className="code">
          <label htmlFor="code">Access code</label>
          <input id="code" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          <span>Needed for new lookups while the site is in testing.</span>
        </div>
        {phase.kind !== "idle" && (
          <div className="status" style={{ marginTop: 18, color: "var(--ink)" }}>
            {running ? (
              <span>
                <span className="spinner" aria-hidden="true" />
                Researching. New items take 1 to 3 minutes.
              </span>
            ) : (
              <span className="err">{phase.message}</span>
            )}
            <ol aria-live="polite">{phase.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </div>
        )}
      </div>
    </section>
  );
}
