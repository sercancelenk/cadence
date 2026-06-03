// @ts-nocheck
declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';

  type TaskListsOptions = {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  };

  function markdownItTaskLists(md: MarkdownIt, options?: TaskListsOptions): void;
  export default markdownItTaskLists;
}
