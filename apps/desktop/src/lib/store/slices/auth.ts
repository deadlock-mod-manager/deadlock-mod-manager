import type { StateCreator } from "zustand";
import type { State } from "..";

export type User = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type Session = {
  id: string;
  userId: string;
  expiresAt: Date;
  token: string;
  ipAddress?: string;
  userAgent?: string;
};

export type AuthState = {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;

  setAuth: (user: User | null, session: Session | null) => void;
  clearAuth: () => void;
};

export const createAuthSlice: StateCreator<State, [], [], AuthState> = (
  set,
) => ({
  user: null,
  session: null,
  isAuthenticated: false,

  setAuth: (user, session) =>
    set(() => ({
      user,
      session,
      isAuthenticated: !!user && !!session,
      isLoading: false,
    })),

  clearAuth: () =>
    set(() => ({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
    })),
});
