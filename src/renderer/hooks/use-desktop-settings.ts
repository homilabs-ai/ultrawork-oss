import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type DesktopSettings, requireDesktop } from "@/lib/desktop";

export const SETTINGS_QUERY_KEY = ["desktop-settings"] as const;

export function useDesktopSettings() {
  const bridge = requireDesktop();
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: bridge.settings.get });
  const save = useMutation({
    mutationFn: (s: DesktopSettings) => bridge.settings.save(s),
    onSuccess: (s) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, s);
      void queryClient.invalidateQueries({ queryKey: ["models"] });
    },
  });
  return { saved, save };
}
