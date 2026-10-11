'use client';

import { useEffect, useState } from 'react';
import type { CarParkRef, ParkingDetails } from '@/lib/types';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: ParkingDetails }
  | { kind: 'error' };

export default function CarParkInfo({ carPark }: { carPark: CarParkRef | null }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const key = carPark ? `${carPark.kind}/${encodeURIComponent(carPark.code)}` : null;

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    setState({ kind: 'loading' });
    fetch(`/api/parking/${key}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: ParkingDetails) => setState({ kind: 'ready', data }))
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ kind: 'error' });
      });
    return () => ctrl.abort();
  }, [key]);

  if (!carPark) {
    return (
      <div className="fee-box plain">
        Parking rates for this location aren’t published as open data. Expect the car park’s usual
        charges on top of the charging fee, and check the signboard at the entrance.
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
        Parking details didn’t load.
        {carPark.kind === 'hdb' && ` HDB car park ${carPark.code} charges ${carPark.central ? 'from ' : ''}$0.60 per 30 minutes for cars.`}
      </div>
    );
  }

  const d = state.data;
  return (
    <>
      <div className="carpark-head">
        <span className="p-sign" aria-hidden>P</span>
        <div>
          <div className="carpark-name">{d.title}</div>
          {d.subtitle && <div className="carpark-sub">{d.subtitle}</div>}
        </div>
        <div className="lots">
          {d.lotsAvailable != null ? (
            <>
              <span className="num">{d.lotsAvailable}</span>
              <small>car lots free</small>
            </>
          ) : (
            <small>Live lots not reported</small>
          )}
        </div>
      </div>
      {d.lines.length > 0 && (
        <table className="rate-table">
          <tbody>
            {d.lines.map(l => (
              <tr key={l.label}>
                <th scope="row">{l.label}</th>
                <td>{l.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {d.notes.map(n => (
        <p key={n} className="section-note">{n}</p>
      ))}
      {d.link && (
        <a className="rates-link" href={d.link.url} target="_blank" rel="noreferrer">
          {d.link.label}
        </a>
      )}
      {d.sources.length > 0 && (
        <p className="section-note">
          Source:{' '}
          {d.sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ', '}
              <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
            </span>
          ))}
        </p>
      )}
    </>
  );
}
