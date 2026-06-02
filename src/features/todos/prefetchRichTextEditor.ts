/** Warm the Todos rich-text chunk before the user opens an editor surface. */
export function prefetchRichTextEditor() {
  void import('../../components/ui/RichTextEditor');
}
