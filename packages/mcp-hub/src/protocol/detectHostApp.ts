export type DetectHostAppInput = {
  appName?: string;
  appRoot?: string;
  uriScheme?: string;
  extensionPath?: string;
};

/** Well-known product ids kept stable when signals match them. */
const CANONICAL_HOST_APPS = [
  'kiro',
  'cursor',
  'qoder',
  'windsurf',
  'continue',
  'vscode'
] as const;

/**
 * Detect the IDE `hostApp` id used for registry isolation and MCP env.
 *
 * Priority:
 * 1. Product dir from extensionPath (`~/.{slug}/extensions/...`)
 * 2. uriScheme (except generic `vscode`, deferred)
 * 3. appName (slug; "Visual Studio Code" → vscode)
 * 4. appRoot basename / path signals
 * 5. uriScheme `vscode` as last resort
 * 6. `unknown` only when no usable signal exists
 *
 * Canonical names are aliases only — unknown VS Code forks MUST get their own
 * slug (e.g. `.joycode-editor` → `joycode-editor`) instead of sharing `unknown`.
 */
export function detectHostApp(input: DetectHostAppInput): string {
  const fromExtension = extractProductDirSlug(input.extensionPath);
  if (fromExtension) {
    return canonicalize(fromExtension);
  }

  const schemeSlug = slugifyHostAppId(input.uriScheme);
  if (schemeSlug && schemeSlug !== 'vscode') {
    return canonicalize(schemeSlug);
  }

  const fromAppName = detectFromAppName(input.appName);
  if (fromAppName) {
    return fromAppName;
  }

  const fromAppRoot = detectFromAppRoot(input.appRoot);
  if (fromAppRoot) {
    return fromAppRoot;
  }

  if (schemeSlug === 'vscode') {
    return 'vscode';
  }

  return 'unknown';
}

function detectFromAppName(appName: string | undefined): string | undefined {
  if (!appName) {
    return undefined;
  }
  const normalized = appName.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized.includes('visual studio code')) {
    return 'vscode';
  }
  for (const id of CANONICAL_HOST_APPS) {
    if (id !== 'vscode' && normalized.includes(id)) {
      return id;
    }
  }
  const slug = slugifyHostAppId(appName);
  return slug ? canonicalize(slug) : undefined;
}

function detectFromAppRoot(appRoot: string | undefined): string | undefined {
  if (!appRoot) {
    return undefined;
  }
  const normalized = normalizePath(appRoot).toLowerCase();
  for (const id of CANONICAL_HOST_APPS) {
    if (normalized.includes(`/${id}`) || normalized.includes(id)) {
      return id;
    }
  }
  const base = normalized.split('/').filter(Boolean).pop();
  const slug = slugifyHostAppId(base);
  return slug ? canonicalize(slug) : undefined;
}

/**
 * Extract `slug` from paths like:
 * `C:/Users/alan/.joycode-editor/extensions/...`
 * `/Users/alan/.cursor/extensions/...`
 */
function extractProductDirSlug(extensionPath: string | undefined): string | undefined {
  if (!extensionPath) {
    return undefined;
  }
  const normalized = normalizePath(extensionPath).toLowerCase();
  const match = normalized.match(/\/\.([a-z0-9][a-z0-9._-]*)\/extensions(?:\/|$)/);
  if (!match?.[1]) {
    return undefined;
  }
  return slugifyHostAppId(match[1]);
}

function canonicalize(slug: string): string {
  for (const id of CANONICAL_HOST_APPS) {
    if (slug === id) {
      return id;
    }
  }
  return slug;
}

/** Lowercase slug safe for bridges/<hostApp>/ directory names. */
export function slugifyHostAppId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug.length > 0 ? slug : undefined;
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/');
}
