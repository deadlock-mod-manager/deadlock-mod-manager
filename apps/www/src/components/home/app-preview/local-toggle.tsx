import { useState } from "react";
import { ToggleRow } from "./toggle-row";

/** A toggle with local state, for settings that only matter inside the app. */
export const LocalToggle = (props: {
  label: string;
  description: string;
  initial: boolean;
}) => {
  const [checked, setChecked] = useState(props.initial);
  return (
    <ToggleRow
      label={props.label}
      description={props.description}
      checked={checked}
      onCheckedChange={setChecked}
    />
  );
};
