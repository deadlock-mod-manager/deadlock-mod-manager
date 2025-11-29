import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deadlock-mods/ui/components/collapsible";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
} from "@deadlock-mods/ui/icons";
import type { VpkEntry } from "@deadlock-mods/vpk-parser";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface VpkEntriesDisplayProps {
  entries: VpkEntry[];
}

interface FileTreeNode {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  children: Map<string, FileTreeNode>;
  entry?: VpkEntry;
}

const buildFileTree = (entries: VpkEntry[]): FileTreeNode => {
  const root: FileTreeNode = {
    name: "",
    fullPath: "",
    isDirectory: true,
    children: new Map(),
  };

  for (const entry of entries) {
    const pathParts = entry.fullPath.split("/").filter(Boolean);
    let currentNode = root;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const isLastPart = i === pathParts.length - 1;
      const fullPath = pathParts.slice(0, i + 1).join("/");

      if (!currentNode.children.has(part)) {
        currentNode.children.set(part, {
          name: part,
          fullPath,
          isDirectory: !isLastPart,
          children: new Map(),
          entry: isLastPart ? entry : undefined,
        });
      }

      currentNode = currentNode.children.get(part)!;
    }
  }

  return root;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
};

const getFileTypeFromExtension = (ext: string): string => {
  const fileTypes: Record<string, string> = {
    vmdl: "Model",
    vmat: "Material",
    vtex: "Texture",
    vsnd: "Sound",
    vpcf: "Particle",
    vjs: "Script",
    lua: "Script",
    txt: "Text",
    cfg: "Config",
    json: "Data",
    xml: "Data",
    vdf: "Data",
  };
  return fileTypes[ext.toLowerCase()] || "File";
};

interface FileTreeNodeComponentProps {
  node: FileTreeNode;
  level: number;
}

const FileTreeNodeComponent = ({ node, level }: FileTreeNodeComponentProps) => {
  const [isOpen, setIsOpen] = useState(level < 2);

  if (node.isDirectory && node.children.size > 0) {
    const childrenArray = Array.from(node.children.values()).sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className='w-full justify-start h-auto p-1 hover:bg-muted/50'
            style={{ paddingLeft: `${level * 12 + 4}px` }}>
            {isOpen ? (
              <ChevronDown className='w-3 h-3 mr-1 shrink-0' />
            ) : (
              <ChevronRight className='w-3 h-3 mr-1 shrink-0' />
            )}
            <Folder className='w-3 h-3 mr-2 shrink-0 text-blue-500' />
            <span className='text-xs truncate'>{node.name}</span>
            <Badge variant='secondary' className='ml-auto text-xs h-4 px-1'>
              {node.children.size}
            </Badge>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {childrenArray.map((child) => (
            <FileTreeNodeComponent
              key={child.fullPath}
              node={child}
              level={level + 1}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  if (node.entry) {
    const fileType = getFileTypeFromExtension(node.entry.ext);
    const fileSize = formatFileSize(node.entry.entryLength);

    return (
      <div
        className='flex items-center py-1 px-1 hover:bg-muted/30 rounded'
        style={{ paddingLeft: `${level * 12 + 4}px` }}>
        <File className='w-3 h-3 mr-2 shrink-0 text-muted-foreground' />
        <span className='text-xs truncate flex-1'>{node.name}</span>
        <div className='flex items-center gap-1 ml-2 shrink-0'>
          <Badge variant='outline' className='text-xs h-4 px-1'>
            {fileType}
          </Badge>
          <span className='text-xs text-muted-foreground'>{fileSize}</span>
        </div>
      </div>
    );
  }

  return null;
};

export const VpkEntriesDisplay = ({ entries }: VpkEntriesDisplayProps) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  if (!entries || entries.length === 0) {
    return (
      <div className='text-xs text-muted-foreground p-2'>
        {t("addons.noEntriesFound")}
      </div>
    );
  }

  const fileTree = buildFileTree(entries);
  const totalSize = entries.reduce((sum, entry) => sum + entry.entryLength, 0);

  const fileTypeCounts = entries.reduce(
    (acc, entry) => {
      const type = getFileTypeFromExtension(entry.ext);
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const topFileTypes = Object.entries(fileTypeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <span className='text-xs font-medium'>{t("addons.vpkContents")}</span>
          <Badge variant='secondary' className='text-xs h-4 px-1'>
            {entries.length} {t("addons.files")}
          </Badge>
          <span className='text-xs text-muted-foreground'>
            {formatFileSize(totalSize)}
          </span>
        </div>
      </div>

      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className='flex flex-wrap gap-1 items-center'>
          <CollapsibleTrigger asChild>
            <Button variant='text' size='sm' className='h-6 text-xs p-0'>
              {isExpanded ? (
                <>
                  <ChevronDown className='w-3 h-3 mr-1' />
                  {t("addons.hide")}
                </>
              ) : (
                <>
                  <ChevronRight className='w-3 h-3 mr-1' />
                  {t("addons.show")}
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          {topFileTypes.map(([type, count]) => (
            <Badge key={type} variant='outline' className='text-xs h-4 px-1'>
              {count} {type}
              {count > 1 ? "s" : ""}
            </Badge>
          ))}
          {Object.keys(fileTypeCounts).length > 3 && (
            <Badge variant='outline' className='text-xs h-4 px-1'>
              +{Object.keys(fileTypeCounts).length - 3} more
            </Badge>
          )}
        </div>

        <CollapsibleContent>
          <div className='border rounded-md bg-muted/20'>
            <ScrollArea className='h-[200px]'>
              <div className='p-2'>
                {Array.from(fileTree.children.values())
                  .sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((child) => (
                    <FileTreeNodeComponent
                      key={child.fullPath}
                      node={child}
                      level={0}
                    />
                  ))}
              </div>
            </ScrollArea>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
