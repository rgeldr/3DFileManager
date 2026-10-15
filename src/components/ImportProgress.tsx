export function ImportProgressLines({
  current,
  total,
  message,
}: {
  current: number;
  total: number;
  message: string;
}) {
  const count = total > 0 ? `${current} of ${total}` : "\u00a0";
  return (
    <>
      <p className="progress-count">{count}</p>
      <p className="progress-name" title={message}>
        {message}
      </p>
    </>
  );
}
