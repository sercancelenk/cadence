import type { SchedulePatch } from '../../components/ui/SchedulePopover';
import type { Item } from '../../core/model';

/**
 * Bridge from SchedulePopover's tri-state patch (`undefined` = untouched,
 * `null` = clear, string = set) to `updateItem`'s shape, which treats
 * falsy / undefined as clear once the key is present.
 */
export function schedulePatchToItemPatch(
  patch: SchedulePatch,
): Partial<Pick<Item, 'dueAt' | 'remindAt' | 'remindRepeat'>> {
  const out: Partial<Pick<Item, 'dueAt' | 'remindAt' | 'remindRepeat'>> = {};
  if (patch.dueAt !== undefined) out.dueAt = patch.dueAt ?? undefined;
  if (patch.remindAt !== undefined) out.remindAt = patch.remindAt ?? undefined;
  if (patch.remindRepeat !== undefined) out.remindRepeat = patch.remindRepeat ?? undefined;
  return out;
}
