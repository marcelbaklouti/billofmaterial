import { Loader2 } from 'lucide-react';
import { Card } from '@workspace/ui/components/card';
import { Progress } from '@workspace/ui/components/progress';
import { ProgressUpdate } from '../hooks/use-sbom-generation';

interface ProgressDisplayProps {
  progress: ProgressUpdate;
  startTime: number | null;
}

export function ProgressDisplay({ progress, startTime }: ProgressDisplayProps) {
  return (
    <Card className="p-6 border-primary/20 bg-primary/5">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">{progress.message}</p>
            {progress.current !== undefined && progress.total !== undefined && (
              <p className="text-xs text-muted-foreground mt-1">
                {progress.current} / {progress.total} dependencies
                {startTime && (
                  <span className="ml-2 text-blue-600 dark:text-blue-400">
                    • {Math.round((Date.now() - startTime) / 1000)}s elapsed
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {progress.current !== undefined && progress.total !== undefined && progress.total > 0 && (
          <Progress
            value={(progress.current / progress.total) * 100}
            className="h-2"
          />
        )}
      </div>
    </Card>
  );
}
