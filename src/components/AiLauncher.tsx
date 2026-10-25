import { lazy, Suspense, useEffect, useState } from 'react';
import { useAppData } from '../AppDataContext';
import { hasUsableConnection } from '../lib/ai/connections';
import { subscribeAiTool, type AiToolId, type AiToolPreset } from '../lib/ai/launcher';
import { useFeatures } from '../lib/features';

const AIDigestDialog = lazy(() => import('./AIDigestDialog').then((m) => ({ default: m.AIDigestDialog })));
const AIWorkspaceDialog = lazy(() => import('./AIWorkspaceDialog').then((m) => ({ default: m.AIWorkspaceDialog })));
const AIDrawDialog = lazy(() => import('./AIDrawDialog').then((m) => ({ default: m.AIDrawDialog })));
const AIScreenshotDialog = lazy(() => import('./AIScreenshotDialog').then((m) => ({ default: m.AIScreenshotDialog })));

/** Shows the AI tool that ⌘K or a page button asked for. Mounted once in the app shell. */
export function AiLauncher() {
  const { data, createNoteWithContent, upsertUtilitySketchDocument } = useAppData();
  const { features } = useFeatures();
  const enabled = features.ai && hasUsableConnection(data.aiSettings);
  const [open, setOpen] = useState<{ tool: AiToolId; preset?: AiToolPreset } | null>(null);

  useEffect(
    () => subscribeAiTool((tool, preset) => setOpen(enabled ? { tool, preset } : null)),
    [enabled],
  );

  if (!enabled || !open) return null;
  const { tool, preset } = open;
  const close = () => setOpen(null);
  return (
    <Suspense fallback={null}>
      {tool === 'weekly-digest' ? (
        <AIDigestDialog
          open
          onClose={close}
          initialMode={preset?.mode}
          onSave={(title, markdown) =>
            createNoteWithContent({ title, body: markdown, bodyFormat: 'markdown', bodyPlainText: markdown })
          }
        />
      ) : null}
      {tool === 'screenshot-to-diagram' ? (
        <AIScreenshotDialog
          open
          onClose={close}
          onApply={(title, fields) => createNoteWithContent({ title, ...fields })}
        />
      ) : null}
      {tool === 'ask-workspace' ? <AIWorkspaceDialog open onClose={close} /> : null}
      {tool === 'draw-from-description' ? (
        <AIDrawDialog
          open
          onClose={close}
          initialFormat={preset?.format}
          onAddNote={(title, fields) => createNoteWithContent({ title, ...fields })}
          onAddSketch={(title, sceneJson) => upsertUtilitySketchDocument({ title, sceneJson })}
        />
      ) : null}
    </Suspense>
  );
}
