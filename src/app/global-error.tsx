"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "4rem 1.25rem",
          textAlign: "center",
          // Warmes Design-System (OVERVIEW §3): Creme-Hintergrund, Ink-Text, Koralle-Knopf.
          // Das Root-Layout (und damit next/font) fehlt hier → Nunito nur, falls installiert.
          background: "#fdf9f3",
          color: "#33291f",
          fontFamily:
            "Nunito, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 900, margin: 0 }}>
          Da ist etwas schiefgelaufen
        </h1>
        <p style={{ maxWidth: "28rem", margin: 0, color: "#6b5e4b", fontWeight: 600 }}>
          Es ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: "0.5rem",
            padding: "0.625rem 1.25rem",
            fontSize: "0.9rem",
            fontWeight: 800,
            color: "#fff",
            background: "#ef6a4e",
            border: "none",
            borderRadius: "999px",
            boxShadow: "0 4px 0 #d3543a",
            cursor: "pointer",
          }}
        >
          Erneut versuchen
        </button>
      </body>
    </html>
  );
}
