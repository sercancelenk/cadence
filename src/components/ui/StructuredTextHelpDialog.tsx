import { IcBraces, IcHelpCircle, IcLayoutGrid, IcPencil } from '../icons';
import { AppModal } from './AppModal';

export type StructuredTextHelpDialogProps = {
  onClose: () => void;
};

export function StructuredTextHelpDialog({ onClose }: StructuredTextHelpDialogProps) {
  return (
    <AppModal
      title="JSON / YAML editor guide"
      icon={<IcHelpCircle size={18} />}
      onClose={onClose}
      size="xl"
      layout="flex"
      showCloseButton
      bodyClassName="ai-dialog__scroll structured-text-help"
      footer={
        <div className="app-modal__actions">
          <button type="button" className="app-modal__btn-confirm" onClick={onClose}>
            Got it
          </button>
        </div>
      }
    >
      <section className="structured-text-help__section">
        <h3 className="structured-text-help__heading">What this is</h3>
        <p>
          A workspace scratch pad for structured data — not a note or todo. Everything auto-saves
          to your workspace as you type.
        </p>
      </section>

      <section className="structured-text-help__section">
        <h3 className="structured-text-help__heading">
          <IcPencil size={14} aria-hidden />
          Edit mode
        </h3>
        <ul>
          <li>
            Open multiple documents as tabs — <strong>＋</strong> adds a tab, double-click a tab to
            rename it, and each tab keeps its own content, language, and mode.
          </li>
          <li>
            Toggle <strong>JSON</strong> / <strong>YAML</strong> or use <strong>Convert</strong>{' '}
            to transform the whole document.
          </li>
          <li>
            Toolbar: <strong>Format</strong>, <strong>Compact</strong>, <strong>Stringify</strong>{' '}
            (JSON), fold/unfold blocks, copy, and in-document search.
          </li>
          <li>Invalid syntax is flagged inline — status shows the first error line.</li>
        </ul>
      </section>

      <section className="structured-text-help__section">
        <h3 className="structured-text-help__heading">
          <IcLayoutGrid size={14} aria-hidden />
          Diff mode
        </h3>
        <p>
          Compare two versions side by side. <strong>Edit, Left, and Right are three separate
          buffers</strong> — changing one does not change the others.
        </p>
        <ul>
          <li>
            First time you open Diff, Left and Right are seeded from Edit once. After that they
            stay independent.
          </li>
          <li>Both panes are fully editable — paste, delete lines, and type as in Edit mode.</li>
          <li>
            <strong>Line + summary</strong> — line diff plus a structural summary (renames,
            added/removed keys, value changes).
          </li>
          <li>
            <strong>Line only</strong> / <strong>Summary only</strong> — focus on one view.
          </li>
          <li>
            Click a summary row to jump to that field in the matching pane (opens search if the
            path cannot be located).
          </li>
        </ul>
      </section>

      <section className="structured-text-help__section">
        <h3 className="structured-text-help__heading">
          <IcBraces size={14} aria-hidden />
          Align keys (Diff)
        </h3>
        <p>
          Off by default so editing feels like Edit mode. Turn on when you want to{' '}
          <em>read</em> line diffs more easily — keys are sorted visually on both sides so
          matching fields line up.
        </p>
        <ul>
          <li>Does not reorder what is saved unless you edit while it is on.</li>
          <li>Reduces false highlights when key order differs but values match.</li>
          <li>Double-click the button to re-run alignment after large paste operations.</li>
        </ul>
      </section>

      <section className="structured-text-help__section">
        <h3 className="structured-text-help__heading">Summary panel</h3>
        <ul>
          <li>
            <strong>Possible renames</strong> — same value, different field name on Left vs
            Right.
          </li>
          <li>
            <strong>Only on Left / Right</strong> — keys that exist on one side only.
          </li>
          <li>
            <strong>Changed values</strong> — same path, different leaf value.
          </li>
          <li>Filter chips: <strong>All</strong>, <strong>Keys</strong>, <strong>Values</strong>.</li>
        </ul>
      </section>

      <section className="structured-text-help__section structured-text-help__section--shortcuts">
        <h3 className="structured-text-help__heading">Shortcuts</h3>
        <dl className="structured-text-help__shortcuts">
          <div>
            <dt>
              <kbd>⌘</kbd> <kbd>F</kbd>
            </dt>
            <dd>Find in document (Edit) or focused Diff pane</dd>
          </div>
          <div>
            <dt>
              <kbd>⌘</kbd> <kbd>G</kbd>
            </dt>
            <dd>Find next match</dd>
          </div>
          <div>
            <dt>
              <kbd>Tab</kbd>
            </dt>
            <dd>Indent selection</dd>
          </div>
          <div>
            <dt>Gutter ▸ / ▾</dt>
            <dd>Collapse or expand nested blocks</dd>
          </div>
        </dl>
      </section>
    </AppModal>
  );
}
