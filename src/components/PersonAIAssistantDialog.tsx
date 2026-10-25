import type { ComponentProps } from 'react';
import { AIAssistantDialog } from './AIAssistantDialog';

/**
 * Ask AI for a task or goal that belongs to a person. That is people data whatever the prompt
 * is, so the class is fixed here and cannot be forgotten by a caller: the request then only goes
 * to a connection allowed for people data, and `features.aiPeople` applies.
 */
export function PersonAIAssistantDialog(props: Omit<ComponentProps<typeof AIAssistantDialog>, 'dataClass'>) {
  return <AIAssistantDialog {...props} dataClass="people" />;
}
