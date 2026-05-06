export default function InfoCard({ title, children, className = '' }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <h3 className="mb-3 text-base font-semibold text-slate-900">{title}</h3>
      <div className="text-[15px] leading-relaxed text-slate-600">
        {children}
      </div>
    </div>
  );
}
