import { displayTagColor, tagChipStyle } from "../lib/tagColor";

export function TagChip({
  name,
  color,
  onClick,
  ariaLabel,
  disabled = false,
}: {
  name: string;
  color?: string;
  onClick?: () => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const style = tagChipStyle(color || displayTagColor(name, []));
  if (onClick) {
    return (
      <button type="button" className="tag" style={style} aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
        {name} ×
      </button>
    );
  }
  return (
    <span className="tag" style={style}>
      {name}
    </span>
  );
}
