import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import { restrictToVerticalAxis } from "@/lib/mods/load-order-drag";
import { cn } from "@/lib/utils";

export interface OrderedVpkFile {
  vpk: string;
  name: string;
  archiveName?: string;
}

interface ModFileOrderProps {
  modName: string;
  files: OrderedVpkFile[];
  authorOrder?: string[];
  onChange: (files: OrderedVpkFile[]) => void;
}

const SortableFileRow = ({
  file,
  position,
}: {
  file: OrderedVpkFile;
  position: number;
}) => {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file.vpk });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex cursor-grab touch-none items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-foreground/5 active:cursor-grabbing",
        isDragging &&
          "relative z-10 bg-popover shadow-lg ring-1 ring-primary/30",
      )}
      {...listeners}>
      <button
        ref={setActivatorNodeRef}
        type='button'
        aria-label={t("modOrdering.dragFile", { name: file.name })}
        className='w-6 shrink-0 rounded text-center font-semibold text-muted-foreground text-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
        {...attributes}>
        {position}
      </button>
      <div className='min-w-0 flex-1'>
        <p className='truncate font-mono text-xs'>{file.name}</p>
        {file.archiveName && (
          <p className='truncate text-[11px] text-muted-foreground'>
            {file.archiveName}
          </p>
        )}
      </div>
    </li>
  );
};

export const ModFileOrder = ({
  modName,
  files,
  authorOrder,
  onChange,
}: ModFileOrderProps) => {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = files.findIndex((file) => file.vpk === active.id);
    const to = files.findIndex((file) => file.vpk === over.id);
    onChange(arrayMove(files, from, to));
  };

  const differsFromAuthor =
    !!authorOrder &&
    authorOrder.some((name, index) => files[index]?.name !== name);

  const applyAuthorOrder = () => {
    if (!authorOrder) return;
    const byName = new Map(files.map((file) => [file.name, file]));
    onChange(authorOrder.flatMap((name) => byName.get(name) ?? []));
  };

  return (
    <div
      className='pr-2 pb-2 pl-[60px]'
      aria-label={t("modOrdering.filesOf", { name: modName })}
      role='group'>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}>
        <SortableContext
          items={files.map((file) => file.vpk)}
          strategy={verticalListSortingStrategy}>
          <ol>
            {files.map((file, index) => (
              <SortableFileRow
                key={file.vpk}
                file={file}
                position={index + 1}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {differsFromAuthor && (
        <button
          type='button'
          onClick={applyAuthorOrder}
          className='mt-1 ml-2 rounded text-muted-foreground text-xs underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'>
          {t("modOrdering.useAuthorOrder")}
        </button>
      )}
    </div>
  );
};
