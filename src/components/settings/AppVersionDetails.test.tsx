import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppVersionDetails } from './AppVersionDetails';

afterEach(cleanup);

describe('AppVersionDetails', () => {
  it('shows a stable release without any testing note', () => {
    render(<AppVersionDetails appVersion="2026.10.150" schemaVersion={3} />);
    expect(screen.getByText('October 2026')).toBeTruthy();
    expect(screen.getByText(/Version 2026\.10\.150/)).toBeTruthy();
    expect(screen.queryByText(/for testing/)).toBeNull();
  });

  it('tells a beta tester that this is a beta and what updates it will be offered', () => {
    render(<AppVersionDetails appVersion="2026.10.150-beta.1" schemaVersion={3} />);
    expect(screen.getByText('October 2026 (beta)')).toBeTruthy();
    expect(screen.getByText(/for testing/).textContent).toMatch(/next beta build and the next stable release/);
    expect(screen.getByText(/for testing/).textContent).toMatch(/Export a backup/);
  });

  it('copes with a development version', () => {
    render(<AppVersionDetails appVersion="0.2.0" schemaVersion={3} />);
    expect(screen.getByText('v0.2.0')).toBeTruthy();
    expect(screen.queryByText(/for testing/)).toBeNull();
  });
});
