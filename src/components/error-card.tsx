import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

interface ErrorCardProps {
  title: string;
  message: string;
  suggestion?: string;
}

export function ErrorCard({ title, message, suggestion }: ErrorCardProps) {
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span>⚠️</span>
          <span className="font-semibold">{title}</span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{message}</p>
        {suggestion && (
          <p className="text-xs text-muted-foreground italic mt-2">
            {suggestion}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
