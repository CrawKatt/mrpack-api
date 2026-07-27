import { useCallback } from "react";
import { session } from "../../lib/api";

export function useAuth() {
  const isAuthenticated = session.isAuthenticated();
  const token = session.getToken();

  const logout = useCallback(() => {
    void session.logout();
  }, []);

  return { isAuthenticated, token, logout };
}
