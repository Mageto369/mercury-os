import Link from 'next/link';
import { CommandCenter } from '@/components/command-center';

export default function Home() {
  return <>
    <Link href="/admin" aria-label="Open Admin Suite" style={{position:'fixed',right:18,bottom:18,zIndex:50,padding:'9px 12px',border:'1px solid #263044',borderRadius:9,background:'#0c1220',color:'#a9b9d4',fontSize:12,textDecoration:'none'}}>Admin Suite</Link>
    <CommandCenter />
  </>;
}
