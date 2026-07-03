import { defaultTaskExecutionScheduler } from "../execution/task-execution-scheduler";

export function getAgentExecutionQueueSnapshot() {
  return defaultTaskExecutionScheduler.snapshot();
}

export function cancelAgentExecution(taskId: string): boolean {
  return defaultTaskExecutionScheduler.cancel(taskId);
}

export function runWithAgentExecutionSlot<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return defaultTaskExecutionScheduler.runExclusive(label, fn);
}
