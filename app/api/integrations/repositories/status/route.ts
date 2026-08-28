import { NextResponse } from 'next/server';
import { getRepositoryIntegrationStatus } from '@/lib/integrations/repository-registry';

export async function GET(){
  return NextResponse.json({mode:'shadow', capitalExecutionEnabled:false, integrations:getRepositoryIntegrationStatus()});
}
