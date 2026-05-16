import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { IcCheck, IcLock, IcPencil, IcTrash, IcX } from '../components/icons';
import { Button } from '../components/ui/Button';
import { useAccount } from '../AccountContext';
import { useAppData } from '../AppDataContext';

const MAX_AVATAR_BYTES = 1_500_000; // ~1.5 MB safety limit before downscale.

/**
 * Downscale + JPEG-encode a user-provided image so we can stash it on the
 * profile as a small `data:` URL without bloating the data file.
 */
async function fileToAvatarDataUrl(file: File): Promise<string> {
  const blob = file.size <= MAX_AVATAR_BYTES ? file : file;
  const bitmap = await createImageBitmap(blob);
  const max = 384;
  const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function initialsFor(name: string | undefined): string {
  const v = (name ?? '').trim();
  if (!v) return 'ME';
  const parts = v.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

type Tab = 'view' | 'edit' | 'password';

export function ProfilePage() {
  const { user, changePassword, hasElectronAccounts } = useAccount();
  const { data, updateUserProfile } = useAppData();
  const profile = data.profile ?? { displayName: 'Me', favoriteTeamIds: [] };

  const [tab, setTab] = useState<Tab>('view');

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? '');
  const [department, setDepartment] = useState(profile.department ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  // Re-sync the form whenever the profile in context changes (login, import, etc.).
  useEffect(() => {
    setDisplayName(profile.displayName);
    setJobTitle(profile.jobTitle ?? '');
    setDepartment(profile.department ?? '');
    setPhone(profile.phone ?? '');
    setBio(profile.bio ?? '');
  }, [profile.displayName, profile.jobTitle, profile.department, profile.phone, profile.bio]);

  const initials = useMemo(() => initialsFor(profile.displayName), [profile.displayName]);
  const avatarUrl = profile.avatarDataUrl;

  const onPickAvatar = () => fileRef.current?.click();
  const onAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setAvatarError(null);
    const f = event.target.files?.[0];
    event.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      return;
    }
    setAvatarBusy(true);
    try {
      const url = await fileToAvatarDataUrl(f);
      updateUserProfile({ avatarDataUrl: url });
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : 'Could not load that image.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const apply = () => {
    updateUserProfile({
      displayName,
      jobTitle,
      department,
      phone,
      bio,
    });
    setSavedAt(Date.now());
    setTab('view');
    window.setTimeout(() => setSavedAt(null), 2200);
  };

  const cancelEdit = () => {
    setDisplayName(profile.displayName);
    setJobTitle(profile.jobTitle ?? '');
    setDepartment(profile.department ?? '');
    setPhone(profile.phone ?? '');
    setBio(profile.bio ?? '');
    setTab('view');
  };

  const onSubmitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    if (newPassword !== newPassword2) {
      setPwError('The two new passwords do not match.');
      return;
    }
    setPwBusy(true);
    try {
      const r = await changePassword({ oldPassword, newPassword });
      if (!r.ok) {
        setPwError(r.error ?? 'Could not change password.');
        return;
      }
      setPwSuccess(true);
      setOldPassword('');
      setNewPassword('');
      setNewPassword2('');
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head profile-page__head">
        <div>
          <h1>Profile</h1>
          <p className="muted">Your account and personal details. Stored encrypted on this device.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {tab === 'view' ? (
            <>
              <Button
                type="button"
                variant="secondary"
                icon={<IcLock size={17} />}
                onClick={() => {
                  setPwError(null);
                  setPwSuccess(false);
                  setTab('password');
                }}
              >
                Change password
              </Button>
              <Button
                type="button"
                variant="primary"
                icon={<IcPencil size={17} />}
                onClick={() => setTab('edit')}
              >
                Edit
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              icon={<IcX size={17} />}
              onClick={() => {
                if (tab === 'edit') cancelEdit();
                else setTab('view');
              }}
            >
              Back
            </Button>
          )}
        </div>
      </header>

      <section className="card profile-card">
        <div className="profile-card__top">
          <div className="profile-card__avatar-wrap">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="profile-card__avatar" />
            ) : (
              <div className="profile-card__avatar profile-card__avatar--placeholder">{initials}</div>
            )}
            {tab === 'edit' ? (
              <div className="profile-card__avatar-actions">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onPickAvatar}
                  disabled={avatarBusy}
                >
                  {avatarUrl ? 'Change photo' : 'Add photo'}
                </Button>
                {avatarUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<IcTrash size={15} />}
                    onClick={() => updateUserProfile({ avatarDataUrl: undefined })}
                  >
                    Remove
                  </Button>
                ) : null}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={onAvatarChange}
                />
              </div>
            ) : null}
          </div>
          <div className="profile-card__head">
            <div className="profile-card__name">{profile.displayName || '—'}</div>
            <div className="profile-card__sub muted small">
              {[profile.jobTitle, profile.department].filter(Boolean).join(' · ') ||
                'No role or department set'}
            </div>
            <div className="profile-card__sub muted small">{user?.email ?? ''}</div>
          </div>
        </div>
        {avatarError ? <p className="form-msg form-msg--err small">{avatarError}</p> : null}

        {tab === 'view' ? (
          <dl className="profile-card__grid">
            <div className="profile-card__field">
              <dt>Display name</dt>
              <dd>{profile.displayName || '—'}</dd>
            </div>
            <div className="profile-card__field">
              <dt>Email</dt>
              <dd className="profile-card__email">{user?.email ?? '—'}</dd>
            </div>
            <div className="profile-card__field">
              <dt>Job title</dt>
              <dd>{profile.jobTitle || <span className="muted">—</span>}</dd>
            </div>
            <div className="profile-card__field">
              <dt>Department</dt>
              <dd>{profile.department || <span className="muted">—</span>}</dd>
            </div>
            <div className="profile-card__field">
              <dt>Phone</dt>
              <dd>{profile.phone || <span className="muted">—</span>}</dd>
            </div>
            <div className="profile-card__field profile-card__field--wide">
              <dt>About</dt>
              <dd>{profile.bio?.trim() ? profile.bio : <span className="muted">No bio yet.</span>}</dd>
            </div>
          </dl>
        ) : null}

        {tab === 'edit' ? (
          <form
            className="profile-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              apply();
            }}
          >
            <label className="field">
              <span>Display name</span>
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input className="input" readOnly value={user?.email ?? ''} title="Account email cannot be changed" />
            </label>
            <label className="field">
              <span>Job title</span>
              <input
                className="input"
                placeholder="e.g. Engineering Manager"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Department / team</span>
              <input
                className="input"
                placeholder="e.g. Platform"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Phone</span>
              <input
                className="input"
                type="tel"
                placeholder="+1 …"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="field">
              <span>About</span>
              <textarea
                className="textarea"
                rows={5}
                placeholder="Short bio, focus areas, personal notes…"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </label>
            <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <Button type="button" variant="ghost" onClick={cancelEdit}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" icon={<IcCheck size={17} />}>
                Save changes
              </Button>
            </div>
          </form>
        ) : null}

        {tab === 'password' ? (
          <form className="profile-form" onSubmit={onSubmitPassword}>
            <p className="muted small" style={{ marginTop: 0 }}>
              {hasElectronAccounts
                ? 'Re-encrypts your data file with the new password.'
                : 'Updates the locally stored password hash. Browser preview keeps data unencrypted.'}
            </p>
            <label className="field">
              <span>Current password</span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>New password</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword2}
                onChange={(e) => setNewPassword2(e.target.value)}
                required
              />
            </label>
            {pwError ? <p className="form-msg form-msg--err small">{pwError}</p> : null}
            {pwSuccess ? <p className="form-msg form-msg--ok small">Password updated.</p> : null}
            <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <Button type="button" variant="ghost" onClick={() => setTab('view')}>
                Back
              </Button>
              <Button type="submit" variant="primary" icon={<IcLock size={17} />} disabled={pwBusy}>
                {pwBusy ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </form>
        ) : null}

        {savedAt && tab === 'view' ? (
          <p className="form-msg form-msg--ok small" style={{ marginTop: 12 }}>
            Profile saved.
          </p>
        ) : null}
      </section>
    </div>
  );
}
