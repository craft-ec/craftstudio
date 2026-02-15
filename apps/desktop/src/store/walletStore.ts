import { create } from "zustand";

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
  fundPool: (amount: number) => void;
}

const mockTransactions: Transaction[] = [
  { signature: "5Uh7...x9Qm", type: "fund_pool", amount: 10.0, token: "USDC", timestamp: "2026-02-14T18:30:00Z", status: "confirmed" },
  { signature: "3kR2...nP4w", type: "claim", amount: 2.35, token: "USDC", timestamp: "2026-02-13T12:00:00Z", status: "confirmed" },
  { signature: "8mY6...tL1v", type: "subscribe", amount: 5.0, token: "USDC", timestamp: "2026-02-10T09:15:00Z", status: "confirmed" },
  { signature: "2jF9...bK7s", type: "fund_pool", amount: 25.0, token: "USDC", timestamp: "2026-02-08T20:45:00Z", status: "confirmed" },
  { signature: "9pQ3...wR6d", type: "receive", amount: 1.12, token: "USDC", timestamp: "2026-02-06T15:20:00Z", status: "confirmed" },
];

export const useWalletStore = create<WalletState>((set) => ({
  address: "7xKj2mNvR5qY8pWs3bTcU6hFgA9dLe4V1nZoXiMwCrBf",
  solBalance: 0.245,
  usdcBalance: 87.42,
  transactions: mockTransactions,
  fundPool: (amount) =>
    set((state) => ({
      usdcBalance: state.usdcBalance - amount,
      transactions: [
        {
          signature: `${Math.random().toString(36).slice(2, 6)}...${Math.random().toString(36).slice(2, 6)}`,
          type: "fund_pool",
          amount,
          token: "USDC",
          timestamp: new Date().toISOString(),
          status: "pending",
        },
        ...state.transactions,
      ],
    })),
}));
