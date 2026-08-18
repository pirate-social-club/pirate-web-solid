export const MAX_NOTE_LENGTH = 500;

export function limitJoinRequestNote(note: string | undefined): string {
  return (note ?? "").slice(0, MAX_NOTE_LENGTH);
}

export function submitJoinRequestNote(note: string): string {
  return note.trim();
}

export function joinRequestNoteCount(note: string): number {
  return note.length;
}
