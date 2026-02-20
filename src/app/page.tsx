import { listStories } from "@/lib/adapters";
import { StoryList } from "@/components/story-list";

export const dynamic = "force-dynamic";

export default async function Home() {
  const stories = await listStories();

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1">Stories</h1>
        <p className="text-muted-foreground">
          {stories.length} {stories.length === 1 ? "story" : "stories"} in the
          Supervisor System
        </p>
      </div>
      <StoryList initialData={stories} />
    </>
  );
}
