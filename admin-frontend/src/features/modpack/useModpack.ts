import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ModpackDetails } from "../../types/api";

export const modpackKeys = {
  all: ["modpack"] as const,
  info: () => ["modpack", "info"] as const,
};

export function useModpack() {
  return useQuery({
    queryKey: modpackKeys.info(),
    queryFn: () => api.getInfo(),
  });
}

export function useDeleteModpack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteFile(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: modpackKeys.info() });
    },
  });
}

export type { ModpackDetails };
