import { useEffect, useState } from "react";

export const useResponsiveColumns = (defaultColumns = 4) => {
  const [columnsPerRow, setColumnsPerRow] = useState(defaultColumns);

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width >= 1536) setColumnsPerRow(6);
      else if (width >= 1280) setColumnsPerRow(5);
      else if (width >= 1024) setColumnsPerRow(4);
      else if (width >= 768) setColumnsPerRow(3);
      else if (width >= 640) setColumnsPerRow(2);
      else setColumnsPerRow(1);
    };

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  return columnsPerRow;
};
