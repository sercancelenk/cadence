/** Pure helpers for Utilities → ERD / Sketch saved-doc library UI (no AppData writes). */

export type UtilityLibrarySort = 'updated' | 'title';

export type UtilityLibraryListItem = {
  id: string;
  title: string;
  updatedAt: string;
};

export function utilityLibraryOpenStorageKey(libraryId: string): string {
  return `cadence.utilityLibrary.open.${libraryId}`;
}

/** Default: collapsed when there is at least one doc (canvas first); open when empty. */
export function defaultUtilityLibraryOpen(docCount: number): boolean {
  return docCount === 0;
}

export function readUtilityLibraryOpen(
  libraryId: string,
  docCount: number,
): boolean {
  try {
    const raw = localStorage.getItem(utilityLibraryOpenStorageKey(libraryId));
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    /* private mode / quota */
  }
  return defaultUtilityLibraryOpen(docCount);
}

export function writeUtilityLibraryOpen(libraryId: string, open: boolean): void {
  try {
    localStorage.setItem(utilityLibraryOpenStorageKey(libraryId), open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function parseUtilityLibrarySort(raw: string): UtilityLibrarySort {
  return raw === 'title' ? 'title' : 'updated';
}

export function filterUtilityLibraryDocs(
  docs: UtilityLibraryListItem[],
  query: string,
): UtilityLibraryListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter((d) => d.title.toLowerCase().includes(q));
}

export function sortUtilityLibraryDocs(
  docs: UtilityLibraryListItem[],
  sort: UtilityLibrarySort,
): UtilityLibraryListItem[] {
  const next = [...docs];
  const byTitle = (a: string, b: string) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' });
  if (sort === 'title') {
    next.sort((a, b) => byTitle(a.title, b.title) || b.updatedAt.localeCompare(a.updatedAt));
    return next;
  }
  next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || byTitle(a.title, b.title));
  return next;
}

export function prepareUtilityLibraryDocs(
  docs: UtilityLibraryListItem[],
  query: string,
  sort: UtilityLibrarySort,
): UtilityLibraryListItem[] {
  return sortUtilityLibraryDocs(filterUtilityLibraryDocs(docs, query), sort);
}
