import './globals.css';
import Header from './components/Header';
import Footer from './components/Footer';
import { ToastProvider } from './components/Toast';

export const metadata = {
  title: 'SPAERS — Smart Panic Alert & Emergency Response System',
  description:
    'SPAERS connects you instantly to volunteers, hospitals, and emergency services when every second counts.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="h-dvh flex flex-col overflow-hidden">
        <ToastProvider>
          <Header />
          <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}
