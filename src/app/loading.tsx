export default function Loading() {
  return <main className="system-loading" aria-live="polite" aria-busy="true">
    <div className="system-loading__brand"><span aria-hidden="true">GP</span><strong>GeoPartners</strong></div>
    <div className="system-loading__layout" aria-hidden="true">
      <div className="system-loading__rail" />
      <div className="system-loading__panel"><i /><i /><i /><i /></div>
      <div className="system-loading__map" />
    </div>
    <span className="system-loading__label">Завантаження робочого простору…</span>
  </main>;
}
