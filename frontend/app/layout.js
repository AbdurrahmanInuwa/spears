import './globals.css';
import AppChrome from './components/AppChrome';
import { ToastProvider } from './components/Toast';
import { AuthProvider } from './lib/auth';

export const metadata = {
  title: 'SPAERS — Smart Panic Alert & Emergency Response System',
  description:
    'SPAERS connects you instantly to volunteers, hospitals, and emergency services when every second counts.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col md:h-dvh md:overflow-hidden">
        <AuthProvider>
          <ToastProvider>
            <AppChrome>{children}</AppChrome>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
