#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if version type is provided
if [ -z "$1" ]; then
    print_error "Usage: ./scripts/version.sh [patch|minor|major]"
    print_info "Example: ./scripts/version.sh patch"
    exit 1
fi

VERSION_TYPE=$1

if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    print_error "Invalid version type. Use: patch, minor, or major"
    exit 1
fi

print_info "Starting version bump: ${VERSION_TYPE}"
echo ""

# Check if working directory is clean
if [[ -n $(git status -s) ]]; then
    print_warning "Working directory has uncommitted changes"
    git status -s
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Aborted"
        exit 1
    fi
fi

# Bump version in sbom-core
print_info "Bumping @billofmaterial/sbom-core version..."
cd packages/sbom-core
CORE_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version)
print_success "sbom-core: $CORE_VERSION"
cd ../..

# Bump version in CLI
print_info "Bumping billofmaterial CLI version..."
cd packages/cli
CLI_VERSION=$(npm version $VERSION_TYPE --no-git-tag-version)
print_success "billofmaterial: $CLI_VERSION"
cd ../..

# Update CLI version in cli.ts
print_info "Updating version in CLI source code..."
sed -i.bak "s/\.version('.*')/\.version('${CLI_VERSION#v}')/" packages/cli/src/cli.ts
rm packages/cli/src/cli.ts.bak
print_success "Updated cli.ts"

echo ""
print_info "Summary:"
echo "  Core: $CORE_VERSION"
echo "  CLI:  $CLI_VERSION"
echo ""

# Ask to commit
read -p "Commit these changes? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git add packages/sbom-core/package.json packages/cli/package.json packages/cli/src/cli.ts
    git commit -m "chore: bump version to $CLI_VERSION"
    print_success "Changes committed"
    
    echo ""
    print_info "To trigger the release workflow:"
    echo "  git push origin main"
    echo ""
    print_info "Or manually create a tag:"
    echo "  git tag $CLI_VERSION"
    echo "  git push origin $CLI_VERSION"
else
    print_warning "Changes not committed. Don't forget to commit manually!"
fi

echo ""
print_success "Version bump complete!"

