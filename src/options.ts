import type OpenAI from 'openai';
import type { DownloadManager, DownloadStatus } from './cache.js';

export enum ArtTypeOption {
  Boxart = 'boxart',
  Snap = 'snap',
  Title = 'title',
  BoxAndSnap = 'box+snap',
  BoxAndTitle = 'box+title'
}

export type Options = {
  width: number;
  height?: number;
  type: ArtTypeOption;
  force?: boolean;
  ai?: boolean;
  aiModel: string;
  aiUrl: string;
  aiKey?: string;
  aiClient?: OpenAI;
  regions: string;
  output: string;
  cleanup?: boolean;
  cachePath?: string;
  batchSize?: number;
  batchDelayMs?: number;
  batchRetries?: number;
  mediaPath?: string;
  downloadManager?: DownloadManager;
  onDownloadStatus?: (status: DownloadStatus) => void;
  downloadSignal?: AbortSignal;
};
