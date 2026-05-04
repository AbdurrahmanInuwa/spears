'use client';

import { useState } from 'react';
import Link from 'next/link';
import CitizenForm from './CitizenForm';
import InstitutionForm from './InstitutionForm';

export default function SignUpPage() {
  // 'choose' | 'citizen' | 'institution'
  const [step, setStep] = useState('choose');

  if (step === 'citizen') {
    return <CitizenForm onBack={() => setStep('choose')} />;
  }
  if (step === 'institution') {
    return <InstitutionForm onBack={() => setStep('choose')} />;
  }

  return (
    <div className="flex h-full items-center justify-center px-6 py-8">
      <div className="w-full max-w-2xl">
        <h1 className="text-center text-3xl font-extrabold text-slate-900">
          Create Account
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Choose the type of account you&apos;d like to create.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            onClick={() => setStep('citizen')}
            className="group flex flex-col items-center rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg"
          >
            <span className="text-lg font-bold text-slate-900 group-hover:text-brand">
              Citizen
            </span>
            <span className="mt-2 text-xs text-slate-500">
              Personal account for individuals seeking and offering help.
            </span>
          </button>

          <button
            onClick={() => setStep('institution')}
            className="group flex flex-col items-center rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg"
          >
            <span className="text-lg font-bold text-slate-900 group-hover:text-brand">
              Institution
            </span>
            <span className="mt-2 text-xs text-slate-500">
              Hospitals, police, fire, and other emergency response bodies.
            </span>
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Already have an account?{' '}
          <Link
            href="/signin"
            className="font-semibold text-brand hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
