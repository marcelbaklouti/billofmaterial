import { Loader2, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@workspace/ui/components/dialog';
import { Progress } from '@workspace/ui/components/progress';
import { ProgressUpdate } from '../hooks/use-sbom-generation';

interface ProgressModalProps {
  isOpen: boolean;
  progress: ProgressUpdate | null;
}

export function ProgressModal({ isOpen, progress }: ProgressModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => { }}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e: Event) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            Generating SBOM
          </DialogTitle>
          <DialogDescription>
            Please wait while we analyze your dependencies...
          </DialogDescription>
        </DialogHeader>

        {progress && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{progress.message}</span>
                {progress.current !== undefined && progress.total !== undefined && (
                  <span className="text-muted-foreground">
                    {progress.current} / {progress.total}
                  </span>
                )}
              </div>

              {progress.current !== undefined && progress.total !== undefined && progress.total > 0 && (
                <div className="space-y-2">
                  <Progress
                    value={(progress.current / progress.total) * 100}
                    className="h-2"
                  />
                  <p className="text-xs text-center text-muted-foreground">
                    {Math.round((progress.current / progress.total) * 100)}% complete
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
              <Shield className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                We're fetching security data from Snyk and bundle sizes from Bundlephobia.
                This may take a few moments depending on the number of dependencies.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
