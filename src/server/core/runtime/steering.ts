export class TaskSteering {
  private notes = new Map<string, string[]>();

  push(taskId: string, note: string): void {
    const queue = this.notes.get(taskId) ?? [];
    queue.push(note);
    this.notes.set(taskId, queue);
  }

  drain(taskId: string): string[] {
    const queue = this.notes.get(taskId) ?? [];
    this.notes.delete(taskId);
    return queue;
  }
}
