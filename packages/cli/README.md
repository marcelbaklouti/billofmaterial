# Bill of Material CLI

Generate comprehensive Software Bill of Materials (SBOM) for your projects with security analysis, risk assessment, and bundle size insights.

## Features

- 🔍 **Security Analysis** - Get security scores and vulnerability insights for all dependencies
- 📦 **Bundle Size Analysis** - Understand the impact of each dependency on your bundle
- ⚠️ **Risk Assessment** - Identify high-risk packages with detailed risk factors
- 🏗️ **Monorepo Support** - Works seamlessly with pnpm, yarn, npm workspaces, and Lerna
- 📊 **Comprehensive Reports** - Generate markdown and JSON reports
- ⚖️ **License Compliance** - Identify problematic licenses
- 🏚️ **Maintenance Status** - Find abandoned or unmaintained packages

## Installation

You don't need to install it! Use `pnpm dlx` (recommended) or `npx`:

```bash
# Using pnpm (recommended)
pnpm dlx @billofmaterial generate

# Alternative: Using the CLI package directly
pnpm dlx @billofmaterial/cli generate

# Using npx
npx billofmaterial@latest generate

# Using yarn
yarn dlx billofmaterial@latest generate
```

Or install globally:

```bash
npm install -g billofmaterial
# or
pnpm add -g billofmaterial
```

## Usage

### Generate SBOM

Generate an SBOM for your current project:

```bash
billofmaterial generate
```

### Options

```bash
billofmaterial generate [options]

Options:
  -p, --path <path>      Path to project directory (default: current directory)
  -o, --output <file>    Output file path (default: "SBOM.md")
  --json                 Also output JSON format
  --no-dev               Exclude dev dependencies
  --no-bundle-size       Skip bundle size analysis
  -h, --help             Display help for command
```

### Examples

```bash
# Generate SBOM for current directory
billofmaterial generate

# Generate SBOM for specific project
billofmaterial generate -p ./my-project

# Generate SBOM with custom output
billofmaterial generate -o ./docs/DEPENDENCIES.md

# Generate both markdown and JSON
billofmaterial generate --json

# Skip dev dependencies
billofmaterial generate --no-dev

# Skip bundle size analysis (faster)
billofmaterial generate --no-bundle-size
```

## Web Interface

You can also use the web interface at [https://billofmaterial.dev](https://billofmaterial.dev) to upload your package.json or entire project and generate SBOM online.

## Output

The generated SBOM includes:

- **Executive Summary** - Overview of dependencies, security scores, and risks
- **Key Insights** - Top security risks, largest dependencies, license issues
- **Dependency Tables** - Detailed information for each dependency including:
  - Security scores from Snyk
  - Bundle sizes from Bundlephobia
  - License information
  - Risk assessment
  - Last update date
- **Monorepo Support** - Separate analysis for each package in monorepos

## License

MIT

## Links

- [Web Interface](https://billofmaterial.dev)
- [GitHub Repository](https://github.com/yourusername/billofmaterial)
- [Report Issues](https://github.com/yourusername/billofmaterial/issues)
