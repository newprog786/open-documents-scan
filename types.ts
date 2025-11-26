export enum FilterType {
  ORIGINAL = 'ORIGINAL',
  GRAYSCALE = 'GRAYSCALE',
  MAGIC_ENHANCE = 'MAGIC_ENHANCE', // Binarization/High Contrast
  BW = 'BW'
}

export interface ScannedPage {
  id: string;
  originalDataUrl: string; // The raw capture
  processedDataUrl: string; // The filtered version
  highlightsLayer?: string; // Transparent image containing only highlights
  filter: FilterType;
  rotation: number; // 0, 90, 180, 270
}

export interface TranslationData {
  sourceLang: string;
  targetLang: string;
  text: string;
}

export interface DocumentData {
  id: string;
  title: string;
  createdAt: number;
  category: string; // e.g., 'Receipt', 'Invoice', 'Note'
  pages: ScannedPage[];
  aiSummary?: string; // OCR text or summary
  translation?: TranslationData;
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  CAMERA = 'CAMERA',
  EDITOR = 'EDITOR',
  DETAILS = 'DETAILS'
}