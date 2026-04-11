import { cn } from "@deadlock-mods/ui/lib/utils";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { ChevronRight, File, Folder } from "lucide-react";
import { useState, useMemo } from "react";

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of paths) {
    const parts = filePath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const existingNode = current.find((n) => n.name === part);

      if (existingNode) {
        current = existingNode.children;
      } else {
        const newNode: TreeNode = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          isDirectory: !isLast,
          children: [],
        };
        current.push(newNode);
        current = newNode.children;
      }
    }
  }

  return sortTree(root);
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  nodes.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    node.children = sortTree(node.children);
  }
  return nodes;
}

interface FileTreeNodeProps {
  node: TreeNode;
  depth: number;
  selectedFiles?: Set<string>;
  onToggleFile?: (path: string) => void;
  selectable?: boolean;
}

function FileTreeNode({
  node,
  depth,
  selectedFiles,
  onToggleFile,
  selectable,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded px-2 py-0.5 text-sm hover:bg-accent/50",
          selectable && !node.isDirectory && "cursor-pointer",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (node.isDirectory) {
            setExpanded(!expanded);
          } else if (selectable && onToggleFile) {
            onToggleFile(node.path);
          }
        }}>
        {node.isDirectory ? (
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          />
        ) : (
          <span className='w-3.5' />
        )}
        {selectable && !node.isDirectory && (
          <Checkbox
            checked={selectedFiles?.has(node.path)}
            onCheckedChange={() => onToggleFile?.(node.path)}
            className='h-3.5 w-3.5'
          />
        )}
        {node.isDirectory ? (
          <Folder className='h-4 w-4 shrink-0 text-yellow-500/70' />
        ) : (
          <File className='h-4 w-4 shrink-0 text-muted-foreground' />
        )}
        <span className='truncate'>{node.name}</span>
      </div>
      {node.isDirectory && expanded && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFiles={selectedFiles}
              onToggleFile={onToggleFile}
              selectable={selectable}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FileTreeProps {
  files: string[];
  selectedFiles?: Set<string>;
  onToggleFile?: (path: string) => void;
  selectable?: boolean;
  className?: string;
  maxHeight?: string;
}

export function FileTree({
  files,
  selectedFiles,
  onToggleFile,
  selectable = false,
  className,
  maxHeight = "300px",
}: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);

  if (files.length === 0) {
    return (
      <div className='rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm'>
        No files found
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-y-auto rounded-lg border bg-card/50 p-2 font-mono text-xs",
        className,
      )}
      style={{ maxHeight }}>
      {tree.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedFiles={selectedFiles}
          onToggleFile={onToggleFile}
          selectable={selectable}
        />
      ))}
    </div>
  );
}
