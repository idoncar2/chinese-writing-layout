export class SettingsSaveQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue(operation: () => Promise<void> | void): Promise<void> {
    const next = this.tail
      .catch(() => undefined)
      .then(operation);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
