import { GitHubFile } from "@/lib/github";
import { useState } from "react";

interface LocalFile extends Partial<GitHubFile> {
  name: string;
  content: string;
}

interface FileTreeProps {
  files: (GitHubFile | LocalFile)[];
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onSelect: (file: GitHubFile | LocalFile) => void;
  onToggle: (path: string, isExpanded: boolean) => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: string;
  children?: TreeNode[];
  originalFile?: GitHubFile | LocalFile;
}

export default function FileTree({ files, selectedPath, expandedPaths, onSelect, onToggle }: FileTreeProps) {
  const toggleDir = (path: string) => {
    const isCurrentlyExpanded = expandedPaths.has(path);
    onToggle(path, !isCurrentlyExpanded);
  };

  // Build tree structure
  const root: TreeNode = { name: "root", path: "", type: "dir", children: [] };

  files.forEach(file => {
    if (!file.path) return;
    const parts = file.path.split('/');
    let current = root;

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join('/');

      let child = current.children?.find(c => c.name === part);
      if (!child) {
        child = {
          name: part,
          path,
          type: isLast ? (file.type || "file") : "dir",
          children: isLast && file.type !== "dir" ? undefined : [],
          originalFile: isLast ? file : undefined
        };
        current.children?.push(child);
      }
      current = child;
    });
  });

  const renderTree = (node: TreeNode, depth: number = 0): React.ReactNode => {
    // Skip rendering the root node itself
    if (depth === 0) {
      return node.children?.sort((a,b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1)).map(child => renderTree(child, depth + 1));
    }

    const isSelected = selectedPath === node.path;

    if (node.type === "dir") {
      const isExpanded = expandedPaths.has(node.path);
      return (
        <div key={node.path} className="ml-2">
          <button
            className="flex items-center gap-1 py-1 px-2 text-sm text-gray-700 dark:text-gray-300 font-medium w-full text-left hover:bg-gray-100 dark:hover:bg-zinc-800 rounded"
            onClick={() => toggleDir(node.path)}
          >
            <span className="text-gray-400 w-4 inline-block text-center">{isExpanded ? "📂" : "📁"}</span> {node.name}
          </button>
          {isExpanded && (
            <div className="ml-2 border-l border-gray-200 dark:border-zinc-700 pl-1">
              {node.children?.sort((a,b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1)).map(child => renderTree(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // Only show .tex files usually, but let's keep it general
    return (
      <button
        key={node.path}
        className={`w-full text-left px-2 py-1 ml-2 text-sm rounded ${
          isSelected
            ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100 font-medium'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
        }`}
        onClick={() => node.originalFile && onSelect(node.originalFile)}
      >
        <span className="text-gray-400 mr-1">📄</span> {node.name}
      </button>
    );
  };

  return <div className="font-mono text-sm">{renderTree(root)}</div>;
}
