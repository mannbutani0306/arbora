import { CompareView } from '../CompareView';
import type { ASTNode } from '../../types/ast';
import type { ComparisonMetrics } from '../../core/compare';

export function CompareTab(props: {
  classicalAst: ASTNode | null;
  neuralAst: ASTNode | null;
  metrics: ComparisonMetrics | null;
  isLoading: boolean;
  onRun: () => void;
  onJump: (line: number, column: number) => void;
}) {
  return (
    <CompareView
      classicalAst={props.classicalAst}
      neuralAst={props.neuralAst}
      metrics={props.metrics}
      isLoading={props.isLoading}
      onRunComparison={props.onRun}
      onJumpToSource={props.onJump}
    />
  );
}
