export interface GameMetadata {
  id: string; // generated unique id
  system: string;
  title: string;
  romFilename: string; // Main file (e.g., .m3u or .iso)
  disks: string[]; // List of actual game files (files inside m3u or the single rom)
  isM3u: boolean;
  path: string; // Original relative path from XML
  developer: string;
  publisher: string;
  genre: string;
  releaseDate: string; // formatted YYYY-MM-DD
  region: string;
  romSize: number; // in bytes (sum of all disks)
  mediaSize: number; // in bytes (boxart, video, manual, etc combined)
  description: string;
  playCount: number;
  lastPlayed: string;
  rating: number; // 0.0 to 1.0
}

export interface SystemStats {
  name: string;
  count: number;
  totalSize: number;
}

export interface CollectionReport {
  games: GameMetadata[];
  totalGames: number;
  totalRomSize: number;
  totalMediaSize: number;
  systems: SystemStats[];
  scanDurationMs: number;
}

// EmulationStation XML Shape
export interface ESGameEntry {
  path?: string[];
  name?: string[];
  desc?: string[];
  image?: string[];
  thumbnail?: string[];
  video?: string[];
  rating?: string[];
  releasedate?: string[];
  developer?: string[];
  publisher?: string[];
  genre?: string[];
  playcount?: string[];
  lastplayed?: string[];
  manual?: string[];
}