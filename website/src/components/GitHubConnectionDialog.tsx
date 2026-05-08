import React, { useState, useEffect, useMemo } from "react";
import { GitBranch, X, Loader2, Search, Check, Folder, Plus, ExternalLink, HardDrive } from "lucide-react";
import { GitHubConfig, GitHubRepo, fetchUserRepositories, fetchRepoFolders } from "@/lib/github";
import { GITHUB_APP_INSTALL_URL } from "@/lib/constants";
import { Project } from "@/lib/db";

interface GitHubConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "login" | "setup";
  githubToken: string | null;
  githubUser: string | null;
  onLogin: () => void;
  onSignOut: () => void;
  onConnect: (config: GitHubConfig) => void;
  isExchangingCode: boolean;
  projects: Project[];
}

interface GitHubFolder {
  name: string;
  path: string;
}

export default function GitHubConnectionDialog({
  isOpen,
  onClose,
  mode,
  githubToken,
  githubUser,
  onLogin,
  onSignOut,
  onConnect,
  isExchangingCode,
  projects
}: GitHubConnectionDialogProps) {
  // Form states for Setup mode
  const [repoSearch, setRepoSearch] = useState("");
  const [userRepos, setUserRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<{ owner: string, repo: string, default_branch: string } | null>(null);
  const [folderPath, setFolderPath] = useState("");
  const [showExplorer, setShowExplorer] = useState(false);
  const [browsingPath, setBrowsingPath] = useState("");
  const [availableFolders, setAvailableFolders] = useState<GitHubFolder[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);

  useEffect(() => {
    if (isOpen && githubToken && mode === "setup") {
      const loadRepos = async () => {
        setIsLoadingRepos(true);
        try {
          const repos = await fetchUserRepositories(githubToken);
          setUserRepos(repos);
        } catch (e) {
          console.error("Failed to fetch GitHub repos", e);
        } finally {
          setIsLoadingRepos(false);
        }
      };
      loadRepos();
    }
  }, [isOpen, githubToken, mode]);

  useEffect(() => {
    const fetchFolders = async () => {
      if (githubToken && selectedRepo && showExplorer) {
        setIsLoadingFolders(true);
        try {
          const folders = await fetchRepoFolders(githubToken, selectedRepo.owner, selectedRepo.repo, browsingPath);
          setAvailableFolders(folders);
        } catch (e) {
          console.error("Failed to fetch folders", e);
        } finally {
          setIsLoadingFolders(false);
        }
      } else {
        setAvailableFolders([]);
      }
    };
    fetchFolders();
  }, [githubToken, selectedRepo, browsingPath, showExplorer]);

  const filteredRepos = useMemo(() => {
    if (!repoSearch) return userRepos;
    return userRepos.filter(r => r.full_name.toLowerCase().includes(repoSearch.toLowerCase()));
  }, [userRepos, repoSearch]);

  if (!isOpen) return null;

  const isSetup = mode === "setup";

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-nb-bg/80 backdrop-blur-md animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      <div className={`relative w-full ${isSetup && githubToken ? 'max-w-xl' : 'max-w-sm'} bg-nb-surface border border-nb-outline-variant/30 rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300 flex flex-col max-h-[90vh]`}>
        
        {/* Header */}
        <div className="p-8 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl ${isSetup ? 'bg-nb-tertiary/10 text-nb-tertiary' : 'bg-nb-primary/10 text-nb-primary'} flex items-center justify-center`}>
              <GitBranch size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-nb-on-surface">{isSetup ? 'Connect Repository' : 'Sign in with GitHub'}</h2>
              <p className="text-xs text-nb-on-surface-variant font-medium">
                {isSetup ? 'Link a repository to your workspace' : 'Authenticate to continue'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl hover:bg-nb-surface-low text-nb-on-surface-variant transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-8 flex-1 overflow-y-auto custom-scrollbar space-y-6 pb-8">
          {!githubToken ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-6">
              <div className="w-16 h-16 rounded-3xl bg-nb-surface-low border border-nb-outline-variant/30 flex items-center justify-center text-nb-on-surface-variant/40">
                {isExchangingCode ? <Loader2 size={32} className="text-nb-primary animate-spin" /> : <GitBranch size={32} />}
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-nb-on-surface">{isExchangingCode ? 'Signing in...' : 'Sign in Required'}</h3>
                <p className="text-xs text-nb-on-surface-variant max-w-[280px] mx-auto">
                  {isExchangingCode 
                    ? 'Completing GitHub authentication. This will only take a moment.' 
                    : 'Authenticate with GitHub to discover your repositories and enable cloud synchronization.'}
                </p>
              </div>
              {!isExchangingCode && (
                <button
                  onClick={onLogin}
                  className="w-full bg-nb-primary hover:bg-nb-primary-dim text-white py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-nb-primary/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <GitBranch size={18} />
                  Continue with GitHub
                </button>
              )}
            </div>
          ) : isSetup ? (
            <>
              {/* Status Bar */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-nb-surface-low border border-nb-outline-variant/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-nb-primary text-white flex items-center justify-center font-bold text-[9px]">
                    {githubUser?.[0]?.toUpperCase() || "U"}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black text-nb-on-surface leading-none tracking-tight">{githubUser || "GitHub User"}</span>
                    <span className="text-[8px] text-nb-primary font-black uppercase tracking-wider">Authorized</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={GITHUB_APP_INSTALL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] font-black text-nb-on-surface-variant hover:text-nb-primary transition-colors uppercase tracking-[0.1em] flex items-center gap-1"
                  >
                    Permissions <ExternalLink size={10} />
                  </a>
                  <button
                    onClick={onSignOut}
                    className="text-[9px] font-black text-nb-on-surface-variant hover:text-red-500 transition-colors uppercase tracking-[0.1em] cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              </div>

              {/* Repo Selection */}
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black tracking-[0.15em] text-nb-on-surface-variant uppercase ml-1">Select Repository</label>
                  <div className="space-y-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40" />
                      <input
                        type="text"
                        placeholder="Search your repositories..."
                        className="w-full bg-nb-surface-low border border-nb-outline-variant/30 pl-10 pr-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-nb-primary/30 transition-all"
                        value={repoSearch}
                        onChange={(e) => setRepoSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-[140px] overflow-y-auto custom-scrollbar bg-nb-surface-low border border-nb-outline-variant/20 rounded-2xl p-1">
                      {isLoadingRepos ? (
                        <div className="py-6 flex items-center justify-center">
                          <Loader2 size={18} className="text-nb-primary animate-spin" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-0.5">
                          {filteredRepos.length === 0 ? (
                            <div className="py-5 px-5 text-center space-y-4">
                              <div className="text-[9px] text-nb-on-surface-variant font-black uppercase tracking-widest opacity-40">No repositories found</div>
                              <a href={GITHUB_APP_INSTALL_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-nb-primary/10 text-nb-primary text-[10px] font-bold hover:bg-nb-primary/20 transition-all">
                                Install GitHub App <Plus size={12} />
                              </a>
                            </div>
                          ) : (
                            filteredRepos.map(repo => {
                              const isAlreadyUsed = projects.some(p => 
                                p.type === "github" && 
                                p.githubConfig?.owner === repo.owner.login && 
                                p.githubConfig?.repo === repo.name
                              );
                              
                              return (
                                <button
                                  key={repo.id}
                                  onClick={() => {
                                    if (isAlreadyUsed) return;
                                    setSelectedRepo({ owner: repo.owner.login, repo: repo.name, default_branch: repo.default_branch });
                                    setBrowsingPath("");
                                    setFolderPath("");
                                  }}
                                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all text-left ${
                                    selectedRepo?.repo === repo.name 
                                      ? "bg-nb-primary text-white shadow-lg shadow-nb-primary/20 cursor-pointer" 
                                      : isAlreadyUsed 
                                        ? "opacity-50 grayscale-[0.5] cursor-not-allowed" 
                                        : "hover:bg-nb-surface-mid text-nb-on-surface cursor-pointer"
                                  }`}
                                >
                                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${selectedRepo?.repo === repo.name ? "bg-white/20" : "bg-nb-surface-low border border-nb-outline-variant/20"}`}>
                                    <GitBranch size={12} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] font-bold truncate block">{repo.name}</span>
                                      {isAlreadyUsed && <span className="text-[7px] font-black uppercase tracking-tighter bg-nb-on-surface-variant/10 px-1 rounded text-nb-on-surface-variant/60">Connected</span>}
                                    </div>
                                    <span className={`text-[8px] block truncate uppercase tracking-wider font-black opacity-60 ${selectedRepo?.repo === repo.name ? "text-white" : "text-nb-on-surface-variant"}`}>{repo.owner.login}</span>
                                  </div>
                                  {selectedRepo?.repo === repo.name && <Check size={12} className="shrink-0" />}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {selectedRepo && (
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black tracking-[0.15em] text-nb-on-surface-variant uppercase ml-1">Project Folder</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Folder size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-nb-on-surface-variant/40" />
                          <input
                            type="text"
                            value={folderPath}
                            onChange={(e) => setFolderPath(e.target.value)}
                            placeholder="e.g. notebook (leave empty for root)"
                            className="w-full bg-nb-surface-low border border-nb-outline-variant/30 pl-10 pr-4 py-3 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-nb-primary/30 transition-all"
                          />
                        </div>
                        <button
                          onClick={() => setShowExplorer(!showExplorer)}
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${showExplorer ? "bg-nb-primary text-white" : "bg-nb-surface-low border border-nb-outline-variant/30 text-nb-on-surface-variant hover:border-nb-primary/50"}`}
                        >
                          <Search size={18} />
                        </button>
                      </div>
                    </div>

                    {showExplorer && (
                      <div className="bg-nb-surface-low border border-nb-outline-variant/30 rounded-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-4 py-2 bg-nb-surface-low border-b border-nb-outline-variant/20 flex items-center gap-2 overflow-x-auto no-scrollbar">
                          <button onClick={() => setBrowsingPath("")} className={`text-[10px] font-black hover:text-nb-primary transition-colors shrink-0 uppercase tracking-widest ${browsingPath === "" ? "text-nb-primary" : "text-nb-on-surface-variant/40"}`}>ROOT</button>
                          {browsingPath.split("/").filter(Boolean).map((part, i, arr) => (
                            <React.Fragment key={i}>
                              <span className="text-[10px] text-nb-on-surface-variant/20">/</span>
                              <button onClick={() => setBrowsingPath(arr.slice(0, i + 1).join("/"))} className={`text-[10px] font-black hover:text-nb-primary transition-colors shrink-0 uppercase tracking-widest ${i === arr.length - 1 ? "text-nb-primary" : "text-nb-on-surface-variant/40"}`}>{part}</button>
                            </React.Fragment>
                          ))}
                        </div>
                        <div className="max-h-[140px] overflow-y-auto custom-scrollbar p-1">
                          {isLoadingFolders ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 size={18} className="text-nb-primary animate-spin" />
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-0.5">
                              {availableFolders.length === 0 ? (
                                <div className="py-8 text-center text-[9px] font-black uppercase tracking-widest text-nb-on-surface-variant/40">Empty</div>
                              ) : (
                                availableFolders.map(folder => (
                                  <button
                                    key={folder.path}
                                    onClick={() => setFolderPath(folder.path)}
                                    onDoubleClick={() => { setBrowsingPath(folder.path); setFolderPath(folder.path); }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all text-left group cursor-pointer ${folderPath === folder.path ? "bg-nb-primary/10 text-nb-primary" : "hover:bg-nb-surface-mid text-nb-on-surface"}`}
                                  >
                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${folderPath === folder.path ? "bg-nb-primary/20" : "bg-nb-surface-low border border-nb-outline-variant/20"}`}><Folder size={12} /></div>
                                    <span className="text-[11px] font-bold truncate flex-1">{folder.name}</span>
                                    {folderPath === folder.path && <Check size={12} className="text-nb-primary" />}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="p-3.5 rounded-2xl bg-nb-surface-low border border-nb-outline-variant/10 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-nb-primary/10 text-nb-primary flex items-center justify-center shrink-0"><HardDrive size={16} /></div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-nb-on-surface-variant/60">Target Workspace</span>
                          <span className="text-[11px] font-mono font-bold text-nb-on-surface truncate">{selectedRepo.owner}/{selectedRepo.repo}<span className="text-nb-primary/40">/</span>{folderPath}</span>
                        </div>
                      </div>
                      <Check size={16} className={folderPath ? "text-nb-primary" : "text-nb-on-surface-variant/20"} />
                    </div>
                  </div>
                )}
              </div>

              <button
                disabled={!selectedRepo}
                onClick={() => {
                  if (!selectedRepo) return;
                  const base = folderPath.trim();
                  const prefix = base ? (base.endsWith('/') ? base : base + '/') : "";
                  onConnect({
                    token: githubToken!,
                    owner: selectedRepo.owner,
                    repo: selectedRepo.repo,
                    branch: selectedRepo.default_branch,
                    baseDir: base,
                    entriesDir: `${prefix}data/entries`,
                    resourcesDir: `${prefix}data/assets`
                  });
                }}
                className="w-full bg-nb-primary hover:bg-nb-primary-dim disabled:opacity-50 text-white py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-nb-primary/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus size={18} /> Connect Repository
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-6">
              <div className="w-16 h-16 rounded-3xl bg-nb-surface-low border border-nb-outline-variant/20 flex items-center justify-center text-nb-primary">
                <Check size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-nb-on-surface">Already Signed In</h3>
                <p className="text-xs text-nb-on-surface-variant">You are authorized as <span className="font-bold">{githubUser}</span></p>
              </div>
              <button onClick={onClose} className="w-full bg-nb-primary text-white py-4 rounded-2xl font-bold text-sm">Continue</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
