# Quick Deployment Guide to Vercel 🚀

## 🎯 TL;DR - 5 Minute Deploy

### Method 1: GitHub + Vercel Dashboard (Easiest)

1. **Push to GitHub**

   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Go to Vercel**

   - Visit [vercel.com/new](https://vercel.com/new)
   - Click "Import" your Git repository

3. **Configure**

   - **Root Directory**: Set to `apps/web`
   - **Build Command**: `pnpm run build` (auto-detected)
   - **Install Command**: `pnpm install` (auto-detected)
   - Leave everything else as default

4. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes
   - Done! 🎉

---

## ✅ Pre-Deployment Checklist

Run these commands to ensure everything works:

```bash
# 1. Build the core package
cd packages/sbom-core
pnpm run build
cd ../..

# 2. Test the web app builds successfully
cd apps/web
pnpm run build
cd ../..

# 3. Verify no linting errors
pnpm run lint

# 4. (Optional) Test locally
pnpm dev
```

---

## 🔧 What's Already Configured

✅ **Package Manager**: pnpm@10.4.1 specified in root `package.json`  
✅ **Node Version**: >=20 specified in engines  
✅ **Vercel Config**: Created in `apps/web/vercel.json`  
✅ **Monorepo**: Workspace dependencies properly linked  
✅ **Next.js**: Latest version with App Router  
✅ **TypeScript**: Strict mode enabled  
✅ **API Routes**: SSE streaming configured with 5min timeout

---

## 📋 Vercel Dashboard Settings

When importing your project, use these settings:

| Setting              | Value            |
| -------------------- | ---------------- |
| **Framework Preset** | Next.js          |
| **Root Directory**   | `apps/web`       |
| **Build Command**    | `pnpm run build` |
| **Install Command**  | `pnpm install`   |
| **Output Directory** | `.next`          |
| **Node.js Version**  | 20.x             |

---

## 🌐 Post-Deployment

After deployment, your app will be available at:

- Production: `https://your-project.vercel.app`

Test these features:

1. ✅ Upload a single `package.json`
2. ✅ Upload a monorepo folder
3. ✅ Check that SBOM generates with all insights:
   - Top Security Risks
   - Quick Wins (outdated packages with security issues)
   - Outdated Packages list
   - Largest Dependencies
   - License Concerns
   - Abandoned Packages
4. ✅ Download the generated SBOM markdown
5. ✅ Copy to clipboard works

---

## 🐛 Common Issues & Fixes

### Issue: Build fails with "Module not found: @billofmaterial/sbom-core"

**Fix**: Run `pnpm build` in the root to build all packages before deploying.

### Issue: API timeout

**Fix**: Already configured with 5-minute timeout via SSE streaming. If still timing out, check Vercel logs.

### Issue: pnpm not detected

**Fix**: Already configured in `package.json` with `"packageManager": "pnpm@10.4.1"`

---

## 📚 Full Documentation

For detailed deployment instructions, troubleshooting, and advanced configuration, see [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 🎉 You're Ready!

Your Bill of Material SBOM Generator is production-ready and optimized for Vercel deployment.

**Need help?** Check the full [DEPLOYMENT.md](./DEPLOYMENT.md) guide.
