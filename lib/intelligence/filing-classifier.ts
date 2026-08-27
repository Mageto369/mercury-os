export type FilingSignalType = 'dilution' | 'catalyst' | 'insider' | 'governance' | 'financials' | 'other';

export interface FilingClassification {
  type: FilingSignalType;
  riskDelta: number;
  catalystDelta: number;
  priority: 'critical' | 'high' | 'normal';
  label: string;
}

export function classifyFilingForm(form: string): FilingClassification {
  const normalized = form.toUpperCase().trim();

  if (normalized === 'S-1' || normalized === 'S-3' || normalized.startsWith('424B')) {
    return {
      type: 'dilution',
      riskDelta: normalized.startsWith('424B') ? 30 : 24,
      catalystDelta: -8,
      priority: 'critical',
      label: 'financing or resale registration risk',
    };
  }

  if (normalized === '8-K') {
    return {
      type: 'catalyst',
      riskDelta: 0,
      catalystDelta: 18,
      priority: 'high',
      label: 'material corporate event',
    };
  }

  if (normalized === '4') {
    return {
      type: 'insider',
      riskDelta: 0,
      catalystDelta: 5,
      priority: 'high',
      label: 'insider transaction',
    };
  }

  if (normalized === 'DEF 14A') {
    return {
      type: 'governance',
      riskDelta: 4,
      catalystDelta: 2,
      priority: 'normal',
      label: 'governance or shareholder vote event',
    };
  }

  if (normalized === '10-Q' || normalized === '10-K') {
    return {
      type: 'financials',
      riskDelta: 0,
      catalystDelta: 8,
      priority: 'high',
      label: 'financial disclosure',
    };
  }

  return {
    type: 'other',
    riskDelta: 0,
    catalystDelta: 0,
    priority: 'normal',
    label: 'unclassified filing event',
  };
}
