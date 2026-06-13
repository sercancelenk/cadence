import { useEffect, useMemo, useState } from 'react';
import { IcChevronLeft, IcChevronRight } from '../icons';
import {
  buildCalendarMonthGrid,
  calendarMonthLabel,
  calendarSameDay,
  calendarStartOfDay,
  CALENDAR_WEEKDAY_LABELS,
  formatCalendarRangeLabel,
  isDateInRange,
} from '../../lib/calendarGrid';

type Props = {
  start: Date;
  end: Date;
  onChange: (start: Date, end: Date) => void;
  className?: string;
};

export function DateRangePicker({ start, end, onChange, className }: Props) {
  const [viewMonth, setViewMonth] = useState(() => calendarStartOfDay(start));
  const [pendingStart, setPendingStart] = useState<Date | null>(null);

  const grid = useMemo(() => buildCalendarMonthGrid(viewMonth), [viewMonth]);
  const today = useMemo(() => calendarStartOfDay(new Date()), []);

  const rangeStart = calendarStartOfDay(start);
  const rangeEnd = calendarStartOfDay(end);

  useEffect(() => {
    setPendingStart(null);
    setViewMonth(calendarStartOfDay(start));
  }, [start, end]);

  function pickDay(day: Date) {
    const d = calendarStartOfDay(day);
    if (!pendingStart) {
      setPendingStart(d);
      return;
    }
    onChange(pendingStart, d);
    setPendingStart(null);
  }

  function shiftMonth(delta: number) {
    setViewMonth((m) => {
      const next = new Date(m);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  }

  const summary =
    pendingStart != null
      ? `${formatCalendarRangeLabel(pendingStart, pendingStart)} — pick end date`
      : formatCalendarRangeLabel(rangeStart, rangeEnd);

  return (
    <div className={`date-range-picker${className ? ` ${className}` : ''}`}>
      <div className="date-range-picker__head">
        <p className="date-range-picker__summary muted small">{summary}</p>
        <div className="date-range-picker__nav">
          <button
            type="button"
            className="date-range-picker__nav-btn"
            aria-label="Previous month"
            title="Previous month"
            onClick={() => shiftMonth(-1)}
          >
            <IcChevronLeft size={16} />
          </button>
          <span className="date-range-picker__month">{calendarMonthLabel(viewMonth)}</span>
          <button
            type="button"
            className="date-range-picker__nav-btn"
            aria-label="Next month"
            title="Next month"
            onClick={() => shiftMonth(1)}
          >
            <IcChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="date-range-picker__weekdays" aria-hidden>
        {CALENDAR_WEEKDAY_LABELS.map((label) => (
          <span key={label} className="date-range-picker__weekday">
            {label}
          </span>
        ))}
      </div>

      <div className="date-range-picker__grid" role="grid" aria-label="Select date range">
        {grid.map(({ date, inMonth }) => {
          const inRange =
            pendingStart == null
              ? isDateInRange(date, rangeStart, rangeEnd)
              : calendarSameDay(date, pendingStart);
          const isStart = pendingStart
            ? calendarSameDay(date, pendingStart)
            : calendarSameDay(date, rangeStart);
          const isEnd = pendingStart ? false : calendarSameDay(date, rangeEnd);
          const isToday = calendarSameDay(date, today);

          return (
            <button
              key={date.toISOString()}
              type="button"
              role="gridcell"
              className={[
                'date-range-picker__day',
                !inMonth ? 'date-range-picker__day--dim' : '',
                isToday ? 'date-range-picker__day--today' : '',
                inRange ? 'date-range-picker__day--in-range' : '',
                isStart ? 'date-range-picker__day--range-start' : '',
                isEnd ? 'date-range-picker__day--range-end' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={inRange}
              onClick={() => pickDay(date)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <p className="date-range-picker__hint muted small">
        Click a start date, then an end date. Range is inclusive.
      </p>
    </div>
  );
}
