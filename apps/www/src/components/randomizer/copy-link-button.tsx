import { Button } from "@deadlock-mods/ui/components/button";
import { Check, Link2, X } from "@deadlock-mods/ui/icons";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const COPY_FEEDBACK_MS = 2000;

export const CopyLinkButton = () => {
  const { t } = useTranslation("tool-randomizer");
  // The clipboard is a permission the browser can refuse, so the button says
  // which of the two happened rather than silently claiming success.
  const [result, setResult] = useState<"idle" | "copied" | "failed">("idle");
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  const flash = (next: "copied" | "failed") => {
    setResult(next);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setResult("idle"), COPY_FEEDBACK_MS);
  };

  const copy = () => {
    navigator.clipboard.writeText(window.location.href).then(
      () => flash("copied"),
      () => flash("failed"),
    );
  };

  const icon = {
    idle: <Link2 className='size-4' />,
    copied: <Check className='size-4' />,
    failed: <X className='size-4' />,
  }[result];
  const label = t(`toolbar.copyLink.${result}`);

  return (
    <Button onClick={copy} size='sm' variant='outline'>
      {icon}
      <span aria-live='polite'>{label}</span>
    </Button>
  );
};
