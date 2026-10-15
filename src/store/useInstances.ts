/**
 * The instance library: summaries for the grid and an on-demand content cache
 * keyed by instance id.
 */
import { create } from "zustand";

import { instances as instancesApi, type CreateInstanceArgs } from "@/lib/api";
import type { ContentEntry, Instance, InstanceSummary } from "@/lib/tauri";

interface InstancesState {
  instances: InstanceSummary[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  content: Record<string, ContentEntry[]>;
  refresh: () => Promise<void>;
  get: (id: string) => Promise<Instance>;
  create: (args: CreateInstanceArgs) => Promise<Instance>;
  update: (instance: Instance) => Promise<Instance>;
  rename: (id: string, name: string) => Promise<void>;
  duplicate: (id: string, name?: string) => Promise<Instance>;
  remove: (id: string, deleteFiles: boolean) => Promise<void>;
  loadContent: (id: string) => Promise<ContentEntry[]>;
  toggleContent: (id: string, path: string, enabled: boolean) => Promise<void>;
  deleteContent: (id: string, path: string) => Promise<void>;
  importFiles: (id: string, paths: string[], folder?: string) => Promise<number>;
  clearError: () => void;
}

export const useInstances = create<InstancesState>((set, get) => ({
  instances: [],
  loading: false,
  loaded: false,
  error: null,
  content: {},

  clearError: () => set({ error: null }),

  refresh: async () => {
    set({ loading: true });
    try {
      const instances = await instancesApi.list();
      set({ instances, loaded: true, error: null });
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ loading: false });
    }
  },

  get: (id) => instancesApi.get(id),

  create: async (args) => {
    const instance = await instancesApi.create(args);
    await get().refresh();
    return instance;
  },

  update: async (instance) => {
    const updated = await instancesApi.update(instance);
    await get().refresh();
    return updated;
  },

  rename: async (id, name) => {
    await instancesApi.rename(id, name);
    await get().refresh();
  },

  duplicate: async (id, name) => {
    const instance = await instancesApi.duplicate(id, name);
    await get().refresh();
    return instance;
  },

  remove: async (id, deleteFiles) => {
    await instancesApi.remove(id, deleteFiles);
    await get().refresh();
  },

  loadContent: async (id) => {
    const entries = await instancesApi.content(id);
    set((state) => ({ content: { ...state.content, [id]: entries } }));
    return entries;
  },

  toggleContent: async (id, path, enabled) => {
    await instancesApi.toggleContent(id, path, enabled);
    await get().loadContent(id);
  },

  deleteContent: async (id, path) => {
    await instancesApi.deleteContent(id, path);
    await get().loadContent(id);
  },

  importFiles: async (id, paths, folder) => {
    const count = await instancesApi.importFiles(id, paths, folder);
    await get().loadContent(id);
    return count;
  },
}));
