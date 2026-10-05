'use client';

import { useEffect, useRef, useState } from 'react';
import type { Charger } from '@/lib/types';
import { getStatus, STATUS_LABEL } from '@/lib/chargers';
import { companyName, resolveOperator } from '@/lib/operators';
import { formatKw, formatPrice, formatTime } from '@/lib/format';
import { feeApplies, tariffFor, TARIFFS_CHECKED } from '@/lib/tariffs';
import OperatorIcon from './OperatorIcon';
import CarParkInfo from './CarParkInfo';
import { CheckIcon, CloseIcon, CopyIcon, NavigateIcon } from './Icons';

interface Props {
  charger: Charger | null;
  updatedAt: string | null;
  onClose: () => void;
}

function navigateTo(lat: number, lng: number) {
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
  const url = isApple
    ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  window.open(url, '_blank', 'noopener');
}

export default function ChargerSheet({ charger, updatedAt, onClose }: Props) {
  const open = !!charger;
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  // Keep the last station rendered while the sheet slides away.
  const [shown, setShown] = useState<Charger | null>(charger);
  useEffect(() => {
    if (charger) setShown(charger);
  }, [charger]);
  const body = charger ?? shown;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // New station → start at the top.
  useEffect(() => {
    sheetRef.current?.scrollTo({ top: 0 });
  }, [charger?.id]);

  return (
    <>
      <div className={`scrim${open ? ' active' : ''}`} onClick={onClose} />
      <div
        ref={sheetRef}
        className={`detail-sheet${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="false"
        aria-label={body?.name ?? 'Charger details'}
        aria-hidden={!open}
      >
        {body && (
          <SheetBody charger={body} updatedAt={updatedAt} onClose={onClose} closeRef={closeRef} />
        )}
      </div>
    </>
  );
}

function BayBar({ c }: { c: Charger }) {
  if (c.total === 0) return null;
  if (c.total <= 24) {
    const bays = [
      ...Array(c.available).fill('free'),
      ...Array(c.occupied).fill('busy'),
      ...Array(c.offline).fill('off'),
    ];
    return (
      <div className="bay-bar" aria-hidden>
        {bays.map((k, i) => <span key={i} className={`bay ${k}`} />)}
      </div>
    );
  }
  return (
    <div className="bay-bar" aria-hidden>
      <span className="bay free" style={{ flex: c.available }} />
      <span className="bay busy" style={{ flex: c.occupied }} />
      <span className="bay off" style={{ flex: c.offline }} />
    </div>
  );
}

function SheetBody({
  charger: c, updatedAt, onClose, closeRef,
}: {
  charger: Charger;
  updatedAt: string | null;
  onClose: () => void;
  closeRef: React.RefObject<HTMLButtonElement>;
}) {
  const status = getStatus(c);
  const op = resolveOperator(c.operator);
  const company = companyName(c.operator);
  const tariff = tariffFor(c.operator);
  const [copied, setCopied] = useState(false);
  const time = formatTime(updatedAt);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(`${c.name}, ${c.address}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — nothing useful to show */
    }
  }

  const headline =
    status === 'available'
      ? `${c.available === 1 ? 'connector' : 'connectors'} free`
      : status === 'occupied'
        ? 'All in use'
        : 'No live status';

  return (
    <>
      <div className="detail-head">
        <button ref={closeRef} className="detail-close" onClick={onClose} aria-label="Close">
          <CloseIcon size={18} />
        </button>
        <h2 className="detail-name">{c.name}</h2>
        <div className="detail-address">{c.address}</div>
        <div className="detail-operator">
          <OperatorIcon operator={c.operator} size={22} />
          <span>{op.label}</span>
          {company.toLowerCase() !== op.label.toLowerCase() && <small>{company}</small>}
        </div>
      </div>

      <div className="detail-body">
        <div className={`sign-plate ${status}`} role="status" aria-label={`${STATUS_LABEL[status]}: ${c.available} of ${c.total} connectors free`}>
          <div className="sign-figure">
            {status === 'offline' ? '–' : c.available}
            <small>/{c.total}</small>
          </div>
          <div className="sign-caption">
            <strong>{headline}</strong>
            {status === 'offline'
              ? 'The operator isn’t reporting live status for this site.'
              : time ? `Live from LTA at ${time}` : 'Live from LTA'}
          </div>
          <BayBar c={c} />
          {c.total > 0 && (c.occupied > 0 || c.offline > 0) && (
            <div className="bay-legend">
              {c.available > 0 && <span><i style={{ background: '#7ef0a8' }} />{c.available} free</span>}
              {c.occupied > 0 && <span><i style={{ background: '#ff9a92' }} />{c.occupied} in use</span>}
              {c.offline > 0 && <span><i style={{ background: 'rgba(255,255,255,.25)' }} />{c.offline} no status</span>}
            </div>
          )}
        </div>

        <section className="section">
          <h3 className="section-title">Connectors and prices</h3>
          <div>
            {c.connectors.map((k, i) => (
              <div className="connector" key={i}>
                <div className="connector-type">
                  {k.plugType}
                  <span className={`current${k.current === 'DC' ? ' dc' : ''}`}>{k.current}</span>
                </div>
                <div className="connector-price">
                  {k.free ? (
                    <span className="price-big">Free</span>
                  ) : k.price != null ? (
                    <>
                      <span className="price-big">{formatPrice(k.price)}</span>
                      <span className="price-unit">per kWh</span>
                    </>
                  ) : (
                    <span className="price-missing">Price not listed</span>
                  )}
                </div>
                <div className="connector-sub">
                  <span className="num">{formatKw(k.kw)}</span> kW, {k.count} connector{k.count > 1 ? 's' : ''},{' '}
                  {k.offline === k.count ? 'no live status' : `${k.available} free`}
                </div>
              </div>
            ))}
          </div>
          <p className="section-note">Prices as reported by the operator to LTA.</p>
        </section>

        <section className="section">
          <h3 className="section-title">Extra charges</h3>
          {tariff && tariff.fees.length > 0 ? (
            tariff.fees.map(f => {
              const a = feeApplies(f, c);
              return (
                <div key={f.title} className={`fee-box${a.applies === 'no' || !f.timeBased ? ' plain' : ''}`}>
                  <ul className="fee-list">
                    <li>
                      <strong>{f.title}</strong>
                      {f.detail}
                    </li>
                    {f.appliesAt && (
                      <li><strong style={{ display: 'inline' }}>{a.why}</strong></li>
                    )}
                  </ul>
                </div>
              );
            })
          ) : (
            <div className="fee-box plain">
              We couldn’t find any idle or time-based fees published by {op.label}. Check their app before leaving your car.
            </div>
          )}
          {tariff?.notes?.map(n => (
            <p key={n} className="section-note">{n}</p>
          ))}
          {tariff && (
            <p className="section-note">
              Checked {TARIFFS_CHECKED}.{' '}
              {tariff.sources.map((s, i) => (
                <span key={s.url}>
                  {i > 0 && ', '}
                  <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
                </span>
              ))}
            </p>
          )}
        </section>

        <section className="section">
          <h3 className="section-title">Parking</h3>
          <CarParkInfo carPark={c.carPark} />
        </section>
      </div>

      <div className="detail-actions">
        <button className="btn-primary" onClick={() => navigateTo(c.lat, c.lng)}>
          <NavigateIcon size={18} />
          Get directions
        </button>
        <button className="btn-secondary" onClick={copyAddress} aria-label={copied ? 'Address copied' : 'Copy address'}>
          {copied ? <CheckIcon size={20} /> : <CopyIcon size={20} />}
        </button>
      </div>
      <p className="data-credit">Charger data from LTA DataMall. Parking data from HDB via data.gov.sg.</p>
    </>
  );
}
