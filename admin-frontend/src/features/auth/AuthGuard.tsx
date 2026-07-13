import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Spinner } from "../../components/Spinner";
import { session } from "../../lib/api";

export function AuthGuard({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!session.isAuthenticated()) {
      session.redirectToLogin();
      return;
    }
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return <>{children}</>;
}
