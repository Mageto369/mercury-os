import type { Metadata } from "next";
import "./globals.css";
import "./mobile.css";

export const metadata: Metadata = {
  title: "Mercury OS | Microcap Alpha Intelligence",
  description: "Institutional microcap intelligence, risk, social, liquidity and market regime command system."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
