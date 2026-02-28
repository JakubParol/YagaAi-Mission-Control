"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronsUpDown, FolderKanban } from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { usePlanningFilter } from "./planning-filter-context";

interface ProjectItem {
  id: string;
  key: string;
  name: string;
}

export function ProjectSelector() {
  const { selectedProjectIds, setSelectedProjectIds, toggleProject, allSelected } =
    usePlanningFilter();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/v1/planning/projects?limit=100"))
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.data) {
          setProjects(
            json.data.map((p: { id: string; key: string; name: string }) => ({
              id: p.id,
              key: p.key,
              name: p.name,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      // If all selected (empty array = all), do nothing — already all
      return;
    }
    setSelectedProjectIds([]);
  }, [allSelected, setSelectedProjectIds]);

  const handleToggle = useCallback(
    (id: string) => {
      if (allSelected) {
        // Switching from "all" to specific: select all except this one
        setSelectedProjectIds(projects.filter((p) => p.id !== id).map((p) => p.id));
      } else {
        toggleProject(id);
      }
    },
    [allSelected, projects, setSelectedProjectIds, toggleProject],
  );

  const isChecked = useCallback(
    (id: string) => allSelected || selectedProjectIds.includes(id),
    [allSelected, selectedProjectIds],
  );

  const triggerLabel = (() => {
    if (loading) return "Projects…";
    if (allSelected || selectedProjectIds.length === 0) return "All projects";
    if (selectedProjectIds.length === projects.length) return "All projects";
    const selected = projects.filter((p) => selectedProjectIds.includes(p.id));
    if (selected.length === 1) return `(${selected[0].key}) ${selected[0].name}`;
    if (selected.length === 2)
      return selected.map((p) => `(${p.key}) ${p.name}`).join(", ");
    return `${selected.length} projects`;
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <FolderKanban className="size-3.5" />
          <span className="max-w-[200px] truncate text-xs">{triggerLabel}</span>
          <ChevronsUpDown className="size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search projects…" className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
              No projects found.
            </CommandEmpty>
            <CommandGroup>
              <CommandItem onSelect={handleSelectAll} className="text-xs">
                <Checkbox
                  checked={allSelected}
                  className="mr-2 size-3.5"
                  tabIndex={-1}
                />
                All projects
                {allSelected && <Check className="ml-auto size-3.5 text-primary" />}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`${project.key} ${project.name}`}
                  onSelect={() => handleToggle(project.id)}
                  className="text-xs"
                >
                  <Checkbox
                    checked={isChecked(project.id)}
                    className="mr-2 size-3.5"
                    tabIndex={-1}
                  />
                  <span className="font-medium text-muted-foreground">{project.key}</span>
                  <span className="ml-1.5 truncate">{project.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
