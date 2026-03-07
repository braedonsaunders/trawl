import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trawl — B2B Lead Intelligence",
  description:
    "Discover, enrich, score, and engage B2B leads with AI-powered intelligence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
