/**
 * Microsoft / offline accounts plus the in-flight device-code sign-in.
 */
import { create } from "zustand";

import { auth } from "@/lib/api";
import type { DeviceCodeInfo, PublicAccount } from "@/lib/tauri";

interface AccountsState {
  accounts: PublicAccount[];
  loading: boolean;
  signingIn: boolean;
  deviceCode: DeviceCodeInfo | null;
  error: string | null;
  refresh: () => Promise<void>;
  loginMicrosoft: () => Promise<PublicAccount>;
  /** Finish the legacy browser sign-in from the URL copied out of the browser. */
  loginMicrosoftLegacy: (redirect: string) => Promise<PublicAccount>;
  loginOffline: (username: string) => Promise<PublicAccount>;
  setActive: (uuid: string) => Promise<void>;
  logout: (uuid: string) => Promise<void>;
  setDeviceCode: (info: DeviceCodeInfo | null) => void;
  clearError: () => void;
}

export const useAccounts = create<AccountsState>((set, get) => ({
  accounts: [],
  loading: false,
  signingIn: false,
  deviceCode: null,
  error: null,

  setDeviceCode: (info) => set({ deviceCode: info }),
  clearError: () => set({ error: null }),

  refresh: async () => {
    set({ loading: true });
    try {
      const accounts = await auth.accounts();
      set({ accounts, error: null });
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ loading: false });
    }
  },

  loginMicrosoft: async () => {
    set({ signingIn: true, deviceCode: null, error: null });
    try {
      const account = await auth.loginMicrosoft();
      await get().refresh();
      return account;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    } finally {
      set({ signingIn: false, deviceCode: null });
    }
  },

  loginMicrosoftLegacy: async (redirect) => {
    set({ error: null });
    try {
      const account = await auth.loginMicrosoftLegacy(redirect);
      await get().refresh();
      return account;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  loginOffline: async (username) => {
    set({ error: null });
    try {
      const account = await auth.loginOffline(username);
      await get().refresh();
      return account;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  setActive: async (uuid) => {
    const accounts = await auth.setActive(uuid);
    set({ accounts });
  },

  logout: async (uuid) => {
    const accounts = await auth.logout(uuid);
    set({ accounts });
  },
}));

/** The currently selected account, if any. */
export function activeAccount(accounts: PublicAccount[]): PublicAccount | null {
  return accounts.find((account) => account.active) ?? accounts[0] ?? null;
}
