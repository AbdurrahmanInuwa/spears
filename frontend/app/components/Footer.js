export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="w-full border-t border-slate-200 bg-white py-4">
      <p className="text-center text-xs text-slate-500">
        © {year} SPAERS. All rights reserved.
      </p>
    </footer>
  );
}
