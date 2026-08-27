import { ActivationReadiness } from '@/components/activation-readiness';
import { AgentFleet } from '@/components/agent-fleet';
import { AutonomyConsole } from '@/components/autonomy-console';
import { CommandCenter } from '@/components/command-center';
import { IntelligenceLab } from '@/components/intelligence-lab';
import { LiveWarehousePanel } from '@/components/live-warehouse-panel';
import { PromotionGate } from '@/components/promotion-gate';
import { ShadowPerformance } from '@/components/shadow-performance';

export default function Home() {
  return <>
    <CommandCenter />
    <ActivationReadiness />
    <ShadowPerformance />
    <PromotionGate />
    <IntelligenceLab />
    <LiveWarehousePanel />
    <AutonomyConsole />
    <AgentFleet />
  </>;
}
