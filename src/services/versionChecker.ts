import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

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
  try {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    return packageJson.version;
  } catch {
    return '0.0.0'; // fallback
  }
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

function isVersionGreater(latest: string, current: string): boolean {
  const parseVersion = (v: string) => {
    const parts = v.split('.').map((p) => parseInt(p, 10));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  };
  const [latestMajor, latestMinor, latestPatch] = parseVersion(latest);
  const [currMajor, currMinor, currPatch] = parseVersion(current);

  if (latestMajor !== currMajor) return latestMajor > currMajor;
  if (latestMinor !== currMinor) return latestMinor > currMinor;
  return latestPatch > currPatch;
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

export function checkVersion(): VersionCheckResult {
  const currentVersion = readPackageVersion();

  // Try to use cache first
  const cache = readCache();
  if (cache && isCacheValid(cache)) {
    return {
      currentVersion,
      latestVersion: cache.latestVersion,
      updateAvailable: isVersionGreater(cache.latestVersion, currentVersion),
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
      updateAvailable: isVersionGreater(latestVersion, currentVersion),
      cached: false,
    };
  }

  // If fetch failed, use stale cache or return current version
  if (cache) {
    return {
      currentVersion,
      latestVersion: cache.latestVersion,
      updateAvailable: isVersionGreater(cache.latestVersion, currentVersion),
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
