import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const DB_DIR = path.join(process.cwd(), 'storage');
const DB_FILE = path.join(DB_DIR, 'data.json');

export interface DatabaseSchema {
  photos: number;
  videos: number;
}

const DEFAULT_DATA: DatabaseSchema = {
  photos: 30,
  videos: 10,
};

// In-memory cache to prevent frequent Google API calls
let cachedStats: DatabaseSchema | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // Cache stats for 5 minutes

function ensureDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
  }
}

function getLocalStats(): DatabaseSchema {
  try {
    ensureDb();
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data) as DatabaseSchema;
  } catch (error) {
    console.error('Failed to read database file, returning defaults:', error);
    return DEFAULT_DATA;
  }
}

function saveLocalStats(stats: DatabaseSchema) {
  try {
    ensureDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(stats, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save database file:', error);
  }
}

interface DriveListResponse {
  data: {
    nextPageToken?: string | null;
    files?: Array<{ name?: string | null; mimeType?: string | null }>;
  };
}

export async function getStats(): Promise<DatabaseSchema> {
  const now = Date.now();

  // Return cached stats if still valid
  if (cachedStats && now < cacheExpiresAt) {
    return cachedStats;
  }

  // Load credentials
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  // Fallback to local file db if Google Drive credentials are not set
  if (!folderId || !clientId || !clientSecret || !refreshToken) {
    const local = getLocalStats();
    cachedStats = local;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return local;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'https://developers.google.com/oauthplayground'
    );
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    let drivePhotos = 0;
    let driveVideos = 0;
    let pageToken: string | undefined = undefined;

    do {
      const response = (await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(name, mimeType)',
        pageSize: 1000,
        pageToken: pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })) as unknown as DriveListResponse;

      const files = response.data.files || [];
      for (const file of files) {
        const mimeType = file.mimeType || '';
        const name = file.name || '';
        if (mimeType.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/i.test(name)) {
          driveVideos++;
        } else {
          drivePhotos++;
        }
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    const stats = {
      photos: 30 + drivePhotos,
      videos: 10 + driveVideos,
    };

    // Cache the resolved stats
    cachedStats = stats;
    cacheExpiresAt = now + CACHE_TTL_MS;

    // Save locally as a sync backup
    saveLocalStats(stats);

    return stats;
  } catch (error) {
    console.error('Failed to fetch stats from Google Drive, using local db fallback:', error);
    const local = getLocalStats();
    // Cache the fallback for a shorter time (e.g. 30 seconds) so we try Drive again soon
    cachedStats = local;
    cacheExpiresAt = now + 30 * 1000;
    return local;
  }
}

export async function incrementStat(type: 'photos' | 'videos'): Promise<DatabaseSchema> {
  // Get current stats (will use cache if valid, otherwise fetch from Drive)
  const stats = await getStats();

  // Increment the specific count
  stats[type] += 1;

  // Force update cache
  cachedStats = stats;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;

  // Update local JSON backup file
  saveLocalStats(stats);

  return stats;
}
