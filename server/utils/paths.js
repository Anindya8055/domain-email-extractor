import path from 'path';
import { fileURLToPath } from 'url';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Packaged builds may run from a read-only location (e.g. an AppImage mount), so Electron passes a writable DATA_DIR.
const DATA_DIR = process.env.DATA_DIR || SERVER_ROOT;

export const RESULTS_DIR = path.join(DATA_DIR, 'results');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
