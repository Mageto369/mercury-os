import Link from 'next/link';
import { ResearchProofLab } from '@/components/research-proof-lab';

export default function ResearchLabPage(){return <main className="admin-page"><header className="admin-topbar"><Link href="/" className="admin-back">← Command Center</Link><div><div className="eyebrow">Mercury OS</div><h1>Research & Proof Lab</h1><p>Point-in-time replay, experiments, stress testing and evidence gates.</p></div><Link href="/ai" className="admin-back">AI & Signals →</Link></header><ResearchProofLab/></main>}
