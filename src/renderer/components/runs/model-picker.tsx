import { Command as CommandPrimitive } from "cmdk";
import { ChevronDown, KeyRound } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { effortLabel, effortsFor, type ModelChoice, type ModelRole, ROLE_LABELS } from "@/hooks/use-model-choice";
import type { Effort } from "@/api/runs";
import { PROVIDERS } from "@/lib/providers";
import { cn } from "@/lib/utils";

const triggerClass = "max-w-72 gap-1 px-2 text-muted-foreground hover:bg-muted hover:text-foreground";
const ROLES: ModelRole[] = ["planner", "worker"];

export function ModelPicker({ choice }: { choice: ModelChoice }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<ModelRole>("planner");
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const find = (id: string) => choice.available.find((m) => m.id === id);
  const planner = find(choice.planner.model);
  const worker = find(choice.worker.model);

  if (!planner || !worker) {
    return (
      <PromptInputButton className={triggerClass} onClick={() => void navigate({ to: "/settings/models" })}>
        <KeyRound className="size-3.5" />
        <span>Add an API key</span>
      </PromptInputButton>
    );
  }

  const active = choice[role];
  const selected = role === "planner" ? planner : worker;
  const groups = PROVIDERS.map((p) => ({
    ...p,
    models: choice.available.filter((m) => m.provider === p.id),
  })).filter((g) => g.models.length > 0);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setRole("planner");
      }}
    >
      <PopoverTrigger
        render={
          <PromptInputButton
            aria-label="Choose planner and worker models"
            title={`Planner: ${planner.name} (${effortLabel(choice.planner.effort)})\nWorkers: ${worker.name} (${effortLabel(choice.worker.effort)})`}
            className={triggerClass}
          />
        }
      >
        <TriggerSummary
          planner={{ name: planner.name, effort: choice.planner.effort }}
          worker={{ name: worker.name, effort: choice.worker.effort }}
        />
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/70" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        initialFocus={searchRef}
        className="w-80 gap-0 overflow-hidden p-0"
      >
        <div role="tablist" aria-label="Agent role" className="flex gap-0.5 border-b p-1">
          {ROLES.map((r) => {
            const isActive = r === role;
            const model = r === "planner" ? planner : worker;
            return (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setRole(r);
                  searchRef.current?.focus();
                }}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-start rounded-md px-2 py-1 text-left transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <span className="text-xs font-medium">{ROLE_LABELS[r]}</span>
                <span className="w-full truncate text-xs text-muted-foreground">
                  {model.name} · {effortLabel(choice[r].effort)}
                </span>
              </button>
            );
          })}
        </div>
        <Command key={role} loop className="rounded-none! p-0" defaultValue={active.model}>
          <CommandPrimitive.Input
            ref={searchRef}
            placeholder={`Search ${ROLE_LABELS[role].toLowerCase()} models`}
            className="h-10 w-full border-b bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <CommandList className="max-h-72 p-1">
            <CommandEmpty className="py-5 text-muted-foreground">No models found.</CommandEmpty>
            {groups.map((group, i) => (
              <Fragment key={group.id}>
                {i > 0 ? <CommandSeparator className="mx-0 my-1" /> : null}
                <CommandGroup heading={group.name} className="p-0">
                  {group.models.map((model) => (
                    <CommandItem
                      key={model.id}
                      value={model.id}
                      keywords={[model.name, group.name]}
                      data-checked={model.id === active.model}
                      onSelect={() => active.setModel(model.id)}
                      className="h-8 gap-1.5 rounded-md px-2"
                    >
                      <span className="truncate">{model.name}</span>
                      <span className="shrink-0 text-muted-foreground">{effortLabel(active.effortFor(model.id))}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Fragment>
            ))}
          </CommandList>
        </Command>
        <div className="flex flex-col gap-1.5 border-t px-3 py-2">
          <span className="text-xs text-muted-foreground">{ROLE_LABELS[role]} effort</span>
          <div role="radiogroup" aria-label={`${ROLE_LABELS[role]} effort`} className="flex rounded-md bg-muted p-0.5">
            {effortsFor(selected).map((e) => {
              const on = e.id === active.effort;
              return (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => active.setEffort(e.id)}
                  className={cn(
                    "flex-1 rounded-[5px] px-1 py-0.5 text-xs whitespace-nowrap transition-colors",
                    on ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {e.label}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type RoleSummary = { name: string; effort: Effort };

function TriggerSummary({ planner, worker }: { planner: RoleSummary; worker: RoleSummary }) {
  if (planner.name === worker.name && planner.effort === worker.effort) {
    return (
      <>
        <span className="truncate text-foreground/85">{planner.name}</span>
        <span className="shrink-0 text-muted-foreground">{effortLabel(planner.effort)}</span>
      </>
    );
  }
  if (planner.name === worker.name) {
    return (
      <>
        <span className="truncate text-foreground/85">{planner.name}</span>
        <span className="shrink-0 text-muted-foreground">
          {effortLabel(planner.effort)} / {effortLabel(worker.effort)}
        </span>
      </>
    );
  }
  return (
    <span className="truncate text-foreground/85">
      {planner.name} <span className="text-muted-foreground">/</span> {worker.name}
    </span>
  );
}
