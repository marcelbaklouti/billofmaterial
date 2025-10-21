# Quick Start Guide

Get started with Bill of Material in under 5 minutes!

## 🎯 Choose Your Path

### 1. Use the CLI (Recommended for Testing)

No installation needed! Just run:

```bash
# Navigate to any project with package.json
cd /path/to/your/project

# Generate SBOM
npx billofmaterial@latest generate

# Or with pnpm
pnpm dlx billofmaterial@latest generate
```

That's it! You'll see a beautiful progress indicator and get a `SBOM.md` file with all insights.

### 2. Start the Web App (For Development)

```bash
# 1. Install dependencies (from monorepo root)
pnpm install

# 2. Start the web dev server
cd apps/web
pnpm dev

# 3. Open http://localhost:3000 in your browser

# 4. Upload your package.json or entire project folder
```

## 📋 First Time Setup

### Prerequisites

- Node.js 20 or later
- pnpm 10.4.1 or later

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd billofmaterial

# Install all dependencies
pnpm install

# Build all packages (optional, for development)
cd packages/sbom-core && pnpm build
cd ../cli && pnpm build
cd ../..

# Start web app
cd apps/web
pnpm dev
```

## 🧪 Test It Out

### Test 1: Generate SBOM for This Project

```bash
# From the monorepo root
cd packages/cli
pnpm build
node dist/cli.js generate -p ../..

# You should see a detailed SBOM.md file generated!
```

### Test 2: Use the Web Interface

1. Start the web app: `cd apps/web && pnpm dev`
2. Open http://localhost:3000
3. Create a test package.json:
   ```json
   {
     "name": "test-project",
     "version": "1.0.0",
     "dependencies": {
       "react": "^18.0.0",
       "lodash": "^4.17.21"
     }
   }
   ```
4. Upload it in the web interface
5. Watch the magic happen!

### Test 3: Test Monorepo Detection

```bash
# This project itself is a monorepo!
cd packages/cli
pnpm build
node dist/cli.js generate -p ../..

# The generated SBOM will show multiple packages analyzed
```

## 🎨 What You'll See

When you generate an SBOM, you'll get:

1. **Executive Summary**

   ```
   - Total Dependencies: 156
   - Average Security Score: 87/100
   - Total Bundle Size: 4.2 MB
   - High Risk Packages: 2
   ```

2. **Key Insights**

   - 🚨 Top Security Risks
   - 📦 Largest Dependencies
   - ⚖️ License Concerns
   - 🏚️ Abandoned Packages

3. **Detailed Tables**
   - All dependencies with security scores
   - Bundle sizes
   - Risk assessments
   - Last update dates

## 🔥 Common Commands

### CLI

```bash
# Basic usage
billofmaterial generate

# Custom output
billofmaterial generate -o docs/DEPENDENCIES.md

# With JSON export
billofmaterial generate --json

# Skip dev dependencies
billofmaterial generate --no-dev

# Skip bundle size (faster)
billofmaterial generate --no-bundle-size

# Different project
billofmaterial generate -p /path/to/project
```

### Development

```bash
# Start web app
cd apps/web && pnpm dev

# Build all packages
pnpm build

# Build specific package
cd packages/sbom-core && pnpm build
cd packages/cli && pnpm build

# Lint
pnpm lint

# Format code
pnpm format
```

## 🐛 Troubleshooting

### Issue: "Module not found @billofmaterial/sbom-core"

**Solution:** Build the core package first:

```bash
cd packages/sbom-core
pnpm build
```

### Issue: CLI shows no output

**Solution:** Make sure you're in a directory with package.json:

```bash
ls package.json  # Should show package.json
billofmaterial generate
```

### Issue: Web app shows errors

**Solution:** Check if dependencies are installed:

```bash
cd apps/web
pnpm install
pnpm dev
```

### Issue: "Cannot find module 'jsdom'"

**Solution:** Install dependencies in sbom-core:

```bash
cd packages/sbom-core
pnpm install
```

## 📦 Package.json Scripts

You can add these to your project's package.json:

```json
{
  "scripts": {
    "sbom": "billofmaterial generate",
    "sbom:json": "billofmaterial generate --json",
    "sbom:fast": "billofmaterial generate --no-bundle-size"
  }
}
```

Then run:

```bash
pnpm sbom
```

## 🎯 Next Steps

1. ✅ Test the CLI with your own projects
2. ✅ Try the web interface
3. ✅ Customize the output
4. ✅ Add to your CI/CD pipeline
5. ✅ Share with your team

## 🚀 Deploy to Production

### Deploy Web App

```bash
# Build for production
cd apps/web
pnpm build

# Deploy to Vercel (recommended)
vercel deploy

# Or deploy to Netlify, etc.
```

### Publish CLI to npm

```bash
# Update version in packages/cli/package.json
cd packages/cli
pnpm version patch  # or minor, or major

# Build
pnpm build

# Publish
pnpm publish --access public
```

## 💡 Tips

1. **Use --json flag** to get machine-readable output for automation
2. **Skip bundle size** with --no-bundle-size for faster analysis
3. **Set up CI/CD** to generate SBOM on every release
4. **Compare SBOMs** over time to track dependency changes
5. **Review high-risk packages** regularly

## 📚 Learn More

- [Full README](./README.md) - Complete documentation
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md) - Technical details
- [CLI README](./packages/cli/README.md) - CLI specific docs

---

Happy SBOM generating! 🎉
