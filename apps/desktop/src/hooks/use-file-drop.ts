import { useCallback, useEffect, useState } from 'react';
import {
  type DetectedSource,
  detectSource,
  readFromDataTransferItems,
} from '@/lib/file-utils';

/**
 * Custom hook for handling file drag and drop functionality
 */
export const useFileDrop = (
  onFilesDetected: (source: DetectedSource) => void,
  onError: (message: string) => void
) => {
  const [isDragging, setIsDragging] = useState(false);

  const preventDefaults = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  useEffect(() => {
    // Prevent default drag behaviors on the entire window
    window.addEventListener('dragenter', preventDefaults, { passive: false });
    window.addEventListener('dragover', preventDefaults, { passive: false });
    window.addEventListener('drop', preventDefaults, { passive: false });

    return () => {
      window.removeEventListener('dragenter', preventDefaults);
      window.removeEventListener('dragover', preventDefaults);
      window.removeEventListener('drop', preventDefaults);
    };
  }, [preventDefaults]);

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    if (event.currentTarget === event.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);

      let files = Array.from(event.dataTransfer.files || []);

      // Handle case where files are empty but we have data transfer items
      if (
        (!files.length || files.every((f) => !f)) &&
        event.dataTransfer.items?.length
      ) {
        const fromItems = await readFromDataTransferItems(
          event.dataTransfer.items
        );
        if (fromItems.length) {
          files = fromItems;
        }
      }

      const detectedSource = detectSource(files);
      if (!detectedSource) {
        onError(
          'Unsupported files. Please select VPK files or archives (ZIP, RAR, 7Z).'
        );
        return;
      }

      onFilesDetected(detectedSource);
    },
    [onFilesDetected, onError]
  );

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      const detectedSource = detectSource(files);

      if (!detectedSource) {
        onError(
          'Unsupported selection. Please select VPK files or archives (ZIP, RAR, 7Z).'
        );
        return;
      }

      onFilesDetected(detectedSource);
    },
    [onFilesDetected, onError]
  );

  return {
    isDragging,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
    onFileSelect: handleFileSelect,
  };
};
