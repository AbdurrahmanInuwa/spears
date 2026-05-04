'use client';

import { useState } from 'react';
import Link from 'next/link';

const tabs = ['Citizen', 'Institution'];

export default function SignInPage() {
  const [activeTab, setActiveTab] = useState('Citizen');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    // Hook into backend later
    console.log('Login:', { role: activeTab, username, password });
  }

  return (
    <div className="flex h-full items-center justify-center px-6 py-8">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
        {/* Header — 2-tab grid */}
        <div className="grid grid-cols-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-4 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-brand text-white'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label
              htmlFor="username"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark"
          >
            Login
          </button>

          <p className="pt-2 text-center text-xs text-slate-600">
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              className="font-semibold text-brand hover:underline"
            >
              Create account now
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
