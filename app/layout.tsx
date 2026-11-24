import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Provenance: what is this furniture, really?",
  description: "Paste a furniture or lighting link. See who actually made it, whether it's a designer piece, and the cheapest place to buy it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
