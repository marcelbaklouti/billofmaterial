# Deploying Bill of Material to Vercel

This guide will walk you through deploying the Bill of Material SBOM Generator to Vercel.

## Prerequisites

1. **Vercel Account**: Create a free account at [vercel.com](https://vercel.com)
2. **Git Repository**: Your code should be in a Git repository (GitHub, GitLab, or Bitbucket)
3. **Vercel CLI** (optional): Install with `npm i -g vercel` or `pnpm add -g vercel`

## Project Structure

Your monorepo is structured as:

```
billofmaterial/
├── apps/
│   └── web/          # Next.js app to deploy
├── packages/
│   ├── sbom-core/    # Core SBOM logic
│   ├── ui/           # Shared UI components
│   └── ...
└── pnpm-workspace.yaml
```

## Method 1: Deploy via Vercel Dashboard (Recommended)

### Step 1: Push to Git

Make sure all your changes are committed and pushed:

```bash
cd /Users/marcelbaklouti/Projekte/billofmaterial/billofmaterial
git add .
git commit -m "feat: Complete SBOM generator with web UI"
git push origin main
```

### Step 2: Import Project to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Add New..."** → **"Project"**
3. Import your Git repository
4. Select the repository containing your Bill of Material code

### Step 3: Configure Build Settings

Vercel should auto-detect Next.js, but configure these settings:

**Framework Preset**: `Next.js`

**Root Directory**: `apps/web`

- Click **"Edit"** next to Root Directory
- Enter: `apps/web`
- This tells Vercel to deploy only the web app, not the entire monorepo

**Build Command**: Leave as default or use:

```bash
pnpm run build
```

**Install Command**:

```bash
pnpm install
```

**Output Directory**: `.next` (should be auto-detected)

**Node.js Version**: `20.x` (recommended)

### Step 4: Environment Variables (Optional)

No environment variables are required for this project since:

- All API calls are made from the server-side API route
- No external services require authentication
- All data is processed in-memory

However, if you want to add analytics or monitoring later, you can add environment variables here.

### Step 5: Deploy

1. Click **"Deploy"**
2. Wait for the build to complete (usually 2-5 minutes)
3. Once deployed, you'll get a URL like: `https://your-project.vercel.app`

### Step 6: Configure Domain (Optional)

1. Go to your project settings
2. Click **"Domains"**
3. Add your custom domain (e.g., `billofmaterial.dev`)
4. Follow Vercel's instructions to update your DNS settings

---

## Method 2: Deploy via Vercel CLI

### Step 1: Install Vercel CLI

```bash
pnpm add -g vercel
# or
npm i -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

### Step 3: Deploy from the Web App Directory

```bash
cd /Users/marcelbaklouti/Projekte/billofmaterial/billofmaterial/apps/web
vercel
```

### Step 4: Answer the Setup Questions

```
? Set up and deploy "~/billofmaterial/apps/web"? [Y/n] y
? Which scope do you want to deploy to? [Your Account]
? Link to existing project? [y/N] n
? What's your project's name? billofmaterial
? In which directory is your code located? ./
```

### Step 5: Deploy to Production

```bash
vercel --prod
```

---

## Vercel Configuration File (Optional)

Create a `vercel.json` in the **root of your monorepo** for advanced configuration:

```json
{
  "buildCommand": "cd apps/web && pnpm run build",
  "devCommand": "cd apps/web && pnpm run dev",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "outputDirectory": "apps/web/.next"
}
```

Or create `vercel.json` in `apps/web/`:

```json
{
  "framework": "nextjs",
  "buildCommand": "pnpm run build",
  "devCommand": "pnpm run dev",
  "installCommand": "pnpm install"
}
```

---

## Monorepo Considerations

Since you're using a monorepo with pnpm workspaces:

1. **Vercel Auto-detects pnpm**: Vercel will automatically use pnpm if it finds `pnpm-lock.yaml`
2. **Workspace Dependencies**: All workspace dependencies (`@billofmaterial/sbom-core`, `@workspace/ui`) will be built automatically
3. **Build Order**: Vercel handles the build order correctly for workspace dependencies

---

## Performance Optimization

### 1. Enable Caching

Vercel automatically caches:

- Node modules
- Next.js build output
- Static assets

### 2. Configure Edge Runtime (Optional)

For faster response times, you can configure the API route to use Edge Runtime. However, since we're using `jsdom` and Node.js-specific APIs, we should stick with the Node.js runtime (already configured).

### 3. Increase Function Timeout

In `apps/web/app/api/generate/route.ts`, we already set:

```typescript
export const maxDuration = 300; // 5 minutes
```

For Vercel Pro, you can increase this to 60 seconds. For Hobby plan, it's limited to 10 seconds, but our SSE implementation works around this.

---

## Troubleshooting

### Build Fails: "Module not found"

**Solution**: Make sure you've built the `sbom-core` package before deploying:

```bash
cd packages/sbom-core
pnpm run build
```

Then commit the built files or ensure the build command runs in the correct order.

### Build Fails: "pnpm not found"

**Solution**: Vercel should auto-detect pnpm. If not, add this to `package.json` in the root:

```json
{
  "packageManager": "pnpm@9.0.0"
}
```

### TypeScript Errors During Build

**Solution**: Run locally first to catch errors:

```bash
cd apps/web
pnpm run build
```

Fix any TypeScript errors before deploying.

### API Route Timeout

**Solution**: The default timeout is 10 seconds on Hobby plan. Our implementation uses Server-Sent Events (SSE) to stream progress, which works around this limitation. If you still experience timeouts:

1. Upgrade to Vercel Pro for 60-second timeout
2. Or reduce the number of concurrent API requests in the config

### Large Dependencies Causing Issues

**Solution**: Our bundle includes `jsdom` which is relatively large. Vercel handles this fine, but if you experience issues:

1. Ensure tree-shaking is enabled (Next.js does this by default)
2. Consider lazy-loading the SBOM generation logic

---

## Post-Deployment

### 1. Test the Deployment

1. Visit your Vercel URL
2. Upload a `package.json` file
3. Verify SBOM generation works correctly
4. Check that all insights (Quick Wins, Outdated Packages, etc.) are displayed

### 2. Monitor Performance

1. Go to your Vercel dashboard
2. Check **Analytics** for performance metrics
3. Monitor **Logs** for any errors

### 3. Set Up Continuous Deployment

Once deployed, Vercel automatically:

- Deploys every push to `main` branch → Production
- Creates preview deployments for every PR
- Runs builds and tests automatically

### 4. Add Status Badge (Optional)

Add a deployment status badge to your README:

```markdown
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/billofmaterial)
```

---

## Example Deployment URLs

After deployment, you'll have:

- **Production**: `https://billofmaterial.vercel.app`
- **Preview**: `https://billofmaterial-git-feature-branch.vercel.app` (for each branch)
- **Custom Domain**: `https://billofmaterial.dev` (if configured)

---

## Security Considerations

1. **Rate Limiting**: Consider adding rate limiting to the API route to prevent abuse
2. **File Size Limits**: Next.js has a default 4MB body limit, which should be sufficient
3. **CORS**: Not needed since the API is same-origin
4. **Data Privacy**: No data is stored or logged (as intended)

---

## Scaling Considerations

For high traffic:

1. **Vercel Pro**: Upgrade for higher limits and better performance
2. **Edge Caching**: Static assets are automatically cached at the edge
3. **API Optimization**: Consider caching npm registry responses (currently not implemented to ensure fresh data)

---

## Support

If you encounter issues:

1. Check [Vercel Documentation](https://vercel.com/docs)
2. Review [Next.js Deployment Docs](https://nextjs.org/docs/deployment)
3. Check Vercel deployment logs for specific errors

---

## Quick Deployment Checklist

- [ ] Code committed and pushed to Git
- [ ] Project builds successfully locally (`pnpm run build`)
- [ ] No TypeScript errors
- [ ] Connected Git repository to Vercel
- [ ] Set root directory to `apps/web`
- [ ] Deploy initiated
- [ ] Deployment successful
- [ ] Test live URL
- [ ] (Optional) Configure custom domain
- [ ] (Optional) Set up monitoring/analytics

---

**🎉 That's it! Your Bill of Material SBOM Generator should now be live on Vercel!**

For any issues or questions, refer to the troubleshooting section above.
