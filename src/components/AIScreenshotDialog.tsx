import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { copyText } from '../lib/clipboard';
import { previewDocument } from '../lib/ai/htmlPreview';
import { fileToAiImage, type AiImage } from '../lib/ai/images';
import { screenshotTask } from '../lib/ai/prompts/screenshot';
import { codeNoteFields } from '../lib/ai/sketchGraph';
import { useAiRun } from '../lib/ai/useAiRun';
import { validateMermaid } from '../lib/richTextMermaid';
import type { RichTextBodyFields } from '../lib/richTextBody';
import { AiResultPanel } from './ai/AiResultPanel';
import type { AiContextChip } from './ai/AiContextChips';
import { IcRefresh, IcSparkles } from './icons';
import { AutoResizeTextarea } from './ui/AutoResizeTextarea';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Adds the result as a new note; the new note's id, or null when it could not be saved. */
  onApply: (title: string, fields: RichTextBodyFields) => string | null;
};

type Target = 'mermaid' | 'html';
const MAX_HINT_CHARS = 1_000;

/**
 * "Diagram from a screenshot": a picture of a diagram or a screen becomes Mermaid or a static HTML
 * mock-up. The picture is shown here first and leaves the computer only when the user presses
 * Convert. HTML is cleaned, shown in a frame without scripts, and stored as code.
 */
export function AIScreenshotDialog({ open, onClose, onApply }: Props) {
  const run = useAiRun(screenshotTask);
  const toast = useToast();
  const [image, setImage] = useState<AiImage | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>('mermaid');
  const [hint, setHint] = useState('');
  const [result, setResult] = useState<{ kind: Target; source: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const takeSeq = useRef(0);
  const showingDrop = !result;

  // The paste area takes focus so ⌘V works right after the dialog opens.
  useEffect(() => {
    if (open && showingDrop) dropRef.current?.focus();
  }, [open, showingDrop]);

  if (!open || !run.enabled) return null;

  const take = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    setResult(null);
    const mine = ++takeSeq.current;
    const read = await fileToAiImage(file);
    // A slower, older file must not replace the one picked after it.
    if (mine !== takeSeq.current) return;
    if (!read.ok) {
      setImage(null);
      setFileError(read.error);
      return;
    }
    setImage(read.image);
  };
  const onPaste = (e: ClipboardEvent) => {
    const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      void take(file);
    }
  };

  const convert = async () => {
    if (!image) return;
    setResult(null);
    setChecking(true);
    try {
      const r = await run.run({ input: { hint: hint.trim() }, images: [image], options: { target } });
      if (!r?.ok) return;
      if (r.value.kind === 'mermaid') {
        const check = await validateMermaid(r.value.source);
        if (!check.ok) {
          run.setError({ message: 'The assistant could not make a diagram that renders. Try again, or use a clearer picture.' });
          return;
        }
      }
      setResult(r.value);
    } finally {
      setChecking(false);
    }
  };
  const add = () => {
    if (!result || run.truncated) return;
    const title = result.kind === 'html' ? 'HTML from a screenshot' : 'Diagram from a screenshot';
    const id = onApply(title, codeNoteFields(result.kind, result.source));
    if (id === null) {
      run.setError({ message: 'The note could not be saved (saving is blocked right now). Nothing was changed.' });
      return;
    }
    toast.showSuccess('Added as a note', 'It is a new note; nothing else was changed.');
    onClose();
  };
  const copy = async () => {
    if (!result) return;
    if (await copyText(result.source)) toast.showSuccess('Copied', 'The source is on your clipboard.');
    else toast.showWarning('Could not copy', 'Select the source and copy it by hand.');
  };

  const busy = run.busy || checking;
  const chips: AiContextChip[] = [
    { label: 'Image', detail: image ? `1 image (${Math.round((image.base64.length * 3) / 4 / 1024)} KB)` : 'none chosen' },
    ...(hint.trim() ? [{ label: 'Note', detail: `${Math.min(hint.trim().length, MAX_HINT_CHARS)} characters`, sent: hint.trim().slice(0, MAX_HINT_CHARS) }] : []),
  ];

  return (
    <AiResultPanel
      open
      title="Diagram from a screenshot"
      connectionLabel={run.connectionLabel || undefined}
      modelLabel={run.modelLabel || undefined}
      chips={chips}
      status={run.blockedView ? 'blocked' : busy ? 'running' : 'ready'}
      message={run.blockedView?.message}
      blockedAction={run.blockedView?.canOpenSettings ? { label: 'Open AI settings', onClick: () => run.openSettings(onClose) } : undefined}
      truncated={run.truncated}
      applyLabel="Add as a new note"
      onApply={result ? add : undefined}
      applyDisabled={run.truncated}
      onCopy={result ? () => void copy() : undefined}
      onRegenerate={result ? () => void convert() : undefined}
      onClose={onClose}
    >
      {run.fellBack && run.connectionLabel ? (
        <p className="ai-dialog__fallback muted small">
          {`The connection chosen for this was not available, so “${run.connectionLabel}” was used.`}
        </p>
      ) : null}
      <p className="muted small" style={{ marginTop: 0 }}>
        The picture is sent only when you press Convert, and only to the connection you chose. Anything written in it is
        treated as content, not as instructions.
      </p>
      {!result ? (
        <div
          ref={dropRef}
          data-testid="screenshot-drop"
          role="group"
          aria-label="Image: choose a file, or paste a picture here"
          onPaste={onPaste}
          tabIndex={0}
          className="ai-screenshot__drop"
        >
          <label className="field" style={{ marginTop: 0 }}>
            <span>Image</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              aria-label="Image"
              onChange={(e) => void take(e.target.files?.[0])}
              disabled={busy}
            />
          </label>
          <p className="muted small">Or paste a picture here (⌘V).</p>
          {fileError ? (
            <div className="ai-dialog__error" role="alert" style={{ marginBottom: 12 }}>
              {fileError}
            </div>
          ) : null}
          {image ? (
            <img
              className="ai-screenshot__thumb"
              alt="Selected image"
              src={`data:${image.mediaType};base64,${image.base64}`}
            />
          ) : null}
          <fieldset className="field" style={{ border: 0, padding: 0 }}>
            <legend className="muted small">Turn it into</legend>
            <label style={{ marginRight: 12 }}>
              <input type="radio" name="shot-target" checked={target === 'mermaid'} onChange={() => setTarget('mermaid')} disabled={busy} /> Mermaid diagram
            </label>
            <label>
              <input type="radio" name="shot-target" checked={target === 'html'} onChange={() => setTarget('html')} disabled={busy} /> HTML mock-up
            </label>
          </fieldset>
          <label className="field">
            <span>Anything the picture does not show (optional)</span>
            <AutoResizeTextarea className="textarea" value={hint} onChange={setHint} minRows={2} maxRows={5} disabled={busy} ariaLabel="Note about the picture" />
          </label>
          <div className="row" style={{ marginTop: 10, marginBottom: 12 }}>
            <Button
              type="button"
              variant="primary"
              icon={busy ? <IcRefresh size={16} className="ai-spin" /> : <IcSparkles size={16} />}
              onClick={() => void convert()}
              disabled={busy || !image}
            >
              Convert
            </Button>
          </div>
        </div>
      ) : null}
      {run.error ? (
        <>
          <div className="ai-dialog__error" role="alert" style={{ marginBottom: 12 }}>
            {run.error.message}
          </div>
          {run.error.diagnostic ? (
            <details className="ai-panel__diagnostic">
              <summary>Diagnostic details</summary>
              <pre>{run.error.diagnostic}</pre>
            </details>
          ) : null}
        </>
      ) : null}
      {result?.kind === 'html' ? (
        <iframe className="ai-screenshot__frame" title="Preview" sandbox="" srcDoc={previewDocument(result.source)} />
      ) : null}
      {result ? <pre className="ai-sketch__source">{result.source}</pre> : null}
    </AiResultPanel>
  );
}
