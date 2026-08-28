import Link from 'next/link';
import { AiIntelligenceCenter } from '@/components/ai-intelligence-center';

export default function AiPage(){return <main className="admin-page"><header className="admin-topbar"><Link href="/" className="admin-back">← Command Center</Link><div><div className="eyebrow">Mercury OS</div><h1>AI & Signal Intelligence</h1><p>Research-only LLM routing, debate, multi-agent synthesis and signal evidence.</p></div><Link href="/market" className="admin-back">Market Intelligence →</Link></header><AiIntelligenceCenter/></main>}
