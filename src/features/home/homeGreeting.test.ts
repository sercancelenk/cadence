import { describe, expect, it } from 'vitest';
import { homeGreeting } from './homeGreeting';

describe('homeGreeting', () => {
  it('returns Good morning before noon', () => {
    expect(homeGreeting(new Date('2026-06-03T08:00:00'))).toBe('Good morning');
    expect(homeGreeting(new Date('2026-06-03T11:59:00'))).toBe('Good morning');
  });

  it('returns Good afternoon from noon until 17:00', () => {
    expect(homeGreeting(new Date('2026-06-03T12:00:00'))).toBe('Good afternoon');
    expect(homeGreeting(new Date('2026-06-03T16:59:00'))).toBe('Good afternoon');
  });

  it('returns Good evening from 17:00 onward', () => {
    expect(homeGreeting(new Date('2026-06-03T17:00:00'))).toBe('Good evening');
    expect(homeGreeting(new Date('2026-06-03T23:00:00'))).toBe('Good evening');
  });
});
