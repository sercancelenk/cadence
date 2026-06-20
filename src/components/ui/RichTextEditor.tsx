import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { SYNC_BEFORE_APPLY } from '../../lib/syncApplyGuard';
import { registerBeforeFlushHook } from '../../lib/pendingSaveFlush';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import type { RichTextBodyFormat, RichTextDoc, RichTextPayload } from '../../lib/richText';
import {
  isRichTextOverSoftLimit,
  RICH_TEXT_HARD_CHAR_LIMIT,
  RICH_TEXT_SOFT_CHAR_LIMIT,
} from '../../lib/richText';
import { canonicalDocSignature } from '../../lib/richTextBody';
import { createRichTextExtensions, isSafeEditorLinkUrl } from '../../lib/richTextEditorExtensions';
import {
  attachmentUri,
  parseAttachmentId,
  type RichTextAttachmentScope,
} from '../../lib/richTextAttachmentUri';
import {
  dataTransferHasImageFiles,
  electronAttachmentsAvailable,
  pickImageFile,
  readDataTransferImageFile,
  releaseAttachmentBlobUrls,
  resolveAttachmentDisplayUrl,
  storeRichTextImage,
} from '../../lib/richTextAttachmentStore';
import {
  fetchRichTextAttachmentUserId,
  primeRichTextAttachmentUserId,
} from '../../lib/richTextAttachmentUser';
import { collectAttachmentIds } from '../../lib/richTextDocAttachments';
import { normalizeDocAttachmentsForStorage } from '../../lib/richTextDocAttachments';
import { formatDateChipLabel, todayIsoDate } from '../../lib/richTextDateChip';
import {
  findRichTextEditorImage,
  resolveRichTextImageLightboxSrc,
} from '../../lib/richTextImageLightbox';
import { resolveRichTextContent } from '../../lib/richTextImport';
import { insertMarkdownPaste, shouldPasteClipboardAsMarkdown } from '../../lib/richTextPaste';
import { RichTextImageLightbox } from './RichTextImageLightbox';
import { Tooltip } from './Tooltip';

/** Coalesce parent updates — editor stays instant; persist layer debounces again. */
const DEFAULT_ON_CHANGE_DEBOUNCE_MS = 120;

export type RichTextEditorProps = {
  value?: RichTextDoc | string | null;
  valueFormat?: RichTextBodyFormat | 'auto';
  onChange?: (payload: RichTextPayload) => void;
  onBlur?: () => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  toolbar?: boolean;
  minHeight?: number;
  /** Debounce `onChange` (ms). Default 120. Set 0 to fire synchronously. */
  onChangeDebounceMs?: number;
  /** Show a banner when the document exceeds {@link RICH_TEXT_SOFT_CHAR_LIMIT}. Default true. */
  showSizeWarning?: boolean;
  /** Optional hook for insert errors (oversized image, etc.). */
  onEditorNotice?: (message: string) => void;
  /** Scope for sidecar image files (note/todo id). Required for paste/upload. */
  attachmentScope?: RichTextAttachmentScope;
  /** Signed-in user id — scopes attachments on disk / IndexedDB. */
  attachmentUserId?: string;
  /** When true, toolbar stays visible while scrolling the surrounding pane. */
  stickyToolbar?: boolean;
  /** When set, the toolbar renders into this element (e.g. sticky chrome above the editor). */
  toolbarMountEl?: HTMLElement | null;
  /** Called when the user presses Escape while editing (e.g. switch to preview). */
  onRequestPreview?: () => void;
  /** Fired when local edits are pending vs flushed to `onChange`. */
  onSaveStateChange?: (state: 'idle' | 'pending' | 'saved') => void;
  /** Focus the editor once when it becomes editable (e.g. new note in edit mode). */
  autoFocus?: boolean;
  onAutoFocusHandled?: () => void;
};

function contentKey(
  value: RichTextDoc | string | null | undefined,
  valueFormat: RichTextBodyFormat | 'auto',
): string {
  const formatArg = valueFormat === 'auto' ? undefined : valueFormat;
  // Signature only — `bodyFormat` can flip (auto → prosemirror) before the
  // parent body string catches up; a format-prefixed key would run setContent
  // with stale empty props and reset the caret on the first keystroke.
  return canonicalDocSignature(value, formatArg);
}

function docSignatureFromEditor(ed: Editor): string {
  return canonicalDocSignature(ed.getJSON() as RichTextDoc, 'prosemirror');
}

function payloadFromEditor(ed: Editor): RichTextPayload {
  return {
    doc: normalizeDocAttachmentsForStorage(ed.getJSON() as RichTextDoc),
    plainText: ed.getText(),
  };
}

const HYDRATION_TX_META = 'cadenceHydration';

type ImageLightboxState = {
  src: string;
  alt: string;
  loading: boolean;
};

/**
 * Replace document from props without moving the caret unless the structure
 * makes the previous selection invalid (never force end-of-doc).
 */
function setExternalContentPreservingSelection(editor: Editor, content: RichTextDoc): void {
  const { from, to, empty } = editor.state.selection;
  const hadFocus = editor.view.hasFocus();

  editor.commands.setContent(content, false);

  if (!hadFocus) return;

  const docSize = editor.state.doc.content.size;
  const safeFrom = Math.max(0, Math.min(from, docSize));
  const safeTo = Math.max(0, Math.min(to, docSize));

  try {
    editor.commands.setTextSelection(
      empty ? { from: safeFrom, to: safeFrom } : { from: safeFrom, to: safeTo },
    );
    editor.view.focus();
  } catch {
    // Structural mismatch — leave ProseMirror default; do not jump to end.
  }
}

async function hydrateAttachmentImages(editor: Editor, userId: string): Promise<void> {
  const pendingIds = new Set<string>();
  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'image') return;
    const src = String(node.attrs.src ?? '');
    const id = (node.attrs.attachmentId as string) || parseAttachmentId(src);
    if (id) pendingIds.add(id);
  });
  if (!pendingIds.size) return;

  const displayById = new Map<string, string>();
  await Promise.all(
    [...pendingIds].map(async (id) => {
      const displayUrl = await resolveAttachmentDisplayUrl(attachmentUri(id), userId);
      if (!displayUrl.startsWith('blob:')) return;
      displayById.set(id, displayUrl);
    }),
  );
  if (!displayById.size) return;

  let tr = editor.state.tr;
  let changed = false;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image') return;
    const src = String(node.attrs.src ?? '');
    const id = (node.attrs.attachmentId as string) || parseAttachmentId(src);
    if (!id) return;
    const displayUrl = displayById.get(id);
    if (!displayUrl || displayUrl === src) return;
    tr = tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      src: displayUrl,
      attachmentId: id,
    });
    changed = true;
  });

  if (changed) {
    tr.setMeta('addToHistory', false);
    tr.setMeta(HYDRATION_TX_META, true);
    editor.view.dispatch(tr);
  }
}

/**
 * Reusable Cadence rich-text editor (Tiptap / ProseMirror).
 * Legacy markdown in → ProseMirror JSON out. Never persists HTML.
 *
 * Caret policy: the selection never moves unless the user moves it (click,
 * arrow keys, toolbar on a selection, paste, etc.). Autosave echoes and
 * attachment hydration must not call setContent or focus when content is
 * already equivalent; external setContent restores the prior selection when
 * possible and never jumps to end-of-document on failure.
 */
export function RichTextEditor({
  value,
  valueFormat = 'auto',
  onChange,
  onBlur,
  placeholder = 'Write here…',
  editable = true,
  className = '',
  toolbar = true,
  minHeight = 280,
  onChangeDebounceMs = DEFAULT_ON_CHANGE_DEBOUNCE_MS,
  showSizeWarning = true,
  onEditorNotice,
  attachmentScope,
  attachmentUserId,
  stickyToolbar = false,
  toolbarMountEl = null,
  onRequestPreview,
  onSaveStateChange,
  autoFocus = false,
  onAutoFocusHandled,
}: RichTextEditorProps) {
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [imageLightbox, setImageLightbox] = useState<ImageLightboxState | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showEditorNotice = useCallback(
    (message: string) => {
      setEditorNotice(message);
      onEditorNotice?.(message);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setEditorNotice(null), 5000);
    },
    [onEditorNotice],
  );

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;
  const onRequestPreviewRef = useRef(onRequestPreview);
  onRequestPreviewRef.current = onRequestPreview;
  const onSaveStateChangeRef = useRef(onSaveStateChange);
  onSaveStateChangeRef.current = onSaveStateChange;
  const onAutoFocusHandledRef = useRef(onAutoFocusHandled);
  onAutoFocusHandledRef.current = onAutoFocusHandled;
  const autoFocusRef = useRef(autoFocus);
  autoFocusRef.current = autoFocus;
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const debounceMsRef = useRef(onChangeDebounceMs);
  debounceMsRef.current = onChangeDebounceMs;
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const attachmentScopeRef = useRef(attachmentScope);
  attachmentScopeRef.current = attachmentScope;
  const attachmentUserIdRef = useRef(attachmentUserId);
  attachmentUserIdRef.current = attachmentUserId;
  const showEditorNoticeRef = useRef(showEditorNotice);
  showEditorNoticeRef.current = showEditorNotice;
  const insertImageRef = useRef<(file: Blob | File, alt?: string) => Promise<void>>(async () => {});
  const attachmentIdsRef = useRef<Set<string>>(new Set());
  const imageLightboxOpenRef = useRef(false);
  const lightboxRequestRef = useRef(0);
  const closeImageLightboxRef = useRef<() => void>(() => {});
  /** Suppress duplicate parent writes when mount/hydration normalizes JSON without edits. */
  const lastEmittedSig = useRef<string | null>(null);

  const [charCount, setCharCount] = useState(0);

  const formatArg: RichTextBodyFormat | undefined =
    valueFormat === 'auto' ? undefined : valueFormat;

  const resolvedDoc = useMemo(
    () => resolveRichTextContent(value, formatArg),
    [value, formatArg],
  );

  const externalKey = contentKey(value, valueFormat);

  const extensions = useMemo(
    () => createRichTextExtensions(placeholder),
    [placeholder],
  );

  const syncBaselineFromEditor = useCallback((ed: Editor) => {
    lastEmittedSig.current = docSignatureFromEditor(ed);
    setCharCount(ed.getText().length);
  }, []);

  const tryAutoFocus = useCallback((ed: Editor) => {
    if (!autoFocusRef.current || !editableRef.current) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!autoFocusRef.current || !editableRef.current) return;
        const focused = ed.chain().focus('start').run();
        if (focused && ed.view.hasFocus()) {
          onAutoFocusHandledRef.current?.();
        }
      });
    });
  }, []);

  const flushChange = useCallback((ed: Editor) => {
    const payload = payloadFromEditor(ed);
    const sig = docSignatureFromEditor(ed);
    if (sig === lastEmittedSig.current) {
      onSaveStateChangeRef.current?.('idle');
      return;
    }
    lastEmittedSig.current = sig;
    onChangeRef.current?.(payload);
    onSaveStateChangeRef.current?.('saved');
    setCharCount(payload.plainText.length);
  }, []);

  const scheduleChange = useCallback(
    (ed: Editor) => {
      setCharCount(ed.getText().length);
      onSaveStateChangeRef.current?.('pending');
      const ms = debounceMsRef.current;
      if (ms <= 0) {
        flushChange(ed);
        return;
      }
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      pendingTimer.current = setTimeout(() => {
        pendingTimer.current = null;
        flushChange(ed);
      }, ms);
    },
    [flushChange],
  );

  const flushPending = useCallback(() => {
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    const ed = editorRef.current;
    if (ed) flushChange(ed);
  }, [flushChange]);

  useEffect(() => {
    return () => {
      flushPending();
      releaseAttachmentBlobUrls(attachmentIdsRef.current);
      attachmentIdsRef.current.clear();
    };
  }, [flushPending]);

  useEffect(() => {
    const onBeforeSync = () => flushPending();
    window.addEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
    return () => window.removeEventListener(SYNC_BEFORE_APPLY, onBeforeSync);
  }, [flushPending]);

  // Flush the debounced onChange buffer whenever a consumer drains pending
  // saves (version restore, "Save version", delete, pre-sync apply). Without
  // this the last <=120ms of typing could be missed by those code paths since
  // the editor stays mounted (so the unmount flush never fires). Runs in the
  // 'editor' phase so locked-note encryption (default phase) sees this content.
  useEffect(() => registerBeforeFlushHook(() => flushPending(), 'editor'), [flushPending]);

  const trackAttachmentId = useCallback((id: string) => {
    attachmentIdsRef.current.add(id);
  }, []);

  const insertImageFromFile = useCallback(async (file: Blob | File, alt?: string) => {
    const scope = attachmentScopeRef.current;
    const ed = editorRef.current;
    if (!scope) {
      showEditorNoticeRef.current('Open a note or task to attach images.');
      return;
    }
    if (!ed) return;
    const uid = await fetchRichTextAttachmentUserId(attachmentUserIdRef.current);
    attachmentUserIdRef.current = uid;
    if (electronAttachmentsAvailable() && uid === 'anonymous') {
      showEditorNoticeRef.current('Sign in to attach images in the desktop app.');
      return;
    }
    try {
      const stored = await storeRichTextImage(file, scope, uid, alt);
      trackAttachmentId(stored.attachmentId);
      let src = await resolveAttachmentDisplayUrl(stored.src, uid);
      if (!src.startsWith('blob:')) {
        showEditorNoticeRef.current(
          'Image saved but could not be displayed. Restart the app (⌘Q → npm run dev).',
        );
        return;
      }
      ed
        .chain()
        .focus()
        .insertContent({
          type: 'image',
          attrs: {
            src,
            attachmentId: stored.attachmentId,
            alt: stored.alt ?? null,
            width: stored.width ?? null,
            height: stored.height ?? null,
          },
        })
        .run();
    } catch (err) {
      showEditorNoticeRef.current(
        err instanceof Error ? err.message : 'Could not attach image.',
      );
    }
  }, [trackAttachmentId]);

  insertImageRef.current = insertImageFromFile;

  const closeImageLightbox = useCallback(() => {
    lightboxRequestRef.current += 1;
    setImageLightbox(null);
  }, []);
  closeImageLightboxRef.current = closeImageLightbox;

  useEffect(() => {
    imageLightboxOpenRef.current = imageLightbox !== null;
  }, [imageLightbox]);

  const openImageLightbox = useCallback(
    async (img: HTMLImageElement) => {
      const requestId = ++lightboxRequestRef.current;
      const alt = img.alt?.trim() || 'Image';
      setImageLightbox({ src: '', alt, loading: true });
      try {
        const src = await resolveRichTextImageLightboxSrc(img, attachmentUserIdRef.current);
        if (requestId !== lightboxRequestRef.current) return;
        if (!src) {
          setImageLightbox(null);
          showEditorNoticeRef.current('Could not open this image.');
          return;
        }
        setImageLightbox({ src, alt, loading: false });
      } catch {
        if (requestId !== lightboxRequestRef.current) return;
        setImageLightbox(null);
        showEditorNoticeRef.current('Could not open this image.');
      }
    },
    [],
  );

  const handleEditorImageClick = useCallback(
    (event: MouseEvent) => {
      if (editableRef.current) return;
      const img = findRichTextEditorImage(event.target);
      if (!img) return;
      event.preventDefault();
      event.stopPropagation();
      void openImageLightbox(img);
    },
    [openImageLightbox],
  );

  const handleEditorImageDoubleClick = useCallback(
    (event: MouseEvent) => {
      if (!editableRef.current) return;
      const img = findRichTextEditorImage(event.target);
      if (!img) return;
      event.preventDefault();
      event.stopPropagation();
      void openImageLightbox(img);
    },
    [openImageLightbox],
  );

  const hydrateAndTrack = useCallback(async (ed: Editor, userId: string) => {
    await hydrateAttachmentImages(ed, userId);
    for (const id of collectAttachmentIds(ed.getJSON() as RichTextDoc)) {
      attachmentIdsRef.current.add(id);
    }
  }, []);

  const editor = useEditor({
    extensions,
    content: resolvedDoc,
    editable,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: 'rich-editor__prose',
        spellcheck: 'true',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape' && imageLightboxOpenRef.current) {
          event.preventDefault();
          closeImageLightboxRef.current();
          return true;
        }
        if (event.key === 'Escape' && editableRef.current && onRequestPreviewRef.current) {
          event.preventDefault();
          onRequestPreviewRef.current();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        if (!editableRef.current) return false;
        const clipboard = event.clipboardData;
        if (!clipboard) return false;

        if (attachmentScopeRef.current) {
          const file = readDataTransferImageFile(clipboard);
          if (file) {
            event.preventDefault();
            void insertImageRef.current(file);
            return true;
          }
          const html = clipboard.getData('text/html') ?? '';
          if (
            /<img\b/i.test(html) &&
            (html.includes('file://') || html.includes('webkit-fake-url'))
          ) {
            event.preventDefault();
            showEditorNoticeRef.current(
              'Could not read the pasted image. Try drag-and-drop, or use Copy Image from the source app.',
            );
            return true;
          }
        }

        if (shouldPasteClipboardAsMarkdown(clipboard)) {
          const ed = editorRef.current;
          if (ed && insertMarkdownPaste(ed, clipboard.getData('text/plain'))) {
            event.preventDefault();
            return true;
          }
        }

        return false;
      },
      handleDrop: (_view, event) => {
        if (!editableRef.current) return false;
        if (!attachmentScopeRef.current) return false;
        const file = readDataTransferImageFile(event.dataTransfer);
        if (!file) return false;
        event.preventDefault();
        void insertImageRef.current(file);
        return true;
      },
      handleDOMEvents: {
        dragover: (_view, event) => {
          if (!editableRef.current) return false;
          if (!attachmentScopeRef.current) return false;
          if (!dataTransferHasImageFiles(event.dataTransfer)) return false;
          event.preventDefault();
          return true;
        },
      },
    },
    onUpdate: ({ editor: ed, transaction }) => {
      editorRef.current = ed;
      if (!transaction.docChanged) return;
      if (transaction.getMeta(HYDRATION_TX_META)) {
        syncBaselineFromEditor(ed);
        return;
      }
      if (!editableRef.current) {
        syncBaselineFromEditor(ed);
        return;
      }
      scheduleChange(ed);
    },
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed;
      syncBaselineFromEditor(ed);
      tryAutoFocus(ed);
      void fetchRichTextAttachmentUserId(attachmentUserIdRef.current).then((uid) => {
        attachmentUserIdRef.current = uid;
        void hydrateAndTrack(ed, uid).then(() => syncBaselineFromEditor(ed));
      });
    },
    onBlur: () => {
      flushPending();
      onBlurRef.current?.();
    },
  });

  editorRef.current = editor;

  const lastExternalKey = useRef(externalKey);
  useEffect(() => {
    if (!editor) return;
    if (externalKey === lastExternalKey.current) return;

    const incomingSig = canonicalDocSignature(value, formatArg);
    const liveSig = docSignatureFromEditor(editor);

    // Parent echoed our own onChange, or editor already matches — never setContent.
    if (incomingSig === lastEmittedSig.current || incomingSig === liveSig) {
      lastExternalKey.current = externalKey;
      lastEmittedSig.current = liveSig;
      return;
    }

    // Parent props lag local typing (debounced onChange) or body/format split —
    // never clobber focused/pending editor state with stale empty content.
    if (
      incomingSig !== liveSig &&
      (editor.view.hasFocus() || pendingTimer.current !== null)
    ) {
      return;
    }

    lastExternalKey.current = externalKey;
    lastEmittedSig.current = incomingSig;
    setExternalContentPreservingSelection(
      editor,
      resolveRichTextContent(value, formatArg),
    );
    syncBaselineFromEditor(editor);
    const uid = attachmentUserIdRef.current;
    if (uid) {
      void hydrateAndTrack(editor, uid).then(() => syncBaselineFromEditor(editor));
    }
  }, [editor, externalKey, value, formatArg, hydrateAndTrack, syncBaselineFromEditor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!autoFocus || !editor || !editable) return;
    tryAutoFocus(editor);
  }, [autoFocus, editor, editable, tryAutoFocus]);

  const prevEditableRef = useRef(editable);
  useLayoutEffect(() => {
    const wasEditable = prevEditableRef.current;
    prevEditableRef.current = editable;
    if (wasEditable && !editable) {
      flushPending();
    }
  }, [editable, flushPending]);

  attachmentUserIdRef.current = attachmentUserId;
  primeRichTextAttachmentUserId(attachmentUserId);

  useEffect(() => {
    let cancelled = false;
    void fetchRichTextAttachmentUserId(attachmentUserId).then((uid) => {
      if (cancelled) return;
      attachmentUserIdRef.current = uid;
      if (editor) {
        void hydrateAndTrack(editor, uid).then(() => syncBaselineFromEditor(editor));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attachmentUserId, editor, hydrateAndTrack, syncBaselineFromEditor]);

  useEffect(() => {
    if (!editor) return;
    const uid = attachmentUserIdRef.current;
    if (!uid) return;
    void hydrateAndTrack(editor, uid).then(() => syncBaselineFromEditor(editor));
  }, [editor, externalKey, hydrateAndTrack, syncBaselineFromEditor]);

  const overSoft = showSizeWarning && isRichTextOverSoftLimit(charCount);
  const overHard = charCount > RICH_TEXT_HARD_CHAR_LIMIT;

  const toolbarNode =
    toolbar && editor ? (
      <RichTextToolbar
        editor={editor}
        onNotice={showEditorNotice}
        onInsertImageFile={insertImageFromFile}
      />
    ) : null;

  return (
    <div
      className={`rich-editor${stickyToolbar ? ' rich-editor--sticky-toolbar' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--rich-editor-min-h': `${minHeight}px` } as CSSProperties}
      onClickCapture={handleEditorImageClick}
      onDoubleClickCapture={handleEditorImageDoubleClick}
    >
      {toolbarNode && !toolbarMountEl ? toolbarNode : null}
      {toolbarNode && toolbarMountEl ? createPortal(toolbarNode, toolbarMountEl) : null}
      {editorNotice ? (
        <div className="rich-editor__notice" role="status">
          {editorNotice}
        </div>
      ) : null}
      {overSoft ? (
        <div
          className={`rich-editor__size-banner${overHard ? ' rich-editor__size-banner--hard' : ''}`}
          role="status"
        >
          {overHard ? (
            <>
              Very large document ({charCount.toLocaleString()} characters). Consider splitting into
              multiple notes — editing may feel slow above{' '}
              {RICH_TEXT_HARD_CHAR_LIMIT.toLocaleString()} characters.
            </>
          ) : (
            <>
              Large document ({charCount.toLocaleString()} characters). Still fine to edit; for very
              long reference material, splitting notes keeps things snappy (soft limit{' '}
              {RICH_TEXT_SOFT_CHAR_LIMIT.toLocaleString()}).
            </>
          )}
        </div>
      ) : null}
      <EditorContent editor={editor} className="rich-editor__surface" />
      {imageLightbox ? (
        <RichTextImageLightbox
          src={imageLightbox.src}
          alt={imageLightbox.alt}
          loading={imageLightbox.loading}
          onClose={closeImageLightbox}
        />
      ) : null}
    </div>
  );
}

type ToolbarProps = {
  editor: Editor;
  onNotice: (message: string) => void;
  onInsertImageFile: (file: Blob | File, alt?: string) => Promise<void>;
};

/** Re-render toolbar when selection/format changes so active states stay accurate. */
function useToolbarRefresh(editor: Editor) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    editor.on('selectionUpdate', bump);
    editor.on('transaction', bump);
    return () => {
      editor.off('selectionUpdate', bump);
      editor.off('transaction', bump);
    };
  }, [editor]);
}

function RichTextToolbar({ editor, onNotice, onInsertImageFile }: ToolbarProps) {
  useToolbarRefresh(editor);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [dateIso, setDateIso] = useState(todayIsoDate);
  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const inTable = editor.isActive('table');

  const run = useCallback((fn: () => boolean) => {
    fn();
  }, []);

  const openLinkEditor = useCallback(() => {
    const prev = editor.getAttributes('link').href as string | undefined;
    setLinkUrl(prev ?? 'https://');
    setLinkError(null);
    setLinkOpen(true);
    setImageOpen(false);
    setDateOpen(false);
    queueMicrotask(() => linkInputRef.current?.focus());
  }, [editor]);

  const applyLink = useCallback(() => {
    const raw = linkUrl.trim();
    if (!raw) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkError(null);
      setLinkOpen(false);
      return;
    }
    // Accept a bare domain by assuming https://, then enforce the safe-protocol
    // allowlist. `setLink` bypasses the extension's isAllowedUri gate, so this
    // is the only thing stopping a hand-typed `javascript:`/`data:` href from
    // being persisted as a link mark in note JSON.
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
    const candidate = hasScheme ? raw : `https://${raw}`;
    if (!isSafeEditorLinkUrl(candidate)) {
      setLinkError('Only http(s) and mailto links are allowed.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: candidate }).run();
    setLinkError(null);
    setLinkOpen(false);
  }, [editor, linkUrl]);

  const openImageEditor = useCallback(() => {
    setImageUrl('');
    setImageOpen(true);
    setLinkOpen(false);
    setDateOpen(false);
    queueMicrotask(() => imageInputRef.current?.focus());
  }, []);

  const insertImageSrc = useCallback(
    (src: string, alt?: string) => {
      editor.chain().focus().setImage({ src, alt: alt?.trim() || undefined }).run();
      setImageOpen(false);
    },
    [editor],
  );

  const applyImageUrl = useCallback(() => {
    const url = imageUrl.trim();
    if (!url) {
      onNotice('Enter an image URL or upload a file.');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      onNotice('Remote images must use an http(s) URL.');
      return;
    }
    insertImageSrc(url);
  }, [imageUrl, insertImageSrc, onNotice]);

  const uploadImage = useCallback(async () => {
    const file = await pickImageFile();
    if (!file) return;
    await onInsertImageFile(file, file.name);
    setImageOpen(false);
  }, [onInsertImageFile]);

  const openDateEditor = useCallback(() => {
    setDateIso(todayIsoDate());
    setDateOpen(true);
    setLinkOpen(false);
    setImageOpen(false);
  }, []);

  const insertDate = useCallback(
    (iso: string) => {
      const day = iso.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        onNotice('Pick a valid date.');
        return;
      }
      editor
        .chain()
        .focus()
        .insertDateChip({ iso: day, label: formatDateChipLabel(day) })
        .run();
      setDateOpen(false);
    },
    [editor, onNotice],
  );

  return (
    <div className="rich-editor__toolbar" role="toolbar" aria-label="Formatting">
      <ToolbarGroup label="Style">
        <ToolbarButton
          title="Bold (⌘B)"
          active={editor.isActive('bold')}
          onClick={() => run(() => editor.chain().focus().toggleBold().run())}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          title="Italic (⌘I)"
          active={editor.isActive('italic')}
          onClick={() => run(() => editor.chain().focus().toggleItalic().run())}
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          title="Underline (⌘U)"
          active={editor.isActive('underline')}
          onClick={() => run(() => editor.chain().focus().toggleUnderline().run())}
        >
          <span className="rich-editor__u">U</span>
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => run(() => editor.chain().focus().toggleStrike().run())}
        >
          <s>S</s>
        </ToolbarButton>
        <ToolbarButton
          title="Highlight"
          active={editor.isActive('highlight')}
          onClick={() => run(() => editor.chain().focus().toggleHighlight().run())}
        >
          HL
        </ToolbarButton>
        <ToolbarButton
          title="Inline code"
          active={editor.isActive('code')}
          onClick={() => run(() => editor.chain().focus().toggleCode().run())}
        >
          {'</>'}
        </ToolbarButton>
        <ToolbarButton
          title="Clear formatting"
          onClick={() =>
            run(() => editor.chain().focus().unsetAllMarks().clearNodes().run())
          }
        >
          ⌫
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Structure">
        <ToolbarButton
          title="Paragraph"
          active={editor.isActive('paragraph')}
          onClick={() => run(() => editor.chain().focus().setParagraph().run())}
        >
          ¶
        </ToolbarButton>
        <ToolbarButton
          title="Heading 1"
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          title="Blockquote"
          active={editor.isActive('blockquote')}
          onClick={() => run(() => editor.chain().focus().toggleBlockquote().run())}
        >
          ❝
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Lists">
        <ToolbarButton
          title="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => run(() => editor.chain().focus().toggleBulletList().run())}
        >
          •
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => run(() => editor.chain().focus().toggleOrderedList().run())}
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          title="Checkbox list"
          active={editor.isActive('taskList')}
          onClick={() => run(() => editor.chain().focus().toggleTaskList().run())}
        >
          ☐
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarGroup label="Insert">
        <ToolbarButton
          title="Code block"
          active={editor.isActive('codeBlock')}
          onClick={() => run(() => editor.chain().focus().toggleCodeBlock().run())}
        >
          {'{ }'}
        </ToolbarButton>
        <ToolbarButton
          title="Horizontal divider"
          onClick={() => run(() => editor.chain().focus().setHorizontalRule().run())}
        >
          ―
        </ToolbarButton>
        <ToolbarButton title="Add link" active={editor.isActive('link')} onClick={openLinkEditor}>
          Link
        </ToolbarButton>
        <ToolbarButton
          title="Remove link"
          disabled={!editor.isActive('link')}
          onClick={() => run(() => editor.chain().focus().unsetLink().run())}
        >
          Unlink
        </ToolbarButton>
        <ToolbarButton
          title="Insert image"
          active={imageOpen}
          onClick={openImageEditor}
        >
          Img
        </ToolbarButton>
        <ToolbarButton title="Insert date" active={dateOpen} onClick={openDateEditor}>
          Date
        </ToolbarButton>
        <ToolbarButton
          title="Insert table (3×3 with header)"
          onClick={() =>
            run(() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run(),
            )
          }
        >
          ⊞
        </ToolbarButton>
      </ToolbarGroup>

      {inTable ? (
        <ToolbarGroup label="Table">
          <ToolbarButton
            title="Add row below"
            onClick={() => run(() => editor.chain().focus().addRowAfter().run())}
          >
            +R
          </ToolbarButton>
          <ToolbarButton
            title="Add column right"
            onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}
          >
            +C
          </ToolbarButton>
          <ToolbarButton
            title="Delete row"
            onClick={() => run(() => editor.chain().focus().deleteRow().run())}
          >
            −R
          </ToolbarButton>
          <ToolbarButton
            title="Delete column"
            onClick={() => run(() => editor.chain().focus().deleteColumn().run())}
          >
            −C
          </ToolbarButton>
          <ToolbarButton
            title="Delete table"
            onClick={() => run(() => editor.chain().focus().deleteTable().run())}
          >
            ⊟
          </ToolbarButton>
        </ToolbarGroup>
      ) : null}

      <ToolbarGroup label="History">
        <ToolbarButton
          title="Undo (⌘Z)"
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => run(() => editor.chain().focus().undo().run())}
        >
          ↶
        </ToolbarButton>
        <ToolbarButton
          title="Redo (⌘⇧Z)"
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => run(() => editor.chain().focus().redo().run())}
        >
          ↷
        </ToolbarButton>
      </ToolbarGroup>

      {linkOpen ? (
        <div className="rich-editor__pop">
          <input
            ref={linkInputRef}
            className="input rich-editor__pop-input"
            type="url"
            value={linkUrl}
            placeholder="https://…"
            aria-label="Link URL"
            aria-invalid={linkError ? true : undefined}
            onChange={(e) => {
              setLinkUrl(e.target.value);
              if (linkError) setLinkError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setLinkOpen(false);
              }
            }}
          />
          <button type="button" className="btn btn--sm btn--primary" onClick={applyLink}>
            Apply
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setLinkOpen(false)}>
            Cancel
          </button>
          {linkError ? (
            <p className="rich-editor__pop-error" role="alert">
              {linkError}
            </p>
          ) : null}
        </div>
      ) : null}

      {imageOpen ? (
        <div className="rich-editor__pop">
          <button type="button" className="btn btn--sm" onClick={() => void uploadImage()}>
            Upload…
          </button>
          <input
            ref={imageInputRef}
            className="input rich-editor__pop-input"
            type="url"
            value={imageUrl}
            placeholder="https://… or upload"
            aria-label="Image URL"
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyImageUrl();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setImageOpen(false);
              }
            }}
          />
          <button type="button" className="btn btn--sm btn--primary" onClick={applyImageUrl}>
            Insert
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setImageOpen(false)}>
            Cancel
          </button>
        </div>
      ) : null}

      {dateOpen ? (
        <div className="rich-editor__pop">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => insertDate(todayIsoDate())}
          >
            Today
          </button>
          <input
            className="input rich-editor__pop-input rich-editor__pop-input--date"
            type="date"
            value={dateIso}
            aria-label="Date"
            onChange={(e) => setDateIso(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                insertDate(dateIso);
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setDateOpen(false);
              }
            }}
          />
          <span className="rich-editor__date-preview">{formatDateChipLabel(dateIso)}</span>
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() => insertDate(dateIso)}
          >
            Insert
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setDateOpen(false)}>
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rich-editor__group" role="group" aria-label={label}>
      {children}
    </div>
  );
}

function ToolbarButton({
  children,
  title,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={title} placement="bottom">
      <button
        type="button"
        className={`rich-editor__btn${active ? ' rich-editor__btn--active' : ''}`}
        aria-label={title}
        aria-pressed={active ?? false}
        disabled={disabled}
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onClick={onClick}
      >
        {children}
      </button>
    </Tooltip>
  );
}
