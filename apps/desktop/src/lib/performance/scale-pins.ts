type LabelRow = 0 | 1;

/**
 * Spreads pin labels over two rows under the scale so neighbours don't
 * overlap. Pins too close to a label in both rows get no label (their tooltip
 * still names them). Positions and `minGap` are fractions of the track width.
 */
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
