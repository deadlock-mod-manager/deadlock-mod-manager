import { Button } from "@deadlock-mods/ui/components/button";
import { GripVertical, RotateCcw } from "@deadlock-mods/ui/icons";
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
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file.vpk });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-md py-1 pr-2 pl-1 transition-colors hover:bg-muted/50",
        isDragging && "relative z-10 bg-muted shadow-md",
      )}>
      <button
        type='button'
        aria-label={t("modOrdering.dragFile", { name: file.name })}
        className='cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing'
        {...attributes}
        {...listeners}>
        <GripVertical className='h-3.5 w-3.5' />
      </button>
      <span className='w-5 shrink-0 text-right text-muted-foreground text-xs tabular-nums'>
        {position}
      </span>
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

  const canUseAuthorOrder =
    !!authorOrder &&
    authorOrder.some((name, index) => files[index]?.name !== name);

  const applyAuthorOrder = () => {
    if (!authorOrder) return;
    const byName = new Map(files.map((file) => [file.name, file]));
    onChange(authorOrder.flatMap((name) => byName.get(name) ?? []));
  };

  return (
    <div
      className='mt-1 ml-[3.25rem] border-l border-border/60 pl-3'
      aria-label={t("modOrdering.filesOf", { name: modName })}
      role='group'>
      <div className='flex items-center justify-between gap-2 py-1'>
        <p className='text-muted-foreground text-xs'>
          {t("modOrdering.filesHint")}
        </p>
        {canUseAuthorOrder && (
          <Button
            icon={<RotateCcw className='h-3 w-3' />}
            onClick={applyAuthorOrder}
            size='sm'
            className='h-6 px-2'
            variant='ghost'>
            {t("modOrdering.useAuthorOrder")}
          </Button>
        )}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}>
        <SortableContext
          items={files.map((file) => file.vpk)}
          strategy={verticalListSortingStrategy}>
          <ol className='space-y-0.5 pb-1'>
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
    </div>
  );
};
