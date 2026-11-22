type LabelRow = 0 | 1;

export const assignLabelRows = (
  pins: readonly { id: string; position: number }[],
  minGap: number,
): Map<string, LabelRow | null> => {
  const lastInRow: [number, number] = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  const rows = new Map<string, LabelRow | null>();
  for (const pin of [...pins].sort((a, b) => a.position - b.position)) {
    const row: LabelRow | null =
      pin.position - lastInRow[0] >= minGap
        ? 0
        : pin.position - lastInRow[1] >= minGap
          ? 1
          : null;
    if (row !== null) lastInRow[row] = pin.position;
    rows.set(pin.id, row);
  }
  return rows;
};
