import Link from 'next/link';
import { MarketIntelligenceCenter } from '@/components/market-intelligence-center';

export default function MarketPage(){return <main className="admin-page"><header className="admin-topbar"><Link href="/" className="admin-back">← Command Center</Link><div><div className="eyebrow">Mercury OS</div><h1>Market Intelligence</h1><p>Live opportunity scanner with a separate delayed-reference market view.</p></div><Link href="/paper" className="admin-back">Paper Trading →</Link></header><MarketIntelligenceCenter/></main>}
