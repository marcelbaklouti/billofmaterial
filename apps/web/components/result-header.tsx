import { Button } from '@workspace/ui/components/button';

interface ResultHeaderProps {
  result: any;
  onReset: () => void;
}

export function ResultHeader({ result, onReset }: ResultHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-bold">Analysis Complete</h2>
        <p className="text-sm text-muted-foreground">
          Generated {new Date(result.generatedAt).toLocaleString()}
        </p>
      </div>
      <Button variant="outline" onClick={onReset}>
        Generate New SBOM
      </Button>
    </div>
  );
}
