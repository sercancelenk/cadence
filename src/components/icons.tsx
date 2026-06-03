import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function split(p: IconProps): { s: number; cn: string; sw: number; rest: SVGProps<SVGSVGElement> } {
  const { size = 18, className, strokeWidth = 2, ...rest } = p;
  return { s: size, cn: `ui-ic ${className ?? ''}`.trim(), sw: Number(strokeWidth), rest };
}

export function IcPlus(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M12 5v14M5 12h14" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IcTrash(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IcPencil(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IcCheck(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M20 6L9 17l-5-5" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcCalendar(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={sw} />
      <path d="M16 2v4M8 2v4M3 10h18" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IcClock(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <circle cx="12" cy="12" r="9" strokeWidth={sw} />
      <path d="M12 7v5l3 2" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcX(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M18 6L6 18M6 6l12 12" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IcLogIn(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcLogOut(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcUser(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IcSettings(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <circle cx="12" cy="12" r="3" strokeWidth={sw} />
      <path
        d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IcSun(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <circle cx="12" cy="12" r="4" strokeWidth={sw} />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IcMoon(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcMenu(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M4 6h16M4 12h16M4 18h16" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IcLock(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <rect x="3" y="11" width="18" height="11" rx="2" strokeWidth={sw} />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IcUnlock(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <rect x="3" y="11" width="18" height="11" rx="2" strokeWidth={sw} />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IcLockOff(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <rect x="3" y="11" width="18" height="11" rx="2" strokeWidth={sw} />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeWidth={sw} strokeLinecap="round" />
      <path d="M3 3l18 18" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IcKey(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <circle cx="8" cy="15" r="4" strokeWidth={sw} />
      <path d="M10.85 12.15L21 2M15 6l3 3M19 4l3 3" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcEye(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" strokeWidth={sw} strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" strokeWidth={sw} />
    </svg>
  );
}

export function IcEyeOff(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.6 19.6 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.6 19.6 0 0 1-2.16 3.19M14.12 14.12A3 3 0 1 1 9.88 9.88M1 1l22 22"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IcMoreVertical(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <circle cx="12" cy="5" r="1.4" strokeWidth={sw} />
      <circle cx="12" cy="12" r="1.4" strokeWidth={sw} />
      <circle cx="12" cy="19" r="1.4" strokeWidth={sw} />
    </svg>
  );
}

export function IcSearch(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <circle cx="11" cy="11" r="7" strokeWidth={sw} />
      <path d="M21 21l-4.3-4.3" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IcListTodo(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 12l2 2 4-4"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IcBraces(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IcFileText(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcFolder(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcHome(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M3 10.5L12 3l9 7.5M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcChevronRight(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M9 6l6 6-6 6" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcChevronDown(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M6 9l6 6 6-6" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcSave(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IcCopy(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth={sw} />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IcQuotes(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M7.5 15.5H5a3.5 3.5 0 0 1 0-7h.5M16.5 15.5H14a3.5 3.5 0 0 1 0-7h.5"
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IcRowsCompact(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M4 8h16M4 12h16M4 16h16" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IcDownload(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcUpload(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcUsers(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IcLayoutGrid(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <rect x="3" y="3" width="7" height="9" rx="1" strokeWidth={sw} />
      <rect x="14" y="3" width="7" height="5" rx="1" strokeWidth={sw} />
      <rect x="14" y="12" width="7" height="9" rx="1" strokeWidth={sw} />
      <rect x="3" y="16" width="7" height="5" rx="1" strokeWidth={sw} />
    </svg>
  );
}

export function IcTarget(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <circle cx="12" cy="12" r="10" strokeWidth={sw} />
      <circle cx="12" cy="12" r="6" strokeWidth={sw} />
      <circle cx="12" cy="12" r="2" strokeWidth={sw} />
    </svg>
  );
}

export function IcArrowRight(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M5 12h14M13 6l6 6-6 6" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcArrowLeft(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M19 12H5M11 18l-6-6 6-6" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcArrowUp(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M12 19V5M6 11l6-6 6 6" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcSliders(p: IconProps) {
  // Three horizontal sliders with offset knobs — the canonical "filters"
  // glyph (matches lucide / feather). Used to label compact filter
  // toggles on dense toolbars where a text label would crowd the row.
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="6" r="2" strokeWidth={sw} />
      <circle cx="8" cy="12" r="2" strokeWidth={sw} />
      <circle cx="18" cy="18" r="2" strokeWidth={sw} />
    </svg>
  );
}

export function IcChevronLeft(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M15 18l-6-6 6-6" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcBell(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2.5 6.5H3.5C4.5 13.5 6 12 6 8Z"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path d="M10 19a2 2 0 0 0 4 0" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}


export function IcStar(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6L12 2z"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IcUndo(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M3 7v6h6M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcRefresh(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcGrip(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <circle cx="9" cy="6" r="1.4" strokeWidth={sw} />
      <circle cx="15" cy="6" r="1.4" strokeWidth={sw} />
      <circle cx="9" cy="12" r="1.4" strokeWidth={sw} />
      <circle cx="15" cy="12" r="1.4" strokeWidth={sw} />
      <circle cx="9" cy="18" r="1.4" strokeWidth={sw} />
      <circle cx="15" cy="18" r="1.4" strokeWidth={sw} />
    </svg>
  );
}

export function IcAlertTriangle(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" strokeWidth={sw} strokeLinejoin="round" />
      <path d="M12 9v4" strokeWidth={sw} strokeLinecap="round" />
      <path d="M12 17h.01" strokeWidth={sw} strokeLinecap="round" />
    </svg>
  );
}

export function IcChartBar(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M4 21V10M10 21V4M16 21v-7M22 21H2" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IcWifi(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M2 8.5a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a6 6 0 0 1 7 0"
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IcSparkles(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path
        d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" strokeWidth={sw} strokeLinejoin="round" />
      <path d="M5 16l.6 1.6L7.2 18l-1.6.6L5 20l-.6-1.4L3 18l1.4-.4L5 16z" strokeWidth={sw} strokeLinejoin="round" />
    </svg>
  );
}

export function IcStickyNote(p: IconProps) {
  const { s, cn, sw, rest } = split(p);
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden className={cn} {...rest}>
      <path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10l4-4V5a2 2 0 0 0-2-2z" strokeWidth={sw} strokeLinejoin="round" />
      <path d="M15 21v-4a2 2 0 0 1 2-2h4" strokeWidth={sw} strokeLinejoin="round" />
    </svg>
  );
}
