import Link from 'next/link';
import { AdminSuite } from '@/components/admin-suite';

export default function AdminPage(){
  return <main className="workspace" style={{minHeight:'100vh',maxWidth:1500,margin:'0 auto'}}>
    <div style={{padding:'14px 0'}}><Link href="/" className="tiny">← Mercury Command Center</Link></div>
    <AdminSuite/>
  </main>;
}
