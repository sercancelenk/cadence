// @ts-nocheck
import { describe, expect, it } from 'vitest';
import {
  PATH_AGENDA,
  PATH_HOME,
  PATH_LOGIN,
  PATH_NOTES,
  PATH_PROFILE,
  PATH_REGISTER,
  PATH_SETTINGS,
  PATH_TEAMS,
  PATH_TODOS,
  PATH_UTILITIES_DOCUMENT,
  PATH_UTILITIES_STRUCTURED,
} from './routes';

describe('protected route constants', () => {
  const paths = {
    PATH_HOME,
    PATH_TEAMS,
    PATH_TODOS,
    PATH_AGENDA,
    PATH_NOTES,
    PATH_UTILITIES_DOCUMENT,
    PATH_UTILITIES_STRUCTURED,
    PATH_PROFILE,
    PATH_SETTINGS,
    PATH_LOGIN,
    PATH_REGISTER,
  };

  it('defines expected path strings', () => {
    expect(PATH_HOME).toBe('/');
    expect(PATH_TEAMS).toBe('/teams');
    expect(PATH_TODOS).toBe('/todos');
    expect(PATH_AGENDA).toBe('/agenda');
    expect(PATH_NOTES).toBe('/notes');
    expect(PATH_UTILITIES_DOCUMENT).toBe('/utilities/document');
    expect(PATH_UTILITIES_STRUCTURED).toBe('/utilities/structured');
    expect(PATH_PROFILE).toBe('/profile');
    expect(PATH_SETTINGS).toBe('/settings');
    expect(PATH_LOGIN).toBe('/login');
    expect(PATH_REGISTER).toBe('/register');
  });

  it('uses unique paths for navigation', () => {
    const values = Object.values(paths);
    expect(new Set(values).size).toBe(values.length);
  });

  it('uses leading slashes for app routes', () => {
    for (const p of Object.values(paths)) {
      expect(p.startsWith('/')).toBe(true);
    }
  });
});
