// @ts-nocheck
import type { TeamStatus } from '../model';

const labels: Record<TeamStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
};

export function teamStatusLabel(s: TeamStatus | undefined): string {
  return labels[s ?? 'active'] ?? labels.active;
}

export const TEAM_STATUS_OPTIONS: { value: TeamStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
];
