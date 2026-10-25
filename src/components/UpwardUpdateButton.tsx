import { useAppData } from '../AppDataContext';
import { hasUsableConnection } from '../lib/ai/connections';
import { openAiTool } from '../lib/ai/launcher';
import { useFeatures } from '../lib/features';
import { IcSparkles } from './icons';
import { Button } from './ui/Button';

/**
 * "Prepare an update" on a manager's page: opens the weekly digest as a status update written from
 * your own tasks and notes. Nothing about the manager is read or sent. Shown only when AI is usable.
 */
export function UpwardUpdateButton() {
  const { data } = useAppData();
  const { features } = useFeatures();
  if (!features.ai || !hasUsableConnection(data.aiSettings)) return null;
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      icon={<IcSparkles size={15} />}
      title="Write a status update from your own recent work (AI)"
      onClick={() => openAiTool('weekly-digest', { mode: 'upward' })}
    >
      Prepare an update
    </Button>
  );
}
