"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StateBadge } from "@/components/state-badge";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { Story, Task } from "@/lib/types";

interface StoryDetailData {
  story: Story;
  tasks: Task[];
}

export function StoryDetail({
  storyId,
  initialData,
}: {
  storyId: string;
  initialData: StoryDetailData;
}) {
  const { data } = useAutoRefresh<StoryDetailData>({
    url: `/api/stories/${storyId}`,
    initialData,
  });

  const { story, tasks } = data;

  return (
    <div>
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          Stories
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground font-mono">{story.id}</span>
      </nav>

      <div className="prose prose-invert max-w-none mb-8">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {story.content}
        </ReactMarkdown>
      </div>

      <Separator className="my-8" />

      <h2 className="text-xl font-semibold mb-4">
        Tasks ({tasks.length})
      </h2>

      {tasks.length === 0 ? (
        <p className="text-muted-foreground">No tasks for this story.</p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Link
              key={task.task_id}
              href={`/tasks/${task.story_id}/${task.task_id}`}
            >
              <Card className="transition-colors hover:border-primary/50 cursor-pointer">
                <CardHeader className="py-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <CardTitle className="font-mono text-sm">
                      {task.task_id}
                    </CardTitle>
                    <StateBadge state={task.state} />
                    <Badge variant="outline">{task.worker_type}</Badge>
                  </div>
                  <CardDescription className="line-clamp-2 mt-1">
                    {task.objective.split("\n")[0]}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
