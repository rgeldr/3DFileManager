import { appendCommaTags, commaTagOptions, tagFieldKey } from "../lib/commaTags";
import { displayTagColor } from "../lib/tagColor";
import type { TagCount } from "../types";
import { TagChip } from "./TagChip";

export function ImportMetaFields({
  creators,
  tags,
  tagCounts = [],
  importCreator,
  setImportCreator,
  importTags,
  setImportTags,
  importTagText,
  setImportTagText,
  creatorListId = "import-creators",
  tagListId = "import-tags",
  creatorPlaceholder = "Creator for all imported files",
  tagPlaceholder = "Tags for all imported files",
}: {
  creators: string[];
  tags: string[];
  tagCounts?: TagCount[];
  importCreator: string;
  setImportCreator: (value: string) => void;
  importTags: string[];
  setImportTags: (tags: string[]) => void;
  importTagText: string;
  setImportTagText: (text: string) => void;
  creatorListId?: string;
  tagListId?: string;
  creatorPlaceholder?: string;
  tagPlaceholder?: string;
}) {
  return (
    <>
      <input
        placeholder={creatorPlaceholder}
        list={creatorListId}
        value={importCreator}
        onChange={(event) => setImportCreator(event.target.value)}
      />
      <datalist id={creatorListId}>
        {creators.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <div className="tags">
        {importTags.map((item) => (
          <TagChip
            key={item}
            name={item}
            color={displayTagColor(item, tagCounts)}
            onClick={() => setImportTags(importTags.filter((tag) => tag !== item))}
          />
        ))}
      </div>
      <input
        placeholder={tagPlaceholder}
        list={tagListId}
        value={importTagText}
        onChange={(event) => setImportTagText(event.target.value)}
        onKeyDown={(event) => {
          const next = tagFieldKey(importTags, importTagText, event.key);
          if (!next) return;
          event.preventDefault();
          setImportTags(next.tags);
          setImportTagText(next.text);
        }}
      />
      <datalist id={tagListId}>
        {commaTagOptions(importTagText, tags).map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
    </>
  );
}

export { appendCommaTags };
