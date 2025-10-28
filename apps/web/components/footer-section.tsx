import { Clock } from 'lucide-react';
import { Badge } from '@workspace/ui/components/badge';

export function FooterSection() {
  return (
    <div className="text-center text-sm text-muted-foreground space-y-2 py-8 border-t">
      <p>
        Single package support • No data stored • 100% private
      </p>
      <div className="flex items-center justify-center gap-2 text-xs">
        <span>CLI Tool:</span>
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-md">
          <code className="text-xs">pnpm dlx @billofmaterial generate</code>
        </div>
      </div>
      <p className="text-xs mt-4 flex items-center justify-center gap-1">
        Made with <span className="text-red-500 animate-pulse">❤️</span> by{' '}
        <a
          href="https://github.com/marcelbaklouti"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:text-foreground transition-colors underline underline-offset-2"
        >
          Marcel Baklouti
        </a>
      </p>
    </div>
  );
}
