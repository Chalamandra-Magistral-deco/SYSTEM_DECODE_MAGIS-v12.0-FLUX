export interface WindowState {
  id: string;
  title: string;
  isOpen: boolean;
  zIndex: number;
  position: { x: number; y: number };
  isMinimized: boolean;
  type: 'MATRIX' | 'ORACLE' | 'TERMINAL' | 'CHALAMANDRA' | 'CICD' | 'MEDIA' | 'LIVE' | 'ABOUT';
}

export interface MatrixStats {
  s: number;
  e: number;
  c: number;
  m: number;
}

export enum MediaType {
  VIDEO_GEN = 'VIDEO_GEN',
  IMAGE_GEN = 'IMAGE_GEN',
  TTS = 'TTS',
  VIDEO_ANALYSIS = 'VIDEO_ANALYSIS'
}