/**
 * Shown while the password is being changed. Your images and note history are re-encrypted with the new
 * password, one file at a time and flushed to disk, which takes about a second per hundred files: a large
 * library can take a minute. Saying so keeps people from closing the app in the middle.
 */
export function PasswordChangeProgress({ busy }: { busy: boolean }) {
  if (!busy) return null;
  return (
    <p className="muted small" role="status" style={{ margin: '10px 0 0' }}>
      Re-encrypting your images and note history with the new password. With a large library this can take a minute —
      please keep Cadence open until it finishes.
    </p>
  );
}
