'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth, ageFromDob } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { getDialCode } from '../../lib/countries';
import { apiFetch } from '../../lib/api';
import { uploadToS3, getSignedDownloadUrl } from '../../lib/uploads';
import ChangePasswordModal from '../../components/ChangePasswordModal';
import TwoFactorToggleModal from '../../components/TwoFactorToggleModal';
import DeleteAccountModal from '../../components/DeleteAccountModal';

function formatPhone(phone, country) {
  if (!phone) return '—';
  const dial = getDialCode(country);
  if (!dial) return phone;
  const local = String(phone).replace(/\D/g, '').replace(/^0+/, '');
  return `+${dial} ${local}`;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

export default function ProfilePage() {
  const { user, setLocal } = useAuth();
  const toast = useToast();

  const [avatarUrl, setAvatarUrl] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const fileRef = useRef(null);

  // Resolve a fresh signed URL whenever the avatarKey changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.avatarKey) {
        setAvatarUrl(null);
      } else {
        const url = await getSignedDownloadUrl(user.avatarKey);
        if (!cancelled) setAvatarUrl(url);
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.avatarKey]);

  function handlePickFile() {
    fileRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please select an image file', { variant: 'error' });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast('Image must be under 2 MB', { variant: 'error' });
      return;
    }
    setUploading(true);
    try {
      // 1. Upload to S3
      const { key } = await uploadToS3({
        category: 'avatar',
        file,
        ownerId: user.id,
      });
      // 2. Persist key on the citizen
      const res = await apiFetch('/citizens/me/avatar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarKey: key }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || 'Could not save avatar', { variant: 'error' });
        return;
      }
      // 3. Update local auth user so the new avatar appears immediately
      setLocal({ avatarKey: key });
      toast('Photo updated');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Upload failed', { variant: 'error' });
    } finally {
      setUploading(false);
      // Reset the file input so the same file can be picked again later
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleRemovePhoto() {
    try {
      const res = await apiFetch('/citizens/me/avatar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarKey: null }),
      });
      if (!res.ok) {
        toast('Could not remove avatar', { variant: 'error' });
        return;
      }
      setLocal({ avatarKey: null });
    } catch (err) {
      console.error(err);
    }
  }

  if (!user || !hydrated) return null;
  const age = ageFromDob(user.dob);
  const initials =
    `${(user.firstName || '?')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase();

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="max-w-5xl">
        {/* Header: avatar + identity */}
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
          <div className="group relative">
            <button
              type="button"
              onClick={handlePickFile}
              className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-brand text-3xl font-extrabold text-white shadow-lg ring-1 ring-slate-200"
              aria-label="Change profile photo"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{initials}</span>
              )}
              {/* Hover overlay */}
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-semibold uppercase tracking-wider text-white opacity-0 transition group-hover:opacity-100">
                Change
              </span>
              {uploading && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold uppercase tracking-wider text-white">
                  Uploading…
                </span>
              )}
            </button>
            {/* Camera badge */}
            <button
              type="button"
              onClick={handlePickFile}
              className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-brand text-white shadow-md transition hover:bg-brand-dark"
              aria-label="Upload new photo"
              title="Upload new photo"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          <div className="mt-4 flex-1 sm:mt-0">
            <h1 className="text-2xl font-extrabold text-slate-900">
              {user.firstName} {user.lastName}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">{user.email}</p>

            {user.spaersId && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(user.spaersId);
                    toast('SPAERS ID copied');
                  } catch {
                    toast('Could not copy', { variant: 'error' });
                  }
                }}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/5 px-3 py-1 text-xs font-bold tracking-wider text-brand transition hover:bg-brand hover:text-white"
                title="Click to copy"
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-70">
                  ID
                </span>
                <span className="font-mono">{user.spaersId}</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            )}

            {avatarUrl && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="ml-3 mt-3 text-xs font-semibold text-slate-400 hover:text-brand"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>

        {/* Info sections */}
        <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SectionCard title="Personal" accent="bg-brand">
            <Tile label="Name" value={`${user.firstName} ${user.lastName}`} />
            <Tile label="Email" value={user.email} />
            <Tile label="Phone" value={formatPhone(user.phone, user.country)} />
            <Tile label="Age" value={age != null ? `${age}` : '—'} />
          </SectionCard>

          <div className="self-start">
            <SectionCard
              title="Security"
              accent="bg-slate-500"
              action={
                <button
                  type="button"
                  onClick={() => setShowChangePassword(true)}
                  className="rounded-md bg-brand px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark"
                >
                  Change password
                </button>
              }
            >
              <Tile label="Password" value="••••••••" />
              <div className="bg-white px-5 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Two-factor auth
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <span
                    className={`text-sm font-medium ${
                      user.twoFactorEnabled
                        ? 'text-emerald-600'
                        : 'text-slate-500'
                    }`}
                  >
                    {user.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTwoFactor(true)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:border-brand hover:text-brand"
                  >
                    {user.twoFactorEnabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Medical" accent="bg-emerald-500">
            <Tile
              label="Blood group"
              value={user.bloodGroup || '—'}
              highlight={!!user.bloodGroup}
            />
            <Tile label="Allergies" value={user.allergies || '—'} />
            <Tile
              label="Chronic condition"
              value={user.chronicCondition || '—'}
            />
            <Tile
              label="Implanted device"
              value={user.implantDevice ? 'Yes' : 'No'}
            />
          </SectionCard>
        </div>

        {/* Danger zone — kept visually distinct so it's not mistaken for a
            routine setting. Clicking opens a modal that requires the user to
            type a confirmation phrase before the delete request fires. */}
        <section className="mt-10 overflow-hidden rounded-xl border border-rose-200 bg-white shadow-sm">
          <header className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-5 py-3">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-rose-700">
              Danger zone
            </h2>
          </header>
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Delete account
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Permanently remove your SPAERS account, medical profile, and
                family membership. This cannot be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              className="inline-flex shrink-0 items-center justify-center rounded-md border border-rose-300 bg-white px-4 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-600 hover:text-white"
            >
              Delete account
            </button>
          </div>
        </section>
      </div>

      {showChangePassword && (
        <ChangePasswordModal
          role="citizen"
          email={user.email}
          onClose={() => setShowChangePassword(false)}
        />
      )}
      {showTwoFactor && (
        <TwoFactorToggleModal
          currentlyEnabled={!!user.twoFactorEnabled}
          onClose={() => setShowTwoFactor(false)}
          onChanged={(enabled) => setLocal({ twoFactorEnabled: enabled })}
        />
      )}
      {showDelete && (
        <DeleteAccountModal onClose={() => setShowDelete(false)} />
      )}
    </div>
  );
}

function SectionCard({ title, accent, children, action }) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${accent}`} />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
            {title}
          </h2>
        </div>
        {action}
      </header>
      <div className="grid flex-1 grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2">
        {children}
      </div>
    </section>
  );
}

function Tile({ label, value, highlight }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-medium ${
          highlight ? 'text-brand' : 'text-slate-800'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
