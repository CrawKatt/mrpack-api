import { useCallback } from "react";
import { session } from "../../lib/api";

export function useAuth() {
  const isAuthenticated = session.isAuthenticated();
  const credentials = session.getCredentials();

  const logout = useCallback(() => {
    session.logout();
  }, []);

  return { isAuthenticated, credentials, logout };
}
