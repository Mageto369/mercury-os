import { NextResponse } from 'next/server';
import { getOpenDataStatus } from '@/lib/providers/open-data/mesh';
export const runtime='nodejs';
export async function GET(){ return NextResponse.json(await getOpenDataStatus()); }
