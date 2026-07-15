import { useEffect, useRef, useState } from 'react';

type Props = {
  text: string;
  label?: string;
};

/** Small copy button used across ephemeral Utilities tools. */
export function CopyButton({ text, label = 'Copy' }: Props) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  const flash = (ok: boolean) => {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    setDone(ok);
    setFailed(!ok);
    timerRef.current = setTimeout(() => {
      setDone(false);
      setFailed(false);
      timerRef.current = null;
    }, 1200);
  };

  return (
    <button
      type="button"
      className="btn btn--ghost btn--small"
      disabled={!text}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => flash(true),
          () => flash(false),
        );
      }}
    >
      {failed ? 'Copy failed' : done ? 'Copied' : label}
    </button>
  );
}
