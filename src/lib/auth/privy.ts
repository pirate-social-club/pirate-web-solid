export interface PrivySession {
  accessToken: string;
  userId: string;
  walletAddress: string | null;
}

export interface PrivyAdapter {
  getSession(): Promise<PrivySession | null>;
  logout(): Promise<void>;
}

/**
 * M1 boundary only. Core JS authentication and relay calls belong to M2 and
 * must not leak into the shell or design-system layers.
 */
export function createPrivyAdapter(): PrivyAdapter {
  return {
    async getSession() {
      return null;
    },
    async logout() {},
  };
}
