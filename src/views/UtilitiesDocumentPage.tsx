import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '../AccountContext';
import { useAppData } from '../AppDataContext';
import { RichTextDocumentPane } from '../components/ui/RichTextDocumentPane';
import type { RichTextPayload } from '../lib/richText';
import { noteBodyPatchIsNoOp, richBodyFieldsFromPayload } from '../lib/richTextBody';
import type { RichTextBodyFormat } from '../lib/richText';
import { prefetchRichTextEditor } from '../features/notes/prefetchRichTextEditor';

const UTILITY_DOC_ID = 'scratch';

export function UtilitiesDocumentPage() {
  const { data, patchUtilityDocument } = useAppData();
  const { user } = useAccount();
  const doc = data.utilityDocument;

  const body = doc?.body ?? '';
  const bodyFormat: RichTextBodyFormat | 'auto' = doc?.bodyFormat ?? 'auto';

  const [editing, setEditing] = useState(true);

  useEffect(() => {
    prefetchRichTextEditor();
  }, []);

  const attachmentUserId = user?.id ?? 'anonymous';

  const lastUpdated = useMemo(() => {
    if (!doc?.updatedAt) return null;
    try {
      return new Date(doc.updatedAt).toLocaleString();
    } catch {
      return null;
    }
  }, [doc?.updatedAt]);

  const onChange = (payload: RichTextPayload) => {
    const fields = richBodyFieldsFromPayload(payload);
    const prev = {
      body: doc?.body ?? '',
      bodyFormat: doc?.bodyFormat,
      bodyPlainText: doc?.bodyPlainText,
    };
    if (noteBodyPatchIsNoOp(prev, fields)) {
      return;
    }
    patchUtilityDocument(fields);
  };

  return (
    <div className="page page--wide utilities-doc-page">
      <header className="utilities-doc-page__head">
        <div>
          <h1 className="utilities-doc-page__title">Document</h1>
          <p className="utilities-doc-page__lead muted">
            A standalone scratch pad — not a note or todo. Auto-saved to your workspace.
          </p>
        </div>
        {lastUpdated ? (
          <p className="utilities-doc-page__meta muted small">Last updated {lastUpdated}</p>
        ) : null}
      </header>

      <RichTextDocumentPane
        editorKey={UTILITY_DOC_ID}
        value={body}
        valueFormat={bodyFormat}
        editing={editing}
        onEditingChange={setEditing}
        onChange={onChange}
        placeholder="Draft ideas, paste snippets, plan before you commit to a note…"
        minHeight={420}
        attachmentScope={{ documentKind: 'utility', documentId: UTILITY_DOC_ID }}
        attachmentUserId={attachmentUserId}
      />

    </div>
  );
}
