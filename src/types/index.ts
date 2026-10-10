export * from './ast';

export interface PipelineStage {
  id: 'lex' | 'parse' | 'repair' | 'compare' | 'explain';
  label: string;
  description: string;
}

export interface FeatureItem {
  id: string;
  title: string;
  description: string;
  iconName: string;
}
