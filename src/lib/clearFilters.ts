export function filtersActive(input: {
  query: string;
  creator: string;
  selectedTypeIds: readonly string[];
  selectedTagIds: readonly number[];
}): boolean {
  return input.query !== "" || input.creator !== "" || input.selectedTypeIds.length > 0 || input.selectedTagIds.length > 0;
}
