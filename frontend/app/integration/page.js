export default function IntegrationPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <div className="grid grid-cols-1 items-center gap-16 md:grid-cols-12">
        {/* Left: editorial-style copy */}
        <div className="md:col-span-7">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
            Hardware
          </p>

          <h1 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight text-slate-900 md:text-5xl">
            A <span className="text-brand">Physical</span> Lifeline.
          </h1>

          <div className="mt-8 space-y-5 text-[15px] leading-[1.7] text-slate-600">
            <p>
              We&apos;ve extended the SOS Emergency Response Module beyond
              software with a dedicated hardware device, a compact, wearable
              panic button designed to trigger emergency alerts at the press of
              a button.
            </p>
            <p>
              Paired wirelessly with your smartphone, the device seamlessly
              integrates with our mobile application to deliver the same
              powerful response workflow: instant location sharing, trustee
              notifications, volunteer alerts, and institutional routing.
            </p>
            <p>
              Whether worn as a pendant, clipped to a bag, or kept within reach
              at home, it ensures help is always accessible, even when your
              phone isn&apos;t. Because in a real emergency, every second
              counts, and reaching for a phone shouldn&apos;t stand between you
              and the help you need.
            </p>
          </div>
        </div>

        {/* Right: image placeholder */}
        <div className="md:col-span-5">
          <div className="aspect-[4/5] w-full overflow-hidden rounded-sm bg-slate-100">
            <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-widest text-slate-400">
              Hardware image
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
