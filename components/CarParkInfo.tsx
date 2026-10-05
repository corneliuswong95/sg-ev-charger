'use client';

import { useEffect, useState } from 'react';
import type { CarParkRef, CarParkResponse } from '@/lib/types';
import { HDB_RATES_SOURCE, hdbRateLines, paymentText } from '@/lib/parking';
import { titleCase } from '@/lib/format';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: CarParkResponse }
  | { kind: 'error' };

export default function CarParkInfo({ carPark }: { carPark: CarParkRef | null }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const code = carPark?.code;

  useEffect(() => {
    if (!code) return;
    const ctrl = new AbortController();
    setState({ kind: 'loading' });
    fetch(`/api/carparks/${encodeURIComponent(code)}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: CarParkResponse) => setState({ kind: 'ready', data }))
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ kind: 'error' });
      });
    return () => ctrl.abort();
  }, [code]);

  if (!carPark) {
    return (
      <div className="fee-box plain">
        This charger isn’t in an HDB car park, and its parking rates aren’t published as open data.
        Expect the car park’s usual charges on top of the charging fee.
      </div>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div aria-busy="true" aria-label="Loading parking details">
        <div className="skeleton" style={{ width: '70%' }} />
        <div className="skeleton" />
        <div className="skeleton" style={{ width: '85%' }} />
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="fee-box plain">
        HDB car park {carPark.code}. Parking details didn’t load. HDB charges{' '}
        {carPark.central ? 'from ' : ''}$0.60 per 30 minutes for cars.
      </div>
    );
  }

  const { carPark: cp, lotsAvailable } = state.data;
  return (
    <>
      <div className="carpark-head">
        <span className="p-sign" aria-hidden>P</span>
        <div>
          <div className="carpark-name">HDB car park {cp.code}</div>
          <div className="carpark-sub">
            {titleCase(cp.type)}. {paymentText(cp.system)}.
          </div>
        </div>
        <div className="lots">
          {lotsAvailable != null ? (
            <>
              <span className="num">{lotsAvailable}</span>
              <small>car lots free</small>
            </>
          ) : (
            <small>Live lots not reported</small>
          )}
        </div>
      </div>
      <table className="rate-table">
        <tbody>
          {hdbRateLines(cp).map(l => (
            <tr key={l.label}>
              <th scope="row">{l.label}</th>
              <td>{l.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="section-note">
        Parking is paid separately from charging.{' '}
        <a href={HDB_RATES_SOURCE} target="_blank" rel="noreferrer">HDB parking charges</a>
      </p>
    </>
  );
}
