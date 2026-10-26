import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Puzzle, Settings2, ShieldCheck } from "lucide-react";

import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PluginSelectorProps = {
  verifierEnabled: boolean;
  onVerifierEnabledChange: (enabled: boolean) => void;
};

export function PluginSelector({ verifierEnabled, onVerifierEnabledChange }: PluginSelectorProps) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <PromptInputButton
            aria-label="Select worker plugins"
            className="max-w-40 gap-1.5 px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          />
        }
      >
        <Puzzle className="size-3.5" />
        <span>{verifierEnabled ? "1 plugin" : "No plugins"}</span>
        <ChevronDown className="size-3.5 text-muted-foreground/70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" sideOffset={8} className="w-80 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5">
            <span className="block text-xs font-medium text-foreground">Worker plugins</span>
            <span className="mt-0.5 block text-[11px] font-normal leading-4 text-muted-foreground">
              Specialized worker types available to the orchestrator.
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={verifierEnabled}
          onCheckedChange={onVerifierEnabledChange}
          className="items-start py-2 pl-2 pr-9"
        >
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-muted">
            <ShieldCheck className="size-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">Final verifier</span>
            <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
              An independent model audits the work against your goal before it's marked done.
            </span>
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => void navigate({ to: "/settings/worker-plugins" })}
          className="px-2 text-xs text-muted-foreground"
        >
          <Settings2 className="size-3.5" />
          Verifier model and prompt
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
