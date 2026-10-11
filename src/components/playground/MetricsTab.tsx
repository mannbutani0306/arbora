import { MetricsView } from '../MetricsView';
import type { ASTNode } from '../../types/ast';

export function MetricsTab({ ast, code }: { ast: ASTNode | null; code: string }) {
  return <MetricsView ast={ast} code={code} />;
}
