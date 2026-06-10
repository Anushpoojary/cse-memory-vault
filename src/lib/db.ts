import fs from 'fs';
import path from 'path';

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

function ensureDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
  }
}

export function getStats(): DatabaseSchema {
  try {
    ensureDb();
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data) as DatabaseSchema;
  } catch (error) {
    console.error('Failed to read database file, returning defaults:', error);
    return DEFAULT_DATA;
  }
}

export function incrementStat(type: 'photos' | 'videos'): DatabaseSchema {
  try {
    ensureDb();
    const stats = getStats();
    stats[type] += 1;
    fs.writeFileSync(DB_FILE, JSON.stringify(stats, null, 2), 'utf-8');
    return stats;
  } catch (error) {
    console.error(`Failed to increment stat ${type}:`, error);
    return DEFAULT_DATA;
  }
}
