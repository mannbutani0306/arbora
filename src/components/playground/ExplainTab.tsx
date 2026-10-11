import { ExplainView } from '../ExplainView';
import type { ASTNode } from '../../types/ast';
import type { ExplanationContent } from '../../ai/explain';

export function ExplainTab(props: {
  ast: ASTNode | null;
  code: string;
  selectedNode: ASTNode | null;
  onSelectNode: (node: ASTNode | null) => void;
  onHighlight: (line: number, column: number, endColumn?: number) => void;
  onExplanation: (key: string, content: ExplanationContent) => void;
}) {
  return <ExplainView ast={props.ast} code={props.code} selectedNode={props.selectedNode} onSelectNode={props.onSelectNode} onHighlightSpan={props.onHighlight} onExplanationGenerated={props.onExplanation} />;
}
