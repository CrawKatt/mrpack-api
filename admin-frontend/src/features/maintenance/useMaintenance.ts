import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export const maintenanceKeys = {
  status: ["maintenance", "status"] as const,
  whitelist: ["maintenance", "whitelist"] as const,
};

export function useMaintenanceStatus() {
  return useQuery({
    queryKey: maintenanceKeys.status,
    queryFn: () => api.getMaintenanceStatus(),
  });
}

export function useWhitelist() {
  return useQuery({
    queryKey: maintenanceKeys.whitelist,
    queryFn: () => api.listWhitelist(),
  });
}

export function useToggleMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.toggleMaintenance(),
    onSuccess: (status) => queryClient.setQueryData(maintenanceKeys.status, status),
  });
}

export function useUpdateMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { premiumOnly: boolean; message: string }) =>
      api.updateMaintenanceConfig(input.premiumOnly, input.message),
    onSuccess: (status) => queryClient.setQueryData(maintenanceKeys.status, status),
  });
}

export function useAddWhitelistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nick: string) => api.addWhitelistEntry(nick),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: maintenanceKeys.whitelist }),
  });
}

export function useRemoveWhitelistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nick: string) => api.removeWhitelistEntry(nick),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: maintenanceKeys.whitelist }),
  });
}
