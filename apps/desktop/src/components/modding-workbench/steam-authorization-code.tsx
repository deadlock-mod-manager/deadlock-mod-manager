export const SteamAuthorizationCode = ({
  lines,
  label,
}: {
  lines: readonly string[];
  label: string;
}) => {
  const rows = lines.map((line) => Array.from(line));
  const width = Math.max(1, ...rows.map((row) => row.length));
  const height = Math.max(2, rows.length * 2);
  const path = rows
    .flatMap((row, y) =>
      row.map((cell, x) => {
        if (cell === "█") return `M${x},${y * 2}h1v2h-1z`;
        if (cell === "▀") return `M${x},${y * 2}h1v1h-1z`;
        if (cell === "▄") return `M${x},${y * 2 + 1}h1v1h-1z`;
        return "";
      }),
    )
    .join("");
  return (
    <svg
      role='img'
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      className='h-64 w-64 [shape-rendering:crispEdges]'>
      <rect width={width} height={height} fill='white' />
      <path d={path} fill='black' />
    </svg>
  );
};
