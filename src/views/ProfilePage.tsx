import { FormEvent, useState } from 'react';
import { IcSave } from '../components/icons';
import { Button } from '../components/ui/Button';
import { useAccount } from '../AccountContext';
import { useAppData } from '../AppDataContext';

export function ProfilePage() {
  const { user } = useAccount();
  const { data, updateUserProfile } = useAppData();
  const profile = data.profile ?? { displayName: 'Me', favoriteTeamIds: [] };

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? '');
  const [department, setDepartment] = useState(profile.department ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [saved, setSaved] = useState(false);

  const apply = () => {
    updateUserProfile({
      displayName,
      jobTitle,
      department,
      phone,
      bio,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Profile</h1>
        <p className="muted">Your account and personal details. Kept separate from team data.</p>
      </header>

      <section className="card">
        <h2 className="card__title">Account</h2>
        <div className="field">
          <span>Email</span>
          <input className="input" readOnly value={user?.email ?? ''} title="Account email cannot be changed" />
        </div>
        <p className="muted small">Your email is set at sign-up and cannot be changed in-app yet.</p>
      </section>

      <section className="card">
        <h2 className="card__title">Personal details</h2>
        <form
          className="profile-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            apply();
          }}
        >
          <label className="field">
            <span>Display name</span>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </label>
          <label className="field">
            <span>Job title</span>
            <input className="input" placeholder="e.g. Engineering Manager" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Department / team</span>
            <input className="input" placeholder="e.g. Platform" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </label>
          <label className="field">
            <span>Phone</span>
            <input className="input" type="tel" placeholder="+1 …" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
          <div className="row" style={{ marginTop: 12 }}>
            <Button type="submit" variant="primary" icon={<IcSave size={18} />}>
              Save
            </Button>
            {saved ? <span className="muted small">Saved.</span> : null}
          </div>
        </form>
      </section>
    </div>
  );
}
