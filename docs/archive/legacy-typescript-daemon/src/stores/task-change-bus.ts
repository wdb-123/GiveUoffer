import { EventEmitter } from "node:events";

const taskChangeBus = new EventEmitter();
taskChangeBus.setMaxListeners(200);

export type TaskChangeListener = () => void;

export function publishTaskChange(taskId: string): void {
  taskChangeBus.emit(eventName(taskId));
}

export function subscribeTaskChange(taskId: string, listener: TaskChangeListener): () => void {
  const name = eventName(taskId);
  taskChangeBus.on(name, listener);
  return () => {
    taskChangeBus.off(name, listener);
  };
}

function eventName(taskId: string): string {
  return `agent-task:${taskId}`;
}
