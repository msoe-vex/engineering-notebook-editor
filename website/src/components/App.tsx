import { useState, useEffect, useCallback } from "react";
import { GitHubConfig, fetchDirectoryTree, fetchFileContent, GitHubFile } from "@/lib/github";
import Settings from "./Settings";
import Editor from "./Editor";
import Preview from "./Preview";
import FileTree from "./FileTree";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

// Extend GitHubFile for local memory
interface LocalFile extends Partial<GitHubFile> {
  name: string;
  content: string;
}

export default function App() {
  const [config, setConfig] = useState<GitHubConfig | null>(null);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [entriesDirName, setEntriesDirName] = useState("notebook/entries");
  const [resourcesDirName, setResourcesDirName] = useState("notebook/resources");
  const [entries, setEntries] = useState<(GitHubFile | LocalFile)[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);

  // State for editor
  const [editorContent, setEditorContent] = useState("");
  const [editorTitle, setEditorTitle] = useState("");
  const [editorAuthor, setEditorAuthor] = useState("");
  const [editorPhase, setEditorPhase] = useState("");
  const [latexContent, setLatexContent] = useState("");
  const [styContent, setStyContent] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  const getLocalFileContent = async (rootHandle: FileSystemDirectoryHandle, path: string): Promise<string> => {
    const parts = path.split('/');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let currentHandle: any = rootHandle;
    for (let i = 0; i < parts.length - 1; i++) {
       currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
    }
    const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();

    // Check if it's an image
    if (file.type.startsWith('image/')) {
       return new Promise((resolve, reject) => {
         const reader = new FileReader();
         reader.onload = () => {
           const b64 = (reader.result as string).split(',')[1];
           resolve(b64);
         };
         reader.onerror = reject;
         reader.readAsDataURL(file);
       });
    }

    return await file.text();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadLocalDirectory = async (handle: any, currentPath = ""): Promise<LocalFile[]> => {
    let files: LocalFile[] = [];
    for await (const entry of handle.values()) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "website" || entry.name === ".next") continue;
      const path = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      if (entry.kind === "file") {
         files.push({
           name: entry.name,
           path: path,
           type: "file",
           content: "" // We will load content on demand
         });
      } else if (entry.kind === "directory") {
         files.push({
           name: entry.name,
           path: path,
           type: "dir",
           content: ""
         });
         const subFiles = await loadLocalDirectory(entry, path);
         files = files.concat(subFiles);
      }
    }
    return files;
  };

  const loadEntries = useCallback(async () => {
    if (isLocalMode && !dirHandle) return;
    if (isLocalMode && dirHandle) {
      try {
        const localTree = await loadLocalDirectory(dirHandle);
        setEntries(localTree);

        // Find sty file locally
        const styFile = localTree.find(f => f.name === 'vex_notebook.sty');
        if (styFile && styFile.path) {
          const content = await getLocalFileContent(dirHandle, styFile.path);
          setStyContent(content);
        }
      } catch (error) {
        console.error("Failed to load local directory", error);
        alert("Failed to load local directory.");
      }
      return;
    }

    if (!config) return;
    try {
      const fetchedTree = await fetchDirectoryTree(config);
      setEntries(fetchedTree);
    } catch (error) {
      console.error("Failed to load tree", error);
      alert("Failed to load tree. Check your configuration.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, isLocalMode, dirHandle]);

  useEffect(() => {
    if (!isLocalMode && config) {
      const init = async () => {
         try {
           const fetchedTree = await fetchDirectoryTree(config);
           setEntries(fetchedTree);

           // Look for vex_notebook.sty and fetch its content
           const styFile = fetchedTree.find((f: GitHubFile) => f.name === 'vex_notebook.sty');
           if (styFile && styFile.path) {
             const content = await fetchFileContent(config, styFile.path);
             setStyContent(content);
           }
         } catch (error) {
           console.error("Failed to load tree or sty", error);
         }
      };
      init();
    } else if (isLocalMode && dirHandle) {
       setTimeout(() => loadEntries(), 0);
    } else if (isLocalMode && !dirHandle) {
      // Clear entries when swapping to memory local mode
      setTimeout(() => {
        setEntries([]);
        setSelectedEntry("");
        setEditorTitle("");
        setEditorAuthor("");
        setEditorPhase("");
        setEditorContent("");
        setLatexContent("");
      }, 0);
    }
  }, [config, isLocalMode, dirHandle, loadEntries]);

  const handleSelectEntry = async (file: GitHubFile | LocalFile) => {
    if (!file.path && !file.name) return;
    if (file.type === "dir") return; // Do not select directories

    setIsLoading(true);
    try {
      let content = "";
      if (isLocalMode && dirHandle && file.path) {
         try {
           content = await getLocalFileContent(dirHandle, file.path);
           // Also update the state content cache
           setEntries(prev => prev.map(e => e.path === file.path ? { ...e, content } : e));
         } catch (e: unknown) {
            setEditorContent("This file can't be opened directly in the editor.");
            setEditorTitle(file.name || "Untitled");
            setLatexContent("This file can't be opened directly in the editor.");
            setSelectedEntry(file.path || file.name);
            setIsLoading(false);
            return;
         }
      } else if (isLocalMode) {
        content = (file as LocalFile).content || "";
      } else if (config && file.path) {
        try {
          content = await fetchFileContent(config, file.path);
        } catch (e: unknown) {
          const err = e as Error;
          if (err.message?.includes("URI malformed") || err.message?.includes("UTF-8") || err.message?.includes("decode")) {
            setEditorContent("This file can't be opened directly in the editor as it is not UTF-8 encoded plain text.");
            setEditorTitle(file.name || "Untitled");
            setLatexContent("This file can't be opened directly in the editor as it is not UTF-8 encoded plain text.");
            setSelectedEntry(file.path || file.name);
            setIsLoading(false);
            return;
          }
          throw e;
        }
      }

      // We only attempt to parse .tex files
      if (file.name && file.name.endsWith(".tex")) {
        // Basic parsing of latex string back to form fields
        // Matches \newentry{Title}{Date}{Author}{Phase}
        const entryMatch = content.match(/\\newentry{(.*?)}{(.*?)}{(.*?)}{(.*?)}/);

        if (entryMatch) {
           setEditorTitle(entryMatch[1] || "");
           setEditorAuthor(entryMatch[3] || "");
           setEditorPhase(entryMatch[4] || "");
        } else {
           // Fallback for older \chapter template style
           const titleMatch = content.match(/\\chapter{(.*?)}/);
           const authorMatch = content.match(/\\textbf{Author:}\s*(.*?)\s*\\\\/);
           const phaseMatch = content.match(/\\textbf{Phase:}\s*(.*?)\n/);

           setEditorTitle(titleMatch ? titleMatch[1] : "");
           setEditorAuthor(authorMatch ? authorMatch[1] : "");
           setEditorPhase(phaseMatch ? phaseMatch[1] : "");
        }

        // Content is everything after the entry macro or phase macro:
        let contentStart = 0;
        if (entryMatch) {
           contentStart = content.indexOf(entryMatch[0]) + entryMatch[0].length;
        } else {
           const phaseMatch = content.match(/\\textbf{Phase:}\s*(.*?)\n/);
           contentStart = phaseMatch ? content.indexOf(phaseMatch[0]) + phaseMatch[0].length : 0;
        }
        setEditorContent(content.substring(contentStart).trim());

        setLatexContent(content);
        setSelectedEntry(file.path || file.name);
      } else {
        // Just show raw content for non-tex files or let them download it
        setEditorContent(content);
        setEditorTitle(file.name || "Untitled");
        setLatexContent(content);
        setSelectedEntry(file.path || file.name);
      }
    } catch (error) {
      console.error("Failed to fetch file content", error);
      alert("Failed to fetch file content");
    } finally {
      setIsLoading(false);
    }
  };

  const writeLocalFile = async (path: string, content: string | Uint8Array) => {
    if (!dirHandle) return;
    try {
       const parts = path.split('/');
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       let currentHandle: any = dirHandle;
       // Create missing directories
       for (let i = 0; i < parts.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
       }
       const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1], { create: true });
       const writable = await fileHandle.createWritable();
       await writable.write(content);
       await writable.close();

       // Reload directory to update tree
       loadEntries();
    } catch (e) {
       console.error("Failed to write local file", e);
    }
  };

  const deleteLocalFile = async (path: string) => {
    if (!dirHandle) return;
    try {
       const parts = path.split('/');
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       let currentHandle: any = dirHandle;
       for (let i = 0; i < parts.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
       }
       await currentHandle.removeEntry(parts[parts.length - 1]);

       loadEntries();
    } catch (e) {
       console.error("Failed to delete local file", e);
    }
  };

  const handleEntrySaved = (path: string, content: string) => {
    if (isLocalMode && dirHandle) {
       writeLocalFile(path, content);
    } else if (isLocalMode) {
      setEntries(prev => {
        const existingIdx = prev.findIndex(e => e.path === path);
        if (existingIdx >= 0) {
          const newEntries = [...prev];
          (newEntries[existingIdx] as LocalFile).content = content;
          return newEntries;
        }
        return [...prev, { name: path.split('/').pop() || path, path, content, type: 'file', sha: '', size: content.length, url: '', html_url: '', git_url: '', download_url: null }];
      });
    } else {
      loadEntries();
    }
  };

  const handleImageUploaded = (path: string, content: string) => {
    if (isLocalMode && dirHandle) {
       // Convert base64 back to Uint8Array
       const binaryString = window.atob(content);
       const len = binaryString.length;
       const bytes = new Uint8Array(len);
       for (let i = 0; i < len; i++) {
           bytes[i] = binaryString.charCodeAt(i);
       }
       writeLocalFile(path, bytes);
    } else if (isLocalMode) {
      setEntries(prev => {
        const existingIdx = prev.findIndex(e => e.path === path);
        if (existingIdx >= 0) {
          const newEntries = [...prev];
          (newEntries[existingIdx] as LocalFile).content = content; // store base64 string
          return newEntries;
        }
        return [...prev, { name: path.split('/').pop() || path, path, content, type: 'file', sha: '', size: content.length, url: '', html_url: '', git_url: '', download_url: null }];
      });
    } else {
      loadEntries();
    }
  };

  const handleEntryDeleted = (path: string) => {
    if (isLocalMode && dirHandle) {
       deleteLocalFile(path);
       handleNewEntry();
    } else if (isLocalMode) {
      setEntries(prev => prev.filter(e => e.path !== path));
      handleNewEntry();
    } else {
      loadEntries();
      handleNewEntry();
    }
  };

  const handleNewEntry = () => {
    setSelectedEntry("");
    setEditorTitle("");
    setEditorAuthor("");
    setEditorPhase("");
    setEditorContent("");
    setLatexContent("");
  };

  if (!config && !isLocalMode) {
    return (
      <Settings
        onSave={setConfig}
        onWorkOffline={() => setIsLocalMode(true)}
        onOpenLocalFolder={(handle, entriesDir, resourcesDir) => {
          setDirHandle(handle);
          setEntriesDirName(entriesDir);
          setResourcesDirName(resourcesDir);
          setIsLocalMode(true);
        }}
      />
    );
  }

  const appConfig = config || { owner: "Local", repo: "Workspace", token: "", entriesDir: entriesDirName, resourcesDir: resourcesDirName };

  return (
    <div className="flex h-[calc(100vh-4rem)] max-h-screen bg-white dark:bg-zinc-950 rounded-lg shadow overflow-hidden border dark:border-zinc-800">
      <PanelGroup direction="horizontal">
        {/* Sidebar - File list */}
        <Panel defaultSize={20} minSize={15} maxSize={40} className="flex flex-col border-r bg-gray-50 dark:bg-zinc-900 dark:border-zinc-800">
          <div className="p-4 border-b dark:border-zinc-800 flex justify-between items-center">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">Files</h2>
            <button
              onClick={handleNewEntry}
              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
            >
              + New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {entries.length === 0 ? (
              <div className="p-2 text-sm text-gray-500 dark:text-gray-400">No files found.</div>
            ) : (
              <FileTree
                files={entries}
                selectedPath={selectedEntry}
                onSelect={handleSelectEntry}
              />
            )}
          </div>
          <div className="p-4 border-t text-xs text-gray-500">
            {isLocalMode && dirHandle ? (
              <>
                Local Folder Open
                <button onClick={() => {
                  setEntries([]);
                  setDirHandle(null);
                  handleNewEntry();
                  setIsLocalMode(false);
                }} className="ml-2 text-blue-600 underline">Close</button>
              </>
            ) : isLocalMode ? (
              <>
                Working Offline (Memory)
                <button onClick={() => {
                  setEntries([]);
                  handleNewEntry();
                  setIsLocalMode(false);
                }} className="ml-2 text-blue-600 underline">Connect GitHub</button>
              </>
            ) : (
              <>
                Connected as {config?.owner}/{config?.repo}
                <button onClick={() => {
                  setEntries([]);
                  handleNewEntry();
                  setConfig(null);
                }} className="ml-2 text-blue-600 underline">Disconnect</button>
              </>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-200 dark:bg-zinc-800 hover:bg-blue-400 transition-colors cursor-col-resize" />

        {/* Main Content - Editor & Preview */}
        <Panel defaultSize={80}>
          {selectedEntry !== null ? (
            <PanelGroup direction="horizontal">
              {isLoading ? (
                <div className="flex-1 flex items-center justify-center">Loading...</div>
              ) : (
                <>
                  <Panel defaultSize={50} minSize={30} className="flex flex-col h-full">
                    <Editor
                      config={appConfig}
                      isLocalMode={isLocalMode}
                      initialTitle={editorTitle}
                      initialAuthor={editorAuthor}
                      initialPhase={editorPhase}
                      initialContent={editorContent}
                      filename={selectedEntry}
                      onSaved={handleEntrySaved}
                      onDeleted={handleEntryDeleted}
                      onContentChange={(content) => setLatexContent(content)}
                      onImageUpload={handleImageUploaded}
                    />
                  </Panel>

                  <PanelResizeHandle className="w-1 bg-gray-200 dark:bg-zinc-800 hover:bg-blue-400 transition-colors cursor-col-resize" />

                  <Panel defaultSize={50} minSize={30} className="flex flex-col h-full">
                    <Preview latexContent={latexContent} styContent={styContent} files={entries} />
                  </Panel>
                </>
              )}
            </PanelGroup>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
              Select an entry from the sidebar or create a new one.
            </div>
          )}
        </Panel>
      </PanelGroup>
    </div>
  );
}
