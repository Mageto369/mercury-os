import { ActivationReadiness } from '@/components/activation-readiness';
import { AgentFleet } from '@/components/agent-fleet';
import { AutonomyConsole } from '@/components/autonomy-console';
import { CommandCenter } from '@/components/command-center';
import { LiveWarehousePanel } from '@/components/live-warehouse-panel';
import { ShadowPerformance } from '@/components/shadow-performance';

export default function Home() {
  return <>
    <CommandCenter />
    <ActivationReadiness />
    <ShadowPerformance />
    <LiveWarehousePanel />
    <AutonomyConsole />
    <AgentFleet />
  </>;
}
