import type { Metadata } from "next";
import "./globals.css";
import "./mobile.css";
import "./autonomy.css";
import "./live-warehouse.css";
import "./agents.css";
import "./system-state.css";
import { SystemStateRail } from "@/components/system-state-rail";
import { SystemStateProvider } from "@/components/system-state-provider";

export const metadata: Metadata = {
  title: "Mercury OS | Microcap Alpha Intelligence",
  description: "Institutional microcap intelligence, risk, social, liquidity and market regime command system."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><SystemStateProvider><SystemStateRail />{children}</SystemStateProvider></body></html>;
}
