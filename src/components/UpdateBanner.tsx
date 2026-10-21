export function UpdateBanner({
  version,
  message,
  busy,
  onInstall,
  onLater,
}: {
  version: string;
  message: string | null;
  busy: boolean;
  onInstall: () => void;
  onLater: () => void;
}) {
  return (
    <div className="banner" role="status">
      <span>{message ?? `Version ${version} is available.`}</span>
      <span className="row">
        <button type="button" onClick={onLater} disabled={busy}>Later</button>
        <button type="button" onClick={onInstall} disabled={busy}>Install</button>
      </span>
    </div>
  );
}
