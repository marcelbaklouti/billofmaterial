# Bill of Material (SBOM Generator)

Generate comprehensive Software Bill of Materials (SBOM) for your projects with security analysis, risk assessment, and bundle size insights. Works with both single packages and monorepos.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## 🌟 Features

- 🔍 **Security Analysis** - Get security scores from Snyk for all dependencies
- 📦 **Bundle Size Analysis** - Understand the impact of each dependency from Bundlephobia
- ⚠️ **Risk Assessment** - Identify high-risk packages with detailed risk factors
- 🏗️ **Monorepo Support** - Works seamlessly with pnpm, yarn, npm workspaces, and Lerna
- 📊 **Comprehensive Reports** - Generate beautiful markdown and JSON reports
- ⚖️ **License Compliance** - Identify problematic licenses that may require attention
- 🏚️ **Maintenance Status** - Find abandoned or unmaintained packages
- 🌐 **Web Interface** - Upload files directly in the browser
- 💻 **CLI Tool** - Use via npx/pnpm dlx without installation

## 📦 Project Structure

This is a monorepo containing:

- **`packages/sbom-core`** - Core SBOM generation logic
- **`packages/cli`** - Command-line interface (published as `billofmaterial`)
- **`apps/web`** - Next.js web application
- **`packages/ui`** - Shared UI components (Shadcn)

## 🚀 Quick Start

### Option 1: Web Interface

Visit **[billofmaterial.vercel.app](https://billofmaterial.vercel.app)** _(replace with your URL)_ and upload your `package.json` or entire project folder.

🚀 **Deploy your own**: See [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) for 5-minute Vercel deployment

### Option 2: CLI (No Installation Required)

```bash
# Using the CLI package directly (recommended)
pnpm dlx @billofmaterial/cli generate

# Using npx
npx billofmaterial/cli generate

# Using yarn
yarn dlx billofmaterial/cli generate
```

### Option 3: Install Globally

```bash
npm install -g billofmaterial/cli
# or
pnpm add -g billofmaterial/cli

# Then run
billofmaterial/cli generate
```

## 💻 CLI Usage

### Basic Usage

```bash
# Generate SBOM for current directory (using pnpm dlx - recommended)
pnpm dlx @billofmaterial/cli generate

# Generate SBOM for specific project
pnpm dlx @billofmaterial/cli generate -p ./my-project

# Generate SBOM with custom output
pnpm dlx @billofmaterial/cli generate -o ./docs/DEPENDENCIES.md

# Generate both markdown and JSON
pnpm dlx @billofmaterial/cli generate --json

# Skip dev dependencies
pnpm dlx @billofmaterial/cli generate --no-dev

# Skip bundle size analysis (faster)
pnpm dlx @billofmaterial/cli generate --no-bundle-size

# Alternative: Using the CLI package directly
pnpm dlx @billofmaterial/cli generate

# Or if installed globally
billofmaterial/cli  generate
```

### CLI Options

```
Options:
  -p, --path <path>      Path to project directory (default: current directory)
  -o, --output <file>    Output file path (default: "SBOM.md")
  --json                 Also output JSON format
  --no-dev               Exclude dev dependencies
  --no-bundle-size       Skip bundle size analysis
  -h, --help             Display help for command
```

## 🌐 Web Interface Features

- **Drag & Drop Upload** - Upload package.json or entire project folders
- **Real-time Progress** - See live progress during generation
- **Interactive Dashboard** - View insights with beautiful visualizations
- **Copy or Download** - Easily copy markdown or download as file
- **Dark Mode Support** - Beautiful UI in both light and dark modes

## 📊 Generated SBOM Includes

### Executive Summary

- Total number of dependencies
- Average security score
- Total bundle size
- High-risk package count
- License issues count

### Key Insights

- **Top Security Risks** - Packages with low security scores
- **Largest Dependencies** - Heavy packages affecting bundle size
- **License Concerns** - Packages with restrictive licenses
- **Abandoned Packages** - Dependencies not updated in over 2 years

### Detailed Dependency Tables

For each dependency:

- 📦 Package name and version
- 📝 Description
- ⚖️ License information
- 🔒 Security score (from Snyk)
- ⚠️ Risk assessment (Low/Medium/High)
- 📏 Bundle size (minified and gzipped)
- 📅 Last update date
- 🔗 Links to npm, Snyk, and Bundlephobia

## 🏗️ Monorepo Support

The tool automatically detects monorepo structures and analyzes each package separately:

- ✅ pnpm workspaces (`pnpm-workspace.yaml`)
- ✅ npm/yarn workspaces (package.json `workspaces` field)
- ✅ Lerna (`lerna.json`)

For monorepos, the SBOM will include:

- Overall executive summary
- Individual analysis for each package
- Aggregated insights across all packages

## 🛠️ Development

### Prerequisites

- Node.js 20 or later
- pnpm 10.4.1 or later

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/billofmaterial.git
cd billofmaterial

# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Start development server for web app
pnpm run dev
```

### Project Commands

```bash
# Development
pnpm dev              # Start all apps in dev mode
pnpm build            # Build all packages and apps
pnpm lint             # Lint all packages
pnpm format           # Format code with Prettier

# Web app specific
cd apps/web
pnpm dev              # Start Next.js dev server
pnpm build            # Build Next.js app
pnpm start            # Start production server

# CLI specific
cd packages/cli
pnpm build            # Build CLI
node dist/cli.js      # Run CLI locally
```

## 🏗️ Architecture

### Core Package (`@billofmaterial/sbom-core`)

The core package handles:

- Monorepo detection
- Fetching data from npm, Snyk, and Bundlephobia
- Risk calculation and scoring
- Markdown generation
- Progress tracking

Key features:

- TypeScript with full type safety
- Rate limiting for API requests
- Retry logic for failed requests
- Concurrent request handling

### CLI Package (`billofmaterial`)

Command-line interface built with:

- Commander.js for CLI framework
- Ora for beautiful spinners
- Chalk for colored output
- Automatic monorepo detection

### Web App (`apps/web`)

Next.js 16 application with:

- React 19
- Shadcn UI components
- Server-Sent Events for real-time progress
- File upload with drag & drop
- Responsive design

## 📝 Example Output

```markdown
# Software Bill of Materials (SBOM)

Last updated: 10/21/2025 2:30 PM

📦 **Monorepo Project**

## 📊 Executive Summary

- **Total Dependencies:** 156 (98 production, 58 dev)
- **Average Security Score:** 87/100
- **Total Bundle Size:** 4.2 MB
- **High Risk Packages:** 2
- **License Issues:** 0

## 🎯 Key Insights & Actions

### 🚨 Top Security Risks

| Package     | Risk Score | Factors                                                |
| ----------- | ---------- | ------------------------------------------------------ |
| old-package | 35/100     | Low security score: 45/100<br>Not updated in 24 months |

### 📦 Largest Dependencies

| Package | Size   | Gzipped |
| ------- | ------ | ------- |
| moment  | 289 KB | 71 KB   |
| lodash  | 247 KB | 69 KB   |

...
```

## 🚀 Deployment

### Deploy to Vercel (Recommended)

The easiest way to deploy the Bill of Material web app is using Vercel:

1. **Quick Deploy** (5 minutes):

   ```bash
   # Push to GitHub
   git push origin main

   # Import to Vercel at vercel.com/new
   # Set Root Directory: apps/web
   # Click Deploy
   ```

2. **Detailed Instructions**: See [QUICK_DEPLOY.md](./QUICK_DEPLOY.md)
3. **Full Documentation**: See [DEPLOYMENT.md](./DEPLOYMENT.md)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/billofmaterial)

### Other Platforms

The Next.js app can also be deployed to:

- **Netlify**: Use the Next.js preset
- **AWS Amplify**: Configure build settings for monorepo
- **Railway**: Docker-based deployment
- **Self-hosted**: Use `pnpm build && pnpm start`

See [DEPLOYMENT.md](./DEPLOYMENT.md) for platform-specific instructions.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- Security scores from [Snyk](https://snyk.io/)
- Bundle sizes from [Bundlephobia](https://bundlephobia.com/)
- Package data from [npm Registry](https://registry.npmjs.org/)
- UI components from [Shadcn UI](https://ui.shadcn.com/)

### Quick Release

```bash
# Bump version and prepare for release
./scripts/version.sh patch  # or minor/major

# Push to trigger automatic publishing
git push origin main
```

The GitHub Action will:

- Build all packages with Turbo
- Publish `@billofmaterial/sbom-core` to npm
- Publish `billofmaterial` CLI to npm
- Create a GitHub release

## 🗺️ Roadmap

- [ ] GitHub Action for CI/CD integration
- [ ] Support for other package managers (Cargo, Maven, etc.)
- [ ] Historical tracking and trending
- [ ] Automated security alerts
- [ ] Integration with dependency update tools
- [ ] API for programmatic access
- [ ] VS Code extension

---

Made with ❤️ by the Marcel Baklouti
