import { Badge } from '@workspace/ui/components/badge';

export function FooterSection() {
  return (
    <div className="text-center text-sm text-muted-foreground space-y-2 py-8 border-t">
      <p>
        Monorepo support -- No data stored -- 100% private
      </p>
      <div className="flex items-center justify-center gap-4 text-xs">
        <Badge variant="secondary">SPDX 2.3</Badge>
        <Badge variant="secondary">CycloneDX 1.5</Badge>
        <Badge variant="secondary">ISO 27001</Badge>
      </div>
      <div className="flex items-center justify-center gap-2 text-xs mt-2">
        <span>CLI:</span>
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-md">
          <code className="text-xs">pnpm dlx @billofmaterial/cli generate</code>
        </div>
      </div>
      <p className="text-xs mt-4 flex items-center justify-center gap-1">
        Made by{' '}
        <a
          href="https://github.com/marcelbaklouti"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:text-foreground transition-colors underline underline-offset-2"
        >
          Marcel Baklouti
        </a>
        <span className="text-muted-foreground/50 ml-2">v0.3.0</span>
      </p>
    </div>
  );
}
