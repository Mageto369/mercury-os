import { AutonomyConsole } from '@/components/autonomy-console';
import { CommandCenter } from '@/components/command-center';
import { LiveWarehousePanel } from '@/components/live-warehouse-panel';

export default function Home() {
  return <>
    <CommandCenter />
    <LiveWarehousePanel />
    <AutonomyConsole />
  </>;
}
