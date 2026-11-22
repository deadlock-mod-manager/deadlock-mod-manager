import { useState } from "react";
import { ToggleRow } from "./toggle-row";

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
