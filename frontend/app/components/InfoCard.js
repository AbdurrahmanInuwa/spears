export default function InfoCard({ title, children, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}
    >
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>
      <div className="text-sm text-slate-600">{children}</div>
    </div>
  );
}
