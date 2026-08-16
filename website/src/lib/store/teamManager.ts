import { INDEX_PATH } from "../constants";
import { getPending } from "../db";
import { getMimeTypeFromExtension, blobFromBase64 } from "../utils";
import { TeamMetadata, ProjectPhase, dehydrateTeamAssets, validateNotebookIntegrity } from "../metadata";
import { IWorkspaceStore } from "./types";

export class TeamManager {
  private store: IWorkspaceStore;

  constructor(store: IWorkspaceStore) {
    this.store = store;
  }

  async saveTeam(team: TeamMetadata, phases?: ProjectPhase[]) {
    const oldMeta = this.store.metadata;
    const { cleanTeam, newAssets } = await dehydrateTeamAssets(team);

    // Memory update
    const updatedMeta = validateNotebookIntegrity({
      ...this.store.metadata,
      team: cleanTeam,
      phases: phases || this.store.metadata.phases || []
    });

    const metaStr = JSON.stringify(updatedMeta, null, 2);

    // Update memory (we'll keep the hydrated version in memory for the UI)
    const assetCache = new Map<string, string>();
    for (const asset of newAssets) {
      const dataUrl = `data:${getMimeTypeFromExtension(asset.path)};base64,${asset.base64}`;
      assetCache.set(asset.path, dataUrl);
      this.store.assetCache.set(asset.path, dataUrl); // Update global cache
    }

    this.store.metadata = { ...updatedMeta, team: cleanTeam }; // Metadata stays CLEAN
    this.store.notifyStateChange();

    return this.store.enqueue(async () => {
      for (const asset of newAssets) {
        await this.store.persistFile(asset.path, asset.base64, `Team asset`, true);
      }
      await this.store.reconcileAssetRefs(oldMeta.assetRefs || {}, updatedMeta.assetRefs || {});
      await this.store.persistFile(INDEX_PATH, metaStr, "Update team metadata");
      await this.store.updateLatexMetadata();
    });
  }

  async hydrateTeamAssetsOnDemand() {
    if (!this.store.metadata.team) return;
    const team = this.store.metadata.team;
    const tasks: Promise<void>[] = [];

    const fetchAsset = async (path: string) => {
      if (!path || path.startsWith('data:') || this.store.assetCache.has(path)) return;
      try {
        const b64 = await this.store.getAssetBase64(path);
        if (b64) {
          const dataUrl = `data:${getMimeTypeFromExtension(path)};base64,${b64}`;
          this.store.assetCache.set(path, dataUrl);
        }
      } catch (e) {
        console.warn(`[TeamManager] Failed to hydrate asset: ${path}`, e);
      }
    };

    if (team.logo) tasks.push(fetchAsset(team.logo));
    if (team.members) {
      for (const m of team.members) {
        if (m.image) tasks.push(fetchAsset(m.image));
      }
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
      this.store.notifyStateChange();
    }
  }

  async saveCompiledPdf(pdfData: Uint8Array) {
    const base64 = btoa(
      pdfData.reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    await this.store.enqueue(async () => {
      // 1. Persist main.pdf in root
      await this.store.persistFile("main.pdf", base64, "Compilation: Update main.pdf", true);

      // 2. Update lastCompiled timestamp in metadata
      this.store.metadata = {
        ...this.store.metadata,
        lastCompiled: new Date().toISOString()
      };

      // 3. Persist updated metadata
      await this.store.persistFile(INDEX_PATH, JSON.stringify(this.store.metadata, null, 2), "Update lastCompiled metadata");

      this.store.notifyStateChange();
    });
  }

  async getCompiledPdfUrl(): Promise<string | null> {
    const dbName = this.store.getDBName();

    // 1. Check pending changes
    const pending = await getPending(dbName, "main.pdf");
    if (pending && pending.content) {
      return blobFromBase64(pending.content);
    }

    // 2. Check memory cache / filesystem / GitHub
    const base64 = await this.store.getAssetBase64("main.pdf");
    if (base64) return blobFromBase64(base64);

    return null;
  }
}
