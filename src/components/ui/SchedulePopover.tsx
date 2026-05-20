import { RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IcBell, IcCalendar, IcChevronLeft, IcChevronRight, IcClock, IcX } from '../icons';
import type { ReminderRepeat } from '../../model';

export type { ReminderRepeat };

export type SchedulePatch = {
  /** `null` clears, `undefined` leaves untouched. */
  dueAt?: string | null;
  remindAt?: string | null;
  remindRepeat?: ReminderRepeat | null;
};

type Props = {
  dueAt?: string;
  remindAt?: string;
  remindRepeat?: ReminderRepeat;
  /**
   * Called once for each user-driven mutation. Callers can patch the
   * model granularly — we avoid bundling state into a "commit on close"
   * flow because the surrounding context already debounces writes.
   */
  onPatch: (patch: SchedulePatch) => void;
  onClose: () => void;
  /**
   * Optional label rendered on the "primary" action button at the bottom.
   * Default: "Done".
   */
  doneLabel?: string;
  /**
   * Element the popover is anchored to (typically the trigger button).
   * Used for two things:
   *   1) Outside-click detection ignores this element so re-clicking the
   *      trigger toggles the popover cleanly (without "close then immediate
   *      reopen" flicker caused by the trigger's own onClick).
   *   2) Placement: if the popover would extend past the viewport bottom
   *      we flip it above the anchor instead.
   */
  anchorRef?: RefObject<HTMLElement | null>;
};

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const REPEAT_OPTIONS: { value: ReminderRepeat | ''; label: string }[] = [
  { value: '', label: "Don't repeat" },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function isoFromDateAndTime(date: Date, hhmm: string): string {
  // hhmm = "HH:MM". Build a Date in *local* time to match user expectation
  // ("9am" should be 9am where they live, not UTC) and then serialize to
  // ISO for storage. This is the same pattern `fromLocalDatetimeValue`
  // uses elsewhere in the codebase.
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10) || 0);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function timeOf(iso?: string): string {
  if (!iso) return '09:00';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '09:00';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * Build a 6×7 grid of dates anchored to the first Monday on/before the
 * 1st of `viewMonth`. We always emit 42 cells so the popover doesn't
 * jump in height when months span 4, 5, or 6 weeks. Leading / trailing
 * days from neighbour months are rendered dim.
 */
function buildMonthGrid(viewMonth: Date): { date: Date; inMonth: boolean }[] {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  // JS Date.getDay() returns 0=Sun..6=Sat. We want Monday-first, so map
  // to 0=Mon..6=Sun.
  const dow = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - dow);
  const out: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({ date: d, inMonth: d.getMonth() === viewMonth.getMonth() });
  }
  return out;
}

/**
 * Mini calendar + time + quick-preset + reminder controls. Rendered
 * inside an absolutely-positioned popover by the caller — this
 * component only owns the layout / interaction; the caller decides
 * positioning, escape-on-outside-click, etc.
 */
export function SchedulePopover({
  dueAt,
  remindAt,
  remindRepeat,
  onPatch,
  onClose,
  doneLabel = 'Done',
  anchorRef,
}: Props) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const initialSelected = useMemo(() => {
    if (dueAt) {
      const d = new Date(dueAt);
      if (!Number.isNaN(d.getTime())) return startOfDay(d);
    }
    return today;
  }, [dueAt, today]);

  const [selectedDate, setSelectedDate] = useState<Date>(initialSelected);
  const [viewMonth, setViewMonth] = useState<Date>(
    () => new Date(initialSelected.getFullYear(), initialSelected.getMonth(), 1),
  );
  const [time, setTime] = useState<string>(() => timeOf(dueAt));
  const [reminderOn, setReminderOn] = useState<boolean>(!!remindAt);
  const [repeat, setRepeat] = useState<ReminderRepeat | ''>(remindRepeat || '');
  const [placement, setPlacement] = useState<'below' | 'above'>('below');

  const rootRef = useRef<HTMLDivElement | null>(null);
  // Latest `onClose` mirrored into a ref so the global listeners can stay
  // mounted across renders without re-installing every time the parent
  // re-renders with a fresh inline callback. (Avoids effect churn that
  // could subtly break the "wait one tick" guard below.)
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Close on outside click + Escape — the only two ways to dismiss the
  // popover so the user's intent stays obvious. `anchorRef` lets the
  // trigger element re-toggle the popover without our outside-click
  // immediately closing it first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!rootRef.current || !t) return;
      if (rootRef.current.contains(t)) return;
      if (anchorRef?.current && anchorRef.current.contains(t)) return;
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    // Wait one tick so the click that *opened* the popover doesn't
    // immediately close it.
    const id = window.setTimeout(() => {
      window.addEventListener('pointerdown', onDown);
    }, 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.clearTimeout(id);
    };
    // Intentionally an empty dep array: we never want to reinstall these
    // listeners just because the parent re-renders. `anchorRef` is a
    // stable ref object across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Placement: measure once on mount and flip above the trigger if the
  // popover would otherwise extend below the viewport. We re-run on
  // window resize so rotating the device on iOS recovers gracefully.
  useLayoutEffect(() => {
    const compute = () => {
      const el = rootRef.current;
      if (!el) return;
      // Reset to "below" before measuring so we get the natural rect.
      el.setAttribute('data-placement', 'below');
      const rect = el.getBoundingClientRect();
      const margin = 12;
      if (rect.bottom > window.innerHeight - margin) {
        // Only flip if there is room above — otherwise stay below and
        // let the popover's own max-height + internal scrolling save us.
        const triggerRect = anchorRef?.current?.getBoundingClientRect();
        if (!triggerRect || triggerRect.top - rect.height - margin >= margin) {
          setPlacement('above');
          return;
        }
      }
      setPlacement('below');
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [anchorRef]);

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  /**
   * Commit (date, time) to BOTH `dueAt` and, when the reminder toggle is
   * on, `remindAt`. Used by every interactive path in the popover (day
   * cell, time input, chips). Keeping the commit logic in one place
   * avoids the "this UI lane forgot to mirror to remindAt" drift that
   * an earlier implementation had.
   */
  const commitDateTime = (date: Date, hhmm: string) => {
    const iso = isoFromDateAndTime(date, hhmm);
    const patch: SchedulePatch = { dueAt: iso };
    if (reminderOn) patch.remindAt = iso;
    onPatch(patch);
  };

  const commitDate = (date: Date) => {
    setSelectedDate(date);
    commitDateTime(date, time);
  };

  const handleTimeChange = (hhmm: string) => {
    setTime(hhmm);
    // Commit immediately on every time change. `selectedDate` is always
    // populated (defaults to today on mount), so we never produce a
    // nonsensical timestamp.
    commitDateTime(selectedDate, hhmm);
  };

  const toggleReminder = () => {
    const next = !reminderOn;
    setReminderOn(next);
    if (next) {
      const iso = dueAt || isoFromDateAndTime(selectedDate, time);
      // Coupling: when the user turns reminders on without a deadline,
      // we default `dueAt` to the same slot. The popover UI doesn't
      // expose a way to set them independently, so this matches the
      // visual model the user sees (one date + one time → one ping).
      onPatch({ remindAt: iso, dueAt: dueAt ? undefined : iso });
    } else {
      onPatch({ remindAt: null, remindRepeat: null });
      setRepeat('');
    }
  };

  const handleRepeatChange = (next: ReminderRepeat | '') => {
    setRepeat(next);
    onPatch({ remindRepeat: next || null });
  };

  const goPrevMonth = () =>
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const goNextMonth = () =>
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const clearAll = () => {
    onPatch({ dueAt: null, remindAt: null, remindRepeat: null });
    setReminderOn(false);
    setRepeat('');
  };

  // Quick presets work off "now" rather than the currently selected date,
  // which matches user intuition: "Today 5pm" jumps to today regardless
  // of which month you happen to be browsing.
  const quickPresets: { key: string; label: string; getDate: () => Date }[] = [
    {
      key: 'today',
      label: 'Today 5pm',
      getDate: () => {
        const d = new Date();
        d.setHours(17, 0, 0, 0);
        return d;
      },
    },
    {
      key: 'tomorrow',
      label: 'Tomorrow 9am',
      getDate: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
    {
      key: 'in-3h',
      label: '+3h',
      getDate: () => {
        const d = new Date();
        d.setMinutes(0, 0, 0);
        d.setHours(d.getHours() + 3);
        return d;
      },
    },
    {
      key: 'next-mon',
      label: 'Mon 9am',
      getDate: () => {
        const d = new Date();
        const day = d.getDay();
        const offset = ((1 + 7 - day) % 7) || 7;
        d.setDate(d.getDate() + offset);
        d.setHours(9, 0, 0, 0);
        return d;
      },
    },
  ];

  const applyPreset = (when: Date) => {
    const day = startOfDay(when);
    const hhmm = `${pad2(when.getHours())}:${pad2(when.getMinutes())}`;
    setSelectedDate(day);
    setViewMonth(new Date(when.getFullYear(), when.getMonth(), 1));
    setTime(hhmm);
    commitDateTime(day, hhmm);
  };

  return (
    <div
      ref={rootRef}
      className="sched-pop"
      role="dialog"
      aria-label="Schedule"
      data-placement={placement}
    >
      <div className="sched-pop__header">
        <button
          type="button"
          className="sched-pop__nav"
          onClick={goPrevMonth}
          aria-label="Previous month"
          title="Previous month"
        >
          <IcChevronLeft size={16} />
        </button>
        <div className="sched-pop__month">{monthLabel(viewMonth)}</div>
        <button
          type="button"
          className="sched-pop__nav"
          onClick={goNextMonth}
          aria-label="Next month"
          title="Next month"
        >
          <IcChevronRight size={16} />
        </button>
        <button
          type="button"
          className="sched-pop__close"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <IcX size={14} />
        </button>
      </div>

      <div className="sched-pop__weekdays">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="sched-pop__weekday">
            {w}
          </div>
        ))}
      </div>

      <div className="sched-pop__grid">
        {grid.map(({ date, inMonth }, i) => {
          const isToday = sameDay(date, today);
          const isSelected = sameDay(date, selectedDate);
          const cls = [
            'sched-pop__day',
            inMonth ? '' : 'sched-pop__day--dim',
            isToday ? 'sched-pop__day--today' : '',
            isSelected ? 'sched-pop__day--selected' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={i}
              type="button"
              className={cls}
              onClick={() => commitDate(date)}
              aria-label={date.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="sched-pop__time-row">
        <span className="sched-pop__time-ic" aria-hidden>
          <IcClock size={14} />
        </span>
        <input
          type="time"
          className="sched-pop__time-input"
          value={time}
          onChange={(e) => handleTimeChange(e.target.value)}
          aria-label="Time"
        />
        <div className="sched-pop__time-chips" role="group" aria-label="Quick time">
          {['09:00', '12:00', '17:00'].map((t) => (
            <button
              key={t}
              type="button"
              className={`sched-pop__chip${time === t ? ' sched-pop__chip--active' : ''}`}
              onClick={() => handleTimeChange(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="sched-pop__presets" role="group" aria-label="Quick presets">
        {quickPresets.map((p) => (
          <button
            key={p.key}
            type="button"
            className="sched-pop__preset"
            onClick={() => applyPreset(p.getDate())}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="sched-pop__reminder">
        <button
          type="button"
          className={`sched-pop__remind-toggle${reminderOn ? ' sched-pop__remind-toggle--on' : ''}`}
          onClick={toggleReminder}
          aria-pressed={reminderOn}
        >
          <IcBell size={14} />
          <span>{reminderOn ? 'Remind me' : 'Set reminder'}</span>
        </button>
        {reminderOn ? (
          <label className="sched-pop__repeat">
            <span className="muted small">Repeat</span>
            <select
              className="select select--compact"
              value={repeat}
              onChange={(e) => handleRepeatChange(e.target.value as ReminderRepeat | '')}
            >
              {REPEAT_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="sched-pop__footer">
        {dueAt || remindAt ? (
          <button type="button" className="sched-pop__clear" onClick={clearAll}>
            Clear
          </button>
        ) : (
          <span />
        )}
        <div className="sched-pop__footer-meta">
          {dueAt ? (
            <span className="muted small">
              <IcCalendar size={12} />{' '}
              {new Date(dueAt).toLocaleString(undefined, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          ) : (
            <span className="muted small">Pick a date</span>
          )}
        </div>
        <button type="button" className="btn btn--primary btn--compact" onClick={onClose}>
          {doneLabel}
        </button>
      </div>
    </div>
  );
}
