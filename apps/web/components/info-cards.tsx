import { Shield, Package, FileCheck } from 'lucide-react';
import { Card } from '@workspace/ui/components/card';

export function InfoCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold mb-1">Vulnerability Detection</h3>
            <p className="text-sm text-muted-foreground">
              CVE detection via OSV.dev, Snyk security scores, and VEX statements for all dependencies
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <FileCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold mb-1">ISO 27001 Compliance</h3>
            <p className="text-sm text-muted-foreground">
              CISA 2025 and EU CRA compliant with SPDX 2.3 and CycloneDX 1.5 export
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-green-500/10 rounded-lg">
            <Package className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="font-semibold mb-1">Monorepo Support</h3>
            <p className="text-sm text-muted-foreground">
              Works with pnpm, yarn, npm workspaces, and Lerna monorepo setups
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
