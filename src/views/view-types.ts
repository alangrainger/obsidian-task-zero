import type { Task } from '../classes/task.svelte'

export interface State {
  activeId: number;
  tasks: Task[];
  sidebar: {
    open: boolean;
    fields: {
      text: HTMLInputElement;
    }
  }
  viewIsActive: boolean;
}
