import type { Task } from '../classes/task.svelte'

export interface State {
  tasks: Task[];
  activeId: number;
  tabs: Tab[],
  activeTab: string;
  sidebar: {
    open: boolean;
    fields: {
      text: HTMLTextAreaElement;
    }
  }
  viewIsActive: boolean;
}

export interface Tab {
  id: string,
  label: string
}
