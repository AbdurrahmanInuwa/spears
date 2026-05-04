import Link from 'next/link';

export default function Header() {
  return (
    <header className="w-full border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-extrabold tracking-tight text-brand">
            SPAERS
          </span>
        </Link>
        <nav className="flex items-center gap-8 text-sm font-medium text-slate-700">
          <Link href="/about" className="hover:text-brand transition-colors">
            About
          </Link>
          <Link
            href="/integration"
            className="hover:text-brand transition-colors"
          >
            Integration
          </Link>
        </nav>
      </div>
    </header>
  );
}
