import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AI_PROVIDER_OPTIONS } from '../../model';
import { AI_LIMITS, PROVIDER_INFO } from '../../lib/aiPresets';
import { AiProviderInfo } from './AiProviderInfo';

describe('AiProviderInfo', () => {
  afterEach(cleanup);

  it('says AI is off and shows no limits when no provider is chosen', () => {
    render(<AiProviderInfo provider="" />);
    expect(screen.getByRole('complementary', { name: 'About AI is off' })).toBeTruthy();
    expect(screen.getByText(/nothing is ever sent anywhere/i)).toBeTruthy();
    expect(screen.queryByText('Limits')).toBeNull();
  });

  it.each(AI_PROVIDER_OPTIONS.map((o) => o.value))('describes %s: address, format, auth, limits', (provider) => {
    render(<AiProviderInfo provider={provider} />);
    const box = screen.getByRole('complementary', { name: `About ${PROVIDER_INFO[provider].title}` });
    for (const label of ['API format', 'Authentication', 'Sent']) {
      expect(within(box).getByText(label)).toBeTruthy();
    }
    expect(within(box).getByText('Limits')).toBeTruthy();
    for (const limit of AI_LIMITS) expect(within(box).getByText(limit)).toBeTruthy();
  });

  it('every provider the app offers has help text', () => {
    for (const o of AI_PROVIDER_OPTIONS) expect(PROVIDER_INFO[o.value]).toBeDefined();
  });

  it('the custom gateway box explains the placeholders and templates', () => {
    render(<AiProviderInfo provider="gateway" />);
    expect(screen.getByText(/\{model\} and \{apiKey\}/)).toBeTruthy();
    expect(screen.getByText(/Start from the template for the API format/)).toBeTruthy();
  });
});
