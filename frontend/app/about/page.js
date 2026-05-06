export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Mobile: simple stacked layout. Desktop (md+): keeps the original
          spinning-figure-with-overlapping-cards composition. */}

      {/* Heading — always visible, top */}
      <h1 className="text-2xl font-extrabold leading-tight text-slate-900 sm:text-3xl md:whitespace-nowrap md:text-3xl">
        Saving <span className="text-brand">Lives</span> Through{' '}
        <span className="text-brand">Faster</span>,{' '}
        <span className="text-brand">Smarter</span> Emergency Response
      </h1>

      {/* Mobile-only stacked content */}
      <div className="mt-6 space-y-5 md:hidden">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm leading-relaxed text-slate-600">
            Every second counts in an emergency. Studies show that survival
            rates in cardiac emergencies drop by up to 10% for every minute
            without help, while traditional emergency services take an
            average of 8–12 minutes to respond in cities, and even longer
            in rural areas. The SOS Emergency Response Module was built to
            close that critical gap.
          </p>
        </div>

        {/* Decorative spinning figure (smaller on mobile) */}
        <div className="flex items-center justify-center py-4">
          <div className="relative flex h-44 w-44 items-center justify-center">
            <div className="absolute inset-0 animate-spin-slow rounded-full border-4 border-dashed border-brand/40" />
            <div className="absolute inset-4 animate-spin-slow rounded-full border-2 border-brand/30 [animation-direction:reverse]" />
            <div className="absolute inset-8 rounded-full bg-gradient-to-br from-brand to-brand-dark opacity-90 shadow-2xl" />
            <span className="relative text-xl font-extrabold tracking-wider text-white">
              SOS
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
          <h2 className="text-lg font-bold text-slate-900">Our Mission</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Our mission is to transform how emergencies are reported and
            handled by combining the speed of mobile technology, the reach
            of community volunteers, and the expertise of professional
            responders into one unified platform. We believe that no one
            should face a life-threatening situation alone, and that help
            should be only a tap, or even a spoken word, away.
          </p>
        </div>
      </div>

      {/* Desktop overlap composition */}
      <div className="relative mt-10 hidden h-[480px] md:block">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative flex h-72 w-72 items-center justify-center">
            <div className="absolute inset-0 animate-spin-slow rounded-full border-4 border-dashed border-brand/40" />
            <div className="absolute inset-6 animate-spin-slow rounded-full border-2 border-brand/30 [animation-direction:reverse]" />
            <div className="absolute inset-12 rounded-full bg-gradient-to-br from-brand to-brand-dark opacity-90 shadow-2xl" />
            <span className="relative text-2xl font-extrabold tracking-wider text-white">
              SOS
            </span>
          </div>
        </div>

        <div className="absolute bottom-1/2 right-1/2 z-10 w-[32rem] max-w-[calc(100%-3rem)] -translate-x-10 -translate-y-10 rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
          <p className="text-sm leading-relaxed text-slate-600">
            Every second counts in an emergency. Studies show that survival
            rates in cardiac emergencies drop by up to 10% for every minute
            without help, while traditional emergency services take an
            average of 8–12 minutes to respond in cities, and even longer
            in rural areas. The SOS Emergency Response Module was built to
            close that critical gap.
          </p>
        </div>

        <div className="absolute left-1/2 top-1/2 z-10 w-[32rem] max-w-[calc(100%-3rem)] translate-x-10 translate-y-10 rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
          <h2 className="text-lg font-bold text-slate-900">Our Mission</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Our mission is to transform how emergencies are reported and
            handled by combining the speed of mobile technology, the reach
            of community volunteers, and the expertise of professional
            responders into one unified platform. We believe that no one
            should face a life-threatening situation alone, and that help
            should be only a tap, or even a spoken word, away.
          </p>
        </div>
      </div>
    </div>
  );
}
