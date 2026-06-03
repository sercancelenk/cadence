/** Warm the RichTextEditor chunk before the user opens a note body. */
export function prefetchRichTextEditor() {
  void import('../../components/ui/RichTextEditor');
}
