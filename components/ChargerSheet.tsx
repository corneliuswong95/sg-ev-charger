'use client';

import type { Charger } from '@/lib/types';
import { getStatus, getMaxKw, uniquePlugSummary, STATUS_LABEL } from '@/lib/chargers';

interface Props {
  charger: Charger | null;
  onClose: () => void;
}

function navigateTo(lat: number, lng: number) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    window.open(`maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`, '_blank');
  } else {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
      '_blank',
    );
  }
}

export default function ChargerSheet({ charger, onClose }: Props) {
  const open = !!charger;
  return (
    <>
      <div className={`overlay${open ? ' active' : ''}`} onClick={onClose} />
      <div className={`sheet${open ? ' open' : ''}`}>
        {charger && <SheetBody charger={charger} onClose={onClose} />}
      </div>
    </>
  );
}

function SheetBody({ charger, onClose }: { charger: Charger; onClose: () => void }) {
  const status  = getStatus(charger);
  const maxKw   = getMaxKw(charger);
  const plugs   = uniquePlugSummary(charger.chargingPoints);
  const isPulse = status === 'available';
  const fracColor =
    status === 'available' ? 'var(--green)' : status === 'occupied' ? 'var(--red)' : 'var(--text)';

  return (
    <>
      <div className="sheet-header">
        <div className="handle" />
        <button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
        <div className="station-name">{charger.name}</div>
        <div className="station-addr">{charger.address}</div>
        <div className="station-operator">
          <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z" />
          </svg>
          {charger.operator}
        </div>
        <div className={`status-badge ${status}`}>
          <span className={`dot${isPulse ? ' pulse' : ''}`} />
          {STATUS_LABEL[status]}
        </div>
      </div>

      <div className="live-card">
        <div>
          <div className="live-label">Live availability</div>
          <div className="live-fraction">
            <span style={{ color: fracColor }}>{charger.available}</span>
            <span className="total"> / {charger.total}</span>
          </div>
          <div className="live-sub">points free now</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Max Power</div>
          <div className={`stat-val ${maxKw >= 50 ? 'amber' : 'green'}`}>
            {maxKw ? maxKw : '—'}<span className="stat-unit">{maxKw ? ' kW' : ''}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Points</div>
          <div className="stat-val">{charger.total || '—'}</div>
        </div>
      </div>

      {plugs.length > 0 && (
        <>
          <div className="stat-label" style={{ marginBottom: 10 }}>Connectors</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {plugs.map((p, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--surface2)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.plugType}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {p.current}
                    {p.price != null ? ` · $${p.price.toFixed(2)}/${p.priceType ?? 'kWh'}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)' }}>
                    {p.kw} kW
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {p.count} point{p.count > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <button className="nav-btn" onClick={() => navigateTo(charger.lat, charger.lng)}>
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21.71 11.29l-9-9a1 1 0 0 0-1.42 0l-9 9a1 1 0 0 0 0 1.42l9 9a1 1 0 0 0 1.42 0l9-9a1 1 0 0 0 0-1.42zM14 14.5V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.5l3.5 3.5-3.5 3.5z" />
        </svg>
        Navigate
      </button>
    </>
  );
}
