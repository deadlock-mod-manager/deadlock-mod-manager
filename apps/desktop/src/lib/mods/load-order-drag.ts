import type { Modifier } from "@dnd-kit/core";

export const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});
