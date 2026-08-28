import Link from 'next/link';
import { CommandCenter } from '@/components/command-center';

const quickLinkStyle = {padding:'9px 12px',border:'1px solid #263044',borderRadius:9,background:'#0c1220',color:'#a9b9d4',fontSize:12,textDecoration:'none'} as const;

export default function Home() {
  return <>
    <div style={{position:'fixed',right:18,bottom:18,zIndex:50,display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
      <Link href="/ai" aria-label="Open AI and Signal Intelligence" style={quickLinkStyle}>AI & Signals</Link>
      <Link href="/market" aria-label="Open Market Intelligence" style={quickLinkStyle}>Market Intelligence</Link>
      <Link href="/paper" aria-label="Open Paper Trading" style={quickLinkStyle}>Paper Trading</Link>
      <Link href="/admin" aria-label="Open Admin Suite" style={quickLinkStyle}>Admin Suite</Link>
    </div>
    <CommandCenter />
  </>;
}
