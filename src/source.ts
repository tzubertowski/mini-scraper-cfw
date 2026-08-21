import { type ArtType } from './art.js';

export type ArtworkQuery = {
  filePath: string;
  machine: string;
  type: ArtType;
};

export type ArtworkProvider = {
  readonly id: string;
  findArtwork(query: ArtworkQuery): Promise<string | undefined>;
};
