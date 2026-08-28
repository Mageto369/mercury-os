import Link from 'next/link';
import { AdminSuite } from '@/components/admin-suite';

export default function AdminPage(){
  return <main className="admin-page">
    <header className="admin-topbar">
      <div>
        <div className="eyebrow">Mercury operator console</div>
        <h1>Admin Suite</h1>
        <p>Configure integrations, ingestion and system monitoring from one protected workspace.</p>
      </div>
      <Link href="/" className="admin-back">← Command Center</Link>
    </header>
    <AdminSuite/>
  </main>;
}
