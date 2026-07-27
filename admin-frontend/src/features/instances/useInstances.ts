import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export const instanceKeys = {
  all: ["instances"] as const,
  list: () => ["instances", "list"] as const,
};

export function useInstances() {
  return useQuery({
    queryKey: instanceKeys.list(),
    queryFn: () => api.listInstances(),
  });
}

export function useCreateInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      iconUrl: string | null;
      backgroundUrl: string | null;
      isPublic?: boolean;
      isMain?: boolean;
    }) =>
      api.createInstance(input.name, input.iconUrl, input.backgroundUrl, {
        isPublic: input.isPublic,
        isMain: input.isMain,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceKeys.list() });
    },
  });
}

export function useUpdateInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      isPublic?: boolean;
      downloadEnabled?: boolean;
      accessEnabled?: boolean;
      isMain?: boolean;
    }) =>
      api.updateInstance(input.id, {
        isPublic: input.isPublic,
        downloadEnabled: input.downloadEnabled,
        accessEnabled: input.accessEnabled,
        isMain: input.isMain,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceKeys.list() });
    },
  });
}

export function useDeleteInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteInstance(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceKeys.list() });
    },
  });
}

export function useGenerateCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.generateCode(id, 1),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceKeys.list() });
    },
  });
}

export function useUploadInstanceModpack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; file: File; onProgress?: (pct: number) => void }) =>
      api.uploadInstanceModpack(input.id, input.file, input.onProgress),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceKeys.list() });
    },
  });
}

export function useUploadInstanceMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; slot: "icon" | "background"; file: File; onProgress?: (pct: number) => void }) =>
      api.uploadInstanceMedia(input.id, input.slot, input.file, input.onProgress),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceKeys.list() });
    },
  });
}

export function useAddInstanceMod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; file: File; onProgress?: (pct: number) => void }) =>
      api.addInstanceMod(input.id, input.file, input.onProgress),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceKeys.list() });
    },
  });
}
