import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface CacheData {
  latestVersion: string;
  checkedAt: number;
}

interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  cached: boolean;
}

const CACHE_DIR = join(homedir(), '.husgit');
const CACHE_FILE = join(CACHE_DIR, 'version-cache.json');
const CACHE_TTL = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')
  );
  return packageJson.version;
}

function readCache(): CacheData | null {
  try {
    const data = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    return data;
  } catch {
    return null;
  }
}

function writeCache(data: CacheData): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch {
    // Silently ignore cache write errors
  }
}

function isCacheValid(cache: CacheData): boolean {
  return Date.now() - cache.checkedAt < CACHE_TTL;
}

function fetchLatestVersion(): string | null {
  try {
    const version = execSync('npm view husgit-cli version', {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return version;
  } catch {
    return null;
  }
}

export async function checkVersion(): Promise<VersionCheckResult> {
  const currentVersion = readPackageVersion();

  // Try to use cache first
  const cache = readCache();
  if (cache && isCacheValid(cache)) {
    return {
      currentVersion,
      latestVersion: cache.latestVersion,
      updateAvailable: cache.latestVersion > currentVersion,
      cached: true,
    };
  }

  // Fetch latest version from npm
  const latestVersion = fetchLatestVersion();

  if (latestVersion) {
    writeCache({
      latestVersion,
      checkedAt: Date.now(),
    });

    return {
      currentVersion,
      latestVersion,
      updateAvailable: latestVersion > currentVersion,
      cached: false,
    };
  }

  // If fetch failed, use stale cache or return current version
  if (cache) {
    return {
      currentVersion,
      latestVersion: cache.latestVersion,
      updateAvailable: cache.latestVersion > currentVersion,
      cached: true,
    };
  }

  // No cache and no fetch succeeded, assume no update
  return {
    currentVersion,
    latestVersion: currentVersion,
    updateAvailable: false,
    cached: false,
  };
}
