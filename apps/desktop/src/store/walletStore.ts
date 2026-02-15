import { create } from "zustand";
import { daemon } from "../services/daemon";

export interface Transaction {
  signature: string;
  type: "fund_pool" | "claim" | "subscribe" | "receive";
  amount: number;
  token: string;
  timestamp: string;
  status: "confirmed" | "pending" | "failed";
}

interface WalletState {
  address: string;
  solBalance: number;
  usdcBalance: number;
  transactions: Transaction[];
  loading: boolean;
  error: string | null;

  fundPool: (amount: number) => Promise<void>;
  setAddress: (address: string) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  address: "",
  solBalance: 0,
  usdcBalance: 0,
  transactions: [],
  loading: false,
  error: null,

  setAddress: (address) => set({ address }),

  fundPool: async (amount) => {
    const state = useWalletStore.getState();
    if (!state.address) {
      set({ error: "No wallet address" });
      return;
    }

    // Optimistic: add pending tx
    const pendingTx: Transaction = {
      signature: `pending-${Date.now()}`,
      type: "fund_pool",
      amount,
      token: "USDC",
      timestamp: new Date().toISOString(),
      status: "pending",
    };
    set((s) => ({
      transactions: [pendingTx, ...s.transactions],
      error: null,
    }));

    try {
      const result = await daemon.fundPool(state.address, amount);
      // Replace pending tx with confirmed
      set((s) => ({
        usdcBalance: s.usdcBalance - amount,
        transactions: s.transactions.map((tx) =>
          tx.signature === pendingTx.signature
            ? { ...tx, signature: result.signature, status: result.confirmed ? "confirmed" : "pending" }
            : tx
        ),
      }));
    } catch (e) {
      // Mark as failed
      set((s) => ({
        error: (e as Error).message,
        transactions: s.transactions.map((tx) =>
          tx.signature === pendingTx.signature ? { ...tx, status: "failed" } : tx
        ),
      }));
    }
  },
}));
