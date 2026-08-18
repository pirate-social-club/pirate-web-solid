export function projectQueryData<T>(data: T | undefined, pending: Promise<T>): T | Promise<T> {
  return data ?? pending;
}
