# Release Process Quick Reference

## 🎯 One-Command Release

```bash
./scripts/version.sh patch && git push origin main
```

That's it! GitHub Actions handles the rest.

---

## 📋 Step-by-Step

### 1. Prepare Release

```bash
# Choose version bump type
./scripts/version.sh patch   # Bug fixes (0.0.1 → 0.0.2)
./scripts/version.sh minor   # New features (0.0.1 → 0.1.0)
./scripts/version.sh major   # Breaking changes (0.0.1 → 1.0.0)
```

The script will:

- ✅ Bump both package versions
- ✅ Update version in `cli.ts`
- ✅ Commit changes
- ⏸️ Wait for your push

### 2. Trigger Release

```bash
git push origin main
```

### 3. Monitor Progress

Go to **Actions** tab on GitHub and watch the workflow:

- 🔨 Build packages
- 📦 Publish to npm
- 🏷️ Create GitHub release

### 4. Verify

After ~5 minutes:

```bash
# Test the published CLI
npx billofmaterial@latest generate
```

Check:

- ✅ npm: https://www.npmjs.com/package/billofmaterial
- ✅ GitHub: `https://github.com/YOUR_USERNAME/billofmaterial/releases`

---

## 🆘 Troubleshooting

| Problem                | Solution                                                  |
| ---------------------- | --------------------------------------------------------- |
| Workflow doesn't run   | Check pushed to `main` and changed files in `packages/**` |
| Authentication failed  | Verify `NPM_TOKEN` in GitHub Secrets                      |
| Package already exists | Version wasn't bumped, run version script again           |
| Build fails            | Run `pnpm build` locally to catch errors first            |

---

## 🔧 Manual Workflow Trigger

Don't want to push? Trigger manually:

1. Go to **Actions** → **Release** workflow
2. Click **Run workflow**
3. Select `main` branch
4. Click **Run workflow**

---

## ⚙️ What Happens Automatically

```
Push to main
    ↓
GitHub Actions Starts
    ↓
Install pnpm + Node 20
    ↓
pnpm install + build
    ↓
Get version from CLI package.json
    ↓
Check if tag exists
    ↓
[If new version]
    ↓
Replace workspace:* → ^X.Y.Z
    ↓
Publish @billofmaterial/sbom-core
    ↓
Wait 30s (npm propagation)
    ↓
Publish billofmaterial CLI
    ↓
Create GitHub Release
    ↓
✅ Done!
```

---

## 📦 Published Packages

After successful release:

1. **@billofmaterial/sbom-core** - Core library

   - Used internally by CLI
   - Can be used programmatically

2. **billofmaterial** - CLI tool
   - Available via `npx billofmaterial@latest generate`
   - Available via `pnpm dlx billofmaterial@latest generate`
   - Available via `yarn dlx billofmaterial@latest generate`

---

## 🚫 What NOT to Do

- ❌ Don't manually edit version numbers (use the script)
- ❌ Don't publish manually to npm (let CI handle it)
- ❌ Don't force push to main
- ❌ Don't skip version bumps
- ❌ Don't publish with uncommitted changes

---

## 📚 More Info

- Full guide: [PUBLISHING.md](../../PUBLISHING.md)
- Workflow: [release.yml](../workflows/release.yml)
- Version script: [scripts/version.sh](../../scripts/version.sh)

---

## 🎓 First Time Setup

Before your first release:

1. Create npm account: https://www.npmjs.com/signup
2. Generate npm token: Profile → Access Tokens → Generate (Automation)
3. Add to GitHub: Settings → Secrets → New secret
   - Name: `NPM_TOKEN`
   - Value: Your token
4. Run first release: `./scripts/version.sh patch && git push`

---

Need help? See [PUBLISHING.md](../../PUBLISHING.md) for detailed documentation.
