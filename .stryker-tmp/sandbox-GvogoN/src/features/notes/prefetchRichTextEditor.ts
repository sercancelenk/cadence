/** Warm the RichTextEditor chunk before the user opens a note body. */
// @ts-nocheck

export function prefetchRichTextEditor() {
  void import('../../components/ui/RichTextEditor');
}
