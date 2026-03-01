"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Check, ChevronsUpDown, FolderKanban } from "lucide-react";

import { apiUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { usePlanningFilter } from "./planning-filter-context";

interface ProjectItem {
  id: string;
  key: string;
  name: string;
}

export function ProjectSelector() {
  const { selectedProjectIds, setSelectedProjectIds } = usePlanningFilter();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedId = selectedProjectIds.length === 1 ? selectedProjectIds[0] : null;

  const updateUrlParam = (projectKey: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", projectKey);
    router.replace(`${pathname}?${params.toString()}`);
  };

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl("/v1/planning/projects?limit=100"))
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled && json.data) {
          const items: ProjectItem[] = json.data.map(
            (p: { id: string; key: string; name: string }) => ({
              id: p.id,
              key: p.key,
              name: p.name,
            }),
          );
          setProjects(items);

          if (items.length > 0 && selectedProjectIds.length === 0) {
            const projectKeyFromUrl = searchParams.get("project");
            const match = projectKeyFromUrl
              ? items.find((p) => p.key === projectKeyFromUrl)
              : null;
            const target = match ?? items[0];
            setSelectedProjectIds([target.id]);
            if (!match) {
              updateUrlParam(target.key);
            }
          }
        }
      })
      .catch((err) => {
        console.error("[ProjectSelector]", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerLabel = useMemo(() => {
    if (loading) return "Projects…";
    if (!selectedId) return "Select project";
    const project = projects.find((p) => p.id === selectedId);
    return project ? `${project.key} · ${project.name}` : "Select project";
  }, [loading, selectedId, projects]);

  const handleSelect = (id: string) => {
    setSelectedProjectIds([id]);
    const project = projects.find((p) => p.id === id);
    if (project) {
      updateUrlParam(project.key);
    }
    setOpen(false);
  };

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
          <span className="max-w-[220px] truncate text-xs">{triggerLabel}</span>
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
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`${project.key} ${project.name}`}
                  onSelect={() => handleSelect(project.id)}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      "mr-2 size-3.5",
                      selectedId === project.id ? "opacity-100 text-primary" : "opacity-0",
                    )}
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
