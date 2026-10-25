import { lazy, Suspense, useState } from 'react';
import { useAppData } from '../AppDataContext';
import { hasUsableConnection } from '../lib/ai/connections';
import { peopleAiAvailable } from '../lib/ai/entryPoints';
import { useFeatures } from '../lib/features';
import { IcSparkles } from './icons';
import { Button } from './ui/Button';

const AIPrepDialog = lazy(() => import('./AIPrepDialog').then((m) => ({ default: m.AIPrepDialog })));

type AddItem = ReturnType<typeof useAppData>['addItem'];

/** "Prepare with AI" in a person's 1:1 area. Shown only when AI for people data is on and usable. */
export function PersonPrepButton({ personId, addItem }: { personId: string; addItem: AddItem }) {
  const { data } = useAppData();
  const { features } = useFeatures();
  const [open, setOpen] = useState(false);
  if (!peopleAiAvailable({ features, hasConnection: hasUsableConnection(data.aiSettings) })) return null;
  return (
    <>
      <Button type="button" variant="secondary" icon={<IcSparkles size={17} />} onClick={() => setOpen(true)}>
        Prepare with AI
      </Button>
      {open ? (
        <Suspense fallback={null}>
          <AIPrepDialog open onClose={() => setOpen(false)} personId={personId} onAdd={(fields) => addItem(personId, 'note', fields)} />
        </Suspense>
      ) : null}
    </>
  );
}
