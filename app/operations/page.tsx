import Link from 'next/link';
import { OperationsCenter } from '@/components/operations-center';

export default function OperationsPage(){return <main className="admin-page"><header className="admin-topbar"><Link href="/" className="admin-back">← Command Center</Link><div><div className="eyebrow">Mercury OS</div><h1>Operations Command Center</h1><p>Pipelines, data quality, audit evidence, notifications and readiness.</p></div><Link href="/admin" className="admin-back">Admin Suite →</Link></header><OperationsCenter/></main>}
