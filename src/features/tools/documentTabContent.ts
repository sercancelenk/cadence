import { utilityDocumentHasContent, type UtilityDocumentTab } from '../../core/model';

/**
 * Whether a Document tab holds anything worth guarding against an accidental
 * close. A tab that only holds an image or a table counts: no text, but not blank.
 */
export function documentTabHasContent(tab: Pick<UtilityDocumentTab, 'body' | 'bodyFormat' | 'bodyPlainText'>): boolean {
  return utilityDocumentHasContent(tab);
}
