/** Regola write implica read (allineata al backend PermissionsService.hasKey). */
export function hasReadEffective(set: Set<string>, readId: string | undefined, writeId: string | undefined): boolean {
  if (writeId && set.has(writeId)) {
    return true;
  }
  if (readId && set.has(readId)) {
    return true;
  }
  return false;
}

export function hasWriteEffective(set: Set<string>, writeId: string | undefined): boolean {
  return Boolean(writeId && set.has(writeId));
}

export function resourceVisible(draft: Set<string>, readId?: string, writeId?: string): boolean {
  return hasReadEffective(draft, readId, writeId);
}
