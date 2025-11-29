import { type HTMLProps, useEffect, useState } from "react";
import { cn, getOsType } from "@/lib/utils";
import { Windows } from "./windows";

export function WindowTitlebar({
  className,
  children,
  ...props
}: HTMLProps<HTMLDivElement>) {
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    getOsType().then((osname) => {
      setShowControls(osname !== "darwin");
    });
  }, []);

  return (
    <div
      className={cn(
        "flex h-8 w-full items-center justify-between bg-background",
        className,
      )}
      data-tauri-drag-region
      {...props}>
      <div className='flex items-center flex-1' data-tauri-drag-region>
        {children}
      </div>
      {showControls && <Windows />}
    </div>
  );
}
