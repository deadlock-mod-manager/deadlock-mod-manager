import JSZip from "jszip";
import { useCallback, useRef, useState } from "react";

interface ZipState {
  files: string[];
  fileName: string | null;
  loading: boolean;
  error: string | null;
}

export function useZipFiles() {
  const [state, setState] = useState<ZipState>({
    files: [],
    fileName: null,
    loading: false,
    error: null,
  });
  const zipRef = useRef<JSZip | null>(null);

  const loadZip = useCallback(async (file: File) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const zip = await JSZip.loadAsync(file);
      zipRef.current = zip;
      const filePaths: string[] = [];
      zip.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir) {
          filePaths.push(relativePath);
        }
      });
      setState({
        files: filePaths.sort(),
        fileName: file.name,
        loading: false,
        error: null,
      });
      return filePaths;
    } catch {
      setState({
        files: [],
        fileName: null,
        loading: false,
        error: "Failed to read zip file. Make sure it is a valid .zip archive.",
      });
      return [];
    }
  }, []);

  const downloadWithMetadata = useCallback(
    async (metadata: Record<string, unknown>) => {
      if (!zipRef.current) return;

      const newZip = new JSZip();

      const entries = Object.entries(zipRef.current.files);
      for (const [path, entry] of entries) {
        if (!entry.dir) {
          const content = await entry.async("uint8array");
          newZip.file(path, content);
        }
      }

      newZip.file("dmm.json", JSON.stringify(metadata, null, 2));

      const blob = await newZip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const baseName = state.fileName?.replace(/\.zip$/i, "") ?? "mod-package";
      a.download = `${baseName}-with-metadata.zip`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [state.fileName],
  );

  const reset = useCallback(() => {
    zipRef.current = null;
    setState({ files: [], fileName: null, loading: false, error: null });
  }, []);

  return {
    ...state,
    loadZip,
    downloadWithMetadata,
    reset,
    hasZip: zipRef.current !== null,
  };
}
