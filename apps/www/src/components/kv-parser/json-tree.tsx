import type { KeyValuesValue } from "@deadlock-mods/kv-parser";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { ChevronDown, ChevronRight, Copy } from "@deadlock-mods/ui/icons";
import { useEffect, useState } from "react";

interface JsonTreeProps {
  data: KeyValuesValue;
  name?: string;
  level?: number;
  expandOverride?: boolean | null;
}

function getValueType(value: KeyValuesValue): string {
  if (Array.isArray(value)) return "array";
  if (typeof value === "object" && value !== null) return "object";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  return "unknown";
}

function JsonTreeNode({
  data,
  name,
  level = 0,
  expandOverride = null,
}: JsonTreeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const valueType = getValueType(data);
  const isExpandable = valueType === "object" || valueType === "array";

  useEffect(() => {
    if (expandOverride !== null) {
      setIsExpanded(expandOverride);
    }
  }, [expandOverride]);

  const handleCopy = async () => {
    const value =
      typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);
    await navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  };

  const renderValue = () => {
    if (valueType === "string") {
      return (
        <span className='text-green-600 dark:text-green-400'>
          "{data.toString()}"
        </span>
      );
    }
    if (valueType === "number") {
      return (
        <span className='text-blue-600 dark:text-blue-400'>
          {data.toString()}
        </span>
      );
    }
    if (valueType === "array") {
      return (
        <span className='text-muted-foreground text-sm'>
          [{(data as unknown[]).length} items]
        </span>
      );
    }
    if (valueType === "object") {
      const keys = Object.keys(data as object);
      return (
        <span className='text-muted-foreground text-sm'>
          {"{"}
          {keys.length} {keys.length === 1 ? "key" : "keys"}
          {"}"}
        </span>
      );
    }
    return null;
  };

  const renderChildren = () => {
    if (!isExpanded) return null;

    if (valueType === "array") {
      return (
        <div className='ml-6 border-l border-muted-foreground/20 pl-2'>
          {(data as unknown[]).map((item, index) => (
            <JsonTreeNode
              data={item as KeyValuesValue}
              expandOverride={expandOverride}
              key={`item-${index}-${typeof item === "object" ? JSON.stringify(item).slice(0, 20) : item}`}
              level={level + 1}
              name={`[${index}]`}
            />
          ))}
        </div>
      );
    }

    if (valueType === "object") {
      return (
        <div className='ml-6 border-l border-muted-foreground/20 pl-2'>
          {Object.entries(data as object).map(([key, value]) => (
            <JsonTreeNode
              data={value as KeyValuesValue}
              expandOverride={expandOverride}
              key={key}
              level={level + 1}
              name={key}
            />
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <div className='py-1'>
      <div className='flex items-center gap-2 group'>
        {isExpandable ? (
          <button
            className='flex items-center justify-center w-5 h-5 hover:bg-muted rounded transition-colors'
            onClick={() => setIsExpanded(!isExpanded)}
            type='button'>
            {isExpanded ? (
              <ChevronDown className='h-4 w-4' />
            ) : (
              <ChevronRight className='h-4 w-4' />
            )}
          </button>
        ) : (
          <div className='w-5' />
        )}

        {name && (
          <span className='font-medium text-sm'>
            {name}
            <span className='text-muted-foreground'>: </span>
          </span>
        )}

        {renderValue()}

        <Badge className='ml-2' variant='secondary'>
          {valueType}
        </Badge>

        <Button
          className='opacity-0 group-hover:opacity-100 transition-opacity ml-auto'
          onClick={handleCopy}
          size='sm'
          type='button'
          variant='ghost'>
          <Copy className='h-3 w-3' />
        </Button>
      </div>

      {renderChildren()}
    </div>
  );
}

interface JsonTreeViewProps {
  data: KeyValuesValue;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
}

export function JsonTreeView({
  data,
  onExpandAll,
  onCollapseAll,
}: JsonTreeViewProps) {
  const [expandAll, setExpandAll] = useState<boolean | null>(null);

  const handleToggleExpand = () => {
    if (expandAll === true) {
      setExpandAll(false);
      onCollapseAll?.();
    } else {
      setExpandAll(true);
      onExpandAll?.();
    }
  };

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between'>
        <h3 className='font-semibold text-sm'>Parsed Structure</h3>
        <Button onClick={handleToggleExpand} size='sm' variant='outline'>
          {expandAll === true ? "Collapse All" : "Expand All"}
        </Button>
      </div>
      <div className='rounded-lg border border-muted-foreground/20 bg-muted/10 p-4 overflow-auto max-h-[600px]'>
        <JsonTreeNode
          data={data}
          expandOverride={
            expandAll === true ? true : expandAll === false ? false : null
          }
        />
      </div>
    </div>
  );
}
