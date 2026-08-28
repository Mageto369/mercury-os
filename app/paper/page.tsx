import Link from 'next/link';
import { PaperTradingTerminal } from '@/components/paper-trading-terminal';
import './paper.css';

export default function PaperTradingPage() {
  return <main className="admin-shell paper-shell">
    <header className="admin-topbar">
      <Link href="/" className="admin-back">← Command Center</Link>
      <div className="admin-brand"><div className="logo-mark">M</div><div><b>MERCURY PAPER</b><small>Simulation & execution research</small></div></div>
      <Link href="/admin" className="admin-back">Admin Suite →</Link>
    </header>
    <PaperTradingTerminal />
  </main>;
}
