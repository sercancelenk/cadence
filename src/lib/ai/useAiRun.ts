import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../AppDataContext';
import type { AIMessage } from '../ai';
import { useFeatures } from '../features';
import { PATH_SETTINGS } from '../routes';
import { hasUsableConnection } from './connections';
import type { AiImage } from './images';
import { runAiTask, type RunTaskResult } from './runTask';
import type { AiOptions, AiTask, DataClass } from './types';

export type AiBlocked = { message: string; canOpenSettings: boolean };
export type AiRunError = { message: string; diagnostic?: string };

const NOT_CONFIGURED: AiBlocked = {
  message:
    "You haven't configured an AI provider yet. Open Settings → AI Assistant to connect one (a hosted provider, or your own gateway).",
  canOpenSettings: true,
};

/**
 * The scaffolding every AI dialog needs around `runAiTask`: the policy and connection gates, the
 * blocked / error / cut-off states, streaming text, and cancelling when the dialog goes away.
 * A new run clears the previous result first, so a dialog never shows an old answer for a new ask.
 */
export function useAiRun<In, Out>(task: AiTask<In, Out>, opts: { dataClass?: DataClass } = {}) {
  const { data } = useAppData();
  const { features } = useFeatures();
  const navigate = useNavigate();
  const aiSettings = data.aiSettings;

  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState<Out | null>(null);
  const [error, setError] = useState<AiRunError | null>(null);
  const [blocked, setBlocked] = useState<AiBlocked | null>(null);
  const [connectionLabel, setConnectionLabel] = useState('');
  const [modelLabel, setModelLabel] = useState('');
  const [fellBack, setFellBack] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [streamText, setStreamText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const reset = useCallback(() => {
    setValue(null);
    setError(null);
    setBlocked(null);
    setTruncated(false);
    setStreamText('');
    setFellBack(false);
    setConnectionLabel('');
    setModelLabel('');
  }, []);

  const abort = useCallback(() => abortRef.current?.abort(), []);

  const run = useCallback(
    async (args: {
      input: In;
      options?: AiOptions;
      images?: AiImage[];
      conversation?: AIMessage[];
      legacyFocusNote?: string;
      stream?: boolean;
    }): Promise<RunTaskResult<Out> | null> => {
      // A dialog that is gone must not start a request (for example after Cancel during a search step).
      if (!mountedRef.current) return null;
      reset();
      setBusy(true);
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const result = await runAiTask({
          task,
          input: args.input,
          options: args.options,
          images: args.images,
          conversation: args.conversation,
          legacyFocusNote: args.legacyFocusNote,
          dataClass: opts.dataClass,
          settings: aiSettings,
          features: { ai: features.ai, aiPeople: features.aiPeople, aiFocusNote: features.aiFocusNote },
          signal: ctrl.signal,
          ...(args.stream ? { onText: (t: string) => abortRef.current === ctrl && setStreamText(t) } : {}),
        });
        // A newer run took over: its state is the one that counts, and this caller gets nothing to apply.
        if (abortRef.current !== ctrl) return null;
        if (ctrl.signal.aborted && !result.ok && result.reason === 'cancelled') return result;
        if (!result.ok) {
          if (result.reason === 'cancelled') return result;
          if (result.reason === 'not-configured' || result.reason === 'capability' || result.reason === 'blocked-people') {
            setBlocked({ message: result.message, canOpenSettings: true });
          } else if (result.reason === 'policy') {
            setBlocked({ message: result.message, canOpenSettings: false });
          } else {
            setError({ message: result.message, ...(result.diagnostic ? { diagnostic: result.diagnostic } : {}) });
          }
          return result;
        }
        setConnectionLabel(result.connectionName);
        setModelLabel(result.model);
        setFellBack(result.fellBack);
        // A streamed reply that ended without a clear finish may be partial; flag it like a cut-off one.
        setTruncated(result.stopReason === 'length' || (args.stream === true && result.stopReason === 'other'));
        setValue(result.value);
        return result;
      } finally {
        if (abortRef.current === ctrl) {
          abortRef.current = null;
          setBusy(false);
        }
      }
    },
    [aiSettings, features.ai, features.aiFocusNote, features.aiPeople, opts.dataClass, reset, task],
  );

  const configured = hasUsableConnection(aiSettings);
  /** A run's block, or "nothing is connected"; the panel shows this instead of the form. */
  const blockedView: AiBlocked | null = blocked ?? (configured ? null : NOT_CONFIGURED);

  const openSettings = useCallback(
    (onClose?: () => void) => {
      onClose?.();
      navigate(`${PATH_SETTINGS}#ai`);
    },
    [navigate],
  );

  return {
    run,
    abort,
    reset,
    openSettings,
    busy,
    value,
    error,
    setError,
    blocked,
    blockedView,
    connectionLabel,
    modelLabel,
    fellBack,
    truncated,
    streamText,
    configured,
    enabled: features.ai,
    aiSettings,
    features,
  };
}
