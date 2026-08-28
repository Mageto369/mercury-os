'use client';

import { useState } from 'react';
import { useSystemState } from '@/components/system-state-provider';

/**
 * Always-visible runtime posture.
 *
 * Without this an operator cannot distinguish a healthy Mercury with a quiet
 * market from a Mercury that is not connected to anything at all — both render
 * as screens full of zeros.
 */
export function SystemStateRail() {
  const { state, checkedAt } = useSystemState();
  const [open, setOpen] = useState(false);

  const posture = state?.posture ?? 'unreachable';
  const blockers = state?.blockers ?? [];

  return (
    <div className="sys-rail" data-posture={posture} aria-label="Mercury system state">
      <button
        type="button"
        className="sys-rail-summary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="sys-dot" aria-hidden="true" />
        <b className="sys-label">{state?.label ?? 'CHECKING'}</b>
        <span className="sys-detail">{state?.detail ?? 'Reading system health…'}</span>
        <span className="sys-facts">
          <span title="Warehouse connection">
            DB <b>{state?.database.reachable ? 'UP' : 'DOWN'}</b>
          </span>
          <span title="Configured data providers">
            PROVIDERS <b>{state?.providers.configured ?? 0}/{state?.providers.total ?? 0}</b>
          </span>
          <span title="Live securities in the warehouse">
            UNIVERSE <b>{state?.ingestion.liveSecurities ?? 0}</b>
          </span>
          <span title="Real capital is locked and cannot be enabled from the application">
            CAPITAL <b className="sys-locked">LOCKED</b>
          </span>
        </span>
        {blockers.length > 0 && <span className="sys-count">{blockers.length}</span>}
      </button>

      {open && (
        <div className="sys-rail-detail">
          {blockers.length === 0 ? (
            <p className="sys-clear">No runtime blockers. Every configured subsystem is responding.</p>
          ) : (
            <ul className="sys-blockers">
              {blockers.map((blocker) => (
                <li key={blocker.key}>
                  <b>{blocker.label}</b>
                  <span>{blocker.remedy}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="sys-checked">
            Shadow mode · research only · checked {checkedAt ? new Date(checkedAt).toLocaleTimeString() : '—'}
          </p>
        </div>
      )}
    </div>
  );
}
