/**
 * Formal Context-Free Grammar (CFG) for MiniC.
 *
 * Fully left-recursion-free representation:
 * Program -> (FunctionDecl | GlobalVarDecl)*
 * Expression precedence hierarchy (lowest to highest):
 * assignment, ||, &&, equality, relational, additive, multiplicative, unary, postfix, primary.
 */

export interface ProductionRule {
  id: string;
  lhs: string;
  rhs: string[]; // List of symbols (terminals or non-terminals). Empty array or ['ε'] represents epsilon.
  description?: string;
}

export interface Grammar {
  startSymbol: string;
  nonTerminals: string[];
  terminals: string[];
  productions: ProductionRule[];
}

export const EPSILON = 'ε';

export const MINIC_CFG_RULES: ProductionRule[] = [
  // Top-Level Structure
  { id: 'P01', lhs: 'Program', rhs: ['TopLevelList'], description: 'Program entry point' },
  { id: 'P02', lhs: 'TopLevelList', rhs: ['TopLevelItem', 'TopLevelList'], description: 'Top-level item list' },
  { id: 'P03', lhs: 'TopLevelList', rhs: [EPSILON], description: 'End of top-level item list' },

  { id: 'P04', lhs: 'TopLevelItem', rhs: ['FunctionDecl'], description: 'Top-level function' },
  { id: 'P05', lhs: 'TopLevelItem', rhs: ['GlobalVarDecl'], description: 'Top-level global variable' },

  // Types
  { id: 'T01', lhs: 'Type', rhs: ['int'] },
  { id: 'T02', lhs: 'Type', rhs: ['float'] },
  { id: 'T03', lhs: 'Type', rhs: ['bool'] },
  { id: 'T04', lhs: 'Type', rhs: ['string'] },
  { id: 'T05', lhs: 'Type', rhs: ['char'] },
  { id: 'T06', lhs: 'Type', rhs: ['void'] },

  // Declarations
  { id: 'D01', lhs: 'GlobalVarDecl', rhs: ['Type', 'IDENTIFIER', 'VarDeclTail', ';'], description: 'Global variable' },
  { id: 'D02', lhs: 'VarDeclTail', rhs: ['=', 'Expression'], description: 'Initialized variable' },
  { id: 'D03', lhs: 'VarDeclTail', rhs: ['[', 'Expression', ']'], description: 'Array declaration with size' },
  { id: 'D04', lhs: 'VarDeclTail', rhs: ['[', ']'], description: 'Unsized array declaration' },
  { id: 'D05', lhs: 'VarDeclTail', rhs: [EPSILON], description: 'Uninitialized variable' },

  { id: 'D06', lhs: 'FunctionDecl', rhs: ['Type', 'IDENTIFIER', '(', 'ParamListOpt', ')', 'Block'], description: 'Function declaration' },
  { id: 'D07', lhs: 'ParamListOpt', rhs: ['ParamList'] },
  { id: 'D08', lhs: 'ParamListOpt', rhs: [EPSILON] },
  { id: 'D09', lhs: 'ParamList', rhs: ['Param', 'ParamTail'] },
  { id: 'D10', lhs: 'ParamTail', rhs: [',', 'Param', 'ParamTail'] },
  { id: 'D11', lhs: 'ParamTail', rhs: [EPSILON] },
  { id: 'D12', lhs: 'Param', rhs: ['Type', 'IDENTIFIER', 'ArrayParamOpt'] },
  { id: 'D13', lhs: 'ArrayParamOpt', rhs: ['[', ']'] },
  { id: 'D14', lhs: 'ArrayParamOpt', rhs: [EPSILON] },

  // Block & Statements
  { id: 'S01', lhs: 'Block', rhs: ['{', 'StatementList', '}'], description: 'Block statement' },
  { id: 'S02', lhs: 'StatementList', rhs: ['Statement', 'StatementList'] },
  { id: 'S03', lhs: 'StatementList', rhs: [EPSILON] },

  { id: 'S04', lhs: 'Statement', rhs: ['VarDeclStmt'] },
  { id: 'S05', lhs: 'Statement', rhs: ['IfStmt'] },
  { id: 'S06', lhs: 'Statement', rhs: ['WhileStmt'] },
  { id: 'S07', lhs: 'Statement', rhs: ['DoWhileStmt'] },
  { id: 'S08', lhs: 'Statement', rhs: ['ForStmt'] },
  { id: 'S09', lhs: 'Statement', rhs: ['ReturnStmt'] },
  { id: 'S10', lhs: 'Statement', rhs: ['BreakStmt'] },
  { id: 'S11', lhs: 'Statement', rhs: ['ContinueStmt'] },
  { id: 'S12', lhs: 'Statement', rhs: ['ExprStmt'] },
  { id: 'S13', lhs: 'Statement', rhs: ['Block'] },

  { id: 'S14', lhs: 'VarDeclStmt', rhs: ['Type', 'IDENTIFIER', 'VarDeclTail', ';'] },
  { id: 'S15', lhs: 'IfStmt', rhs: ['if', '(', 'Expression', ')', 'Statement', 'ElseOpt'] },
  { id: 'S16', lhs: 'ElseOpt', rhs: ['else', 'Statement'] },
  { id: 'S17', lhs: 'ElseOpt', rhs: [EPSILON] },

  { id: 'S18', lhs: 'WhileStmt', rhs: ['while', '(', 'Expression', ')', 'Statement'] },
  { id: 'S19', lhs: 'DoWhileStmt', rhs: ['do', 'Statement', 'while', '(', 'Expression', ')', ';'] },

  { id: 'S20', lhs: 'ForStmt', rhs: ['for', '(', 'ForInit', ';', 'ForCond', ';', 'ForPost', ')', 'Statement'] },
  { id: 'S21', lhs: 'ForInit', rhs: ['Type', 'IDENTIFIER', 'VarDeclTail'] },
  { id: 'S22', lhs: 'ForInit', rhs: ['Expression'] },
  { id: 'S23', lhs: 'ForInit', rhs: [EPSILON] },
  { id: 'S24', lhs: 'ForCond', rhs: ['Expression'] },
  { id: 'S25', lhs: 'ForCond', rhs: [EPSILON] },
  { id: 'S26', lhs: 'ForPost', rhs: ['Expression'] },
  { id: 'S27', lhs: 'ForPost', rhs: [EPSILON] },

  { id: 'S28', lhs: 'ReturnStmt', rhs: ['return', 'ExprOpt', ';'] },
  { id: 'S29', lhs: 'ExprOpt', rhs: ['Expression'] },
  { id: 'S30', lhs: 'ExprOpt', rhs: [EPSILON] },

  { id: 'S31', lhs: 'BreakStmt', rhs: ['break', ';'] },
  { id: 'S32', lhs: 'ContinueStmt', rhs: ['continue', ';'] },
  { id: 'S33', lhs: 'ExprStmt', rhs: ['Expression', ';'] },

  // Expressions (Precedence hierarchy lowest to highest)
  // 1. Assignment
  { id: 'E01', lhs: 'Expression', rhs: ['LogicalOrExpr', 'AssignTail'] },
  { id: 'E02', lhs: 'AssignTail', rhs: ['AssignOp', 'Expression'] },
  { id: 'E03', lhs: 'AssignTail', rhs: [EPSILON] },
  { id: 'E04', lhs: 'AssignOp', rhs: ['='] },
  { id: 'E05', lhs: 'AssignOp', rhs: ['+='] },
  { id: 'E06', lhs: 'AssignOp', rhs: ['-='] },
  { id: 'E07', lhs: 'AssignOp', rhs: ['*='] },
  { id: 'E08', lhs: 'AssignOp', rhs: ['/='] },
  { id: 'E09', lhs: 'AssignOp', rhs: ['%='] },

  // 2. Logical OR
  { id: 'E10', lhs: 'LogicalOrExpr', rhs: ['LogicalAndExpr', 'LogicalOrTail'] },
  { id: 'E11', lhs: 'LogicalOrTail', rhs: ['||', 'LogicalAndExpr', 'LogicalOrTail'] },
  { id: 'E12', lhs: 'LogicalOrTail', rhs: [EPSILON] },

  // 3. Logical AND
  { id: 'E13', lhs: 'LogicalAndExpr', rhs: ['EqualityExpr', 'LogicalAndTail'] },
  { id: 'E14', lhs: 'LogicalAndTail', rhs: ['&&', 'EqualityExpr', 'LogicalAndTail'] },
  { id: 'E15', lhs: 'LogicalAndTail', rhs: [EPSILON] },

  // 4. Equality
  { id: 'E16', lhs: 'EqualityExpr', rhs: ['RelationalExpr', 'EqualityTail'] },
  { id: 'E17', lhs: 'EqualityTail', rhs: ['EqualityOp', 'RelationalExpr', 'EqualityTail'] },
  { id: 'E18', lhs: 'EqualityTail', rhs: [EPSILON] },
  { id: 'E19', lhs: 'EqualityOp', rhs: ['=='] },
  { id: 'E20', lhs: 'EqualityOp', rhs: ['!='] },

  // 5. Relational
  { id: 'E21', lhs: 'RelationalExpr', rhs: ['AdditiveExpr', 'RelationalTail'] },
  { id: 'E22', lhs: 'RelationalTail', rhs: ['RelationalOp', 'AdditiveExpr', 'RelationalTail'] },
  { id: 'E23', lhs: 'RelationalTail', rhs: [EPSILON] },
  { id: 'E24', lhs: 'RelationalOp', rhs: ['<'] },
  { id: 'E25', lhs: 'RelationalOp', rhs: ['<='] },
  { id: 'E26', lhs: 'RelationalOp', rhs: ['>'] },
  { id: 'E27', lhs: 'RelationalOp', rhs: ['>='] },

  // 6. Additive
  { id: 'E28', lhs: 'AdditiveExpr', rhs: ['MultiplicativeExpr', 'AdditiveTail'] },
  { id: 'E29', lhs: 'AdditiveTail', rhs: ['AdditiveOp', 'MultiplicativeExpr', 'AdditiveTail'] },
  { id: 'E30', lhs: 'AdditiveTail', rhs: [EPSILON] },
  { id: 'E31', lhs: 'AdditiveOp', rhs: ['+'] },
  { id: 'E32', lhs: 'AdditiveOp', rhs: ['-'] },

  // 7. Multiplicative
  { id: 'E33', lhs: 'MultiplicativeExpr', rhs: ['UnaryExpr', 'MultiplicativeTail'] },
  { id: 'E34', lhs: 'MultiplicativeTail', rhs: ['MultiplicativeOp', 'UnaryExpr', 'MultiplicativeTail'] },
  { id: 'E35', lhs: 'MultiplicativeTail', rhs: [EPSILON] },
  { id: 'E36', lhs: 'MultiplicativeOp', rhs: ['*'] },
  { id: 'E37', lhs: 'MultiplicativeOp', rhs: ['/'] },
  { id: 'E38', lhs: 'MultiplicativeOp', rhs: ['%'] },

  // 8. Unary
  { id: 'E39', lhs: 'UnaryExpr', rhs: ['PrefixOp', 'UnaryExpr'] },
  { id: 'E40', lhs: 'UnaryExpr', rhs: ['PostfixExpr'] },
  { id: 'E41', lhs: 'PrefixOp', rhs: ['+'] },
  { id: 'E42', lhs: 'PrefixOp', rhs: ['-'] },
  { id: 'E43', lhs: 'PrefixOp', rhs: ['!'] },
  { id: 'E44', lhs: 'PrefixOp', rhs: ['~'] },
  { id: 'E45', lhs: 'PrefixOp', rhs: ['++'] },
  { id: 'E46', lhs: 'PrefixOp', rhs: ['--'] },

  // 9. Postfix
  { id: 'E47', lhs: 'PostfixExpr', rhs: ['PrimaryExpr', 'PostfixTail'] },
  { id: 'E48', lhs: 'PostfixTail', rhs: ['PostfixOp', 'PostfixTail'] },
  { id: 'E49', lhs: 'PostfixTail', rhs: [EPSILON] },
  { id: 'E50', lhs: 'PostfixOp', rhs: ['(', 'ArgListOpt', ')'] },
  { id: 'E51', lhs: 'PostfixOp', rhs: ['[', 'Expression', ']'] },
  { id: 'E52', lhs: 'PostfixOp', rhs: ['++'] },
  { id: 'E53', lhs: 'PostfixOp', rhs: ['--'] },

  { id: 'E54', lhs: 'ArgListOpt', rhs: ['ArgList'] },
  { id: 'E55', lhs: 'ArgListOpt', rhs: [EPSILON] },
  { id: 'E56', lhs: 'ArgList', rhs: ['Expression', 'ArgTail'] },
  { id: 'E57', lhs: 'ArgTail', rhs: [',', 'Expression', 'ArgTail'] },
  { id: 'E58', lhs: 'ArgTail', rhs: [EPSILON] },

  // 10. Primary
  { id: 'E59', lhs: 'PrimaryExpr', rhs: ['IDENTIFIER'] },
  { id: 'E60', lhs: 'PrimaryExpr', rhs: ['INT_LITERAL'] },
  { id: 'E61', lhs: 'PrimaryExpr', rhs: ['FLOAT_LITERAL'] },
  { id: 'E62', lhs: 'PrimaryExpr', rhs: ['STRING_LITERAL'] },
  { id: 'E63', lhs: 'PrimaryExpr', rhs: ['CHAR_LITERAL'] },
  { id: 'E64', lhs: 'PrimaryExpr', rhs: ['true'] },
  { id: 'E65', lhs: 'PrimaryExpr', rhs: ['false'] },
  { id: 'E66', lhs: 'PrimaryExpr', rhs: ['null'] },
  { id: 'E67', lhs: 'PrimaryExpr', rhs: ['(', 'Expression', ')'] },
  { id: 'E68', lhs: 'PrimaryExpr', rhs: ['ArrayLiteral'] },

  // Array Literal
  { id: 'E69', lhs: 'ArrayLiteral', rhs: ['{', 'ElementListOpt', '}'] },
  { id: 'E70', lhs: 'ElementListOpt', rhs: ['ElementList'] },
  { id: 'E71', lhs: 'ElementListOpt', rhs: [EPSILON] },
  { id: 'E72', lhs: 'ElementList', rhs: ['Expression', 'ElementTail'] },
  { id: 'E73', lhs: 'ElementTail', rhs: [',', 'Expression', 'ElementTail'] },
  { id: 'E74', lhs: 'ElementTail', rhs: [EPSILON] },
];

export function getMiniCGrammar(): Grammar {
  const nonTerminalsSet = new Set<string>();
  for (const rule of MINIC_CFG_RULES) {
    nonTerminalsSet.add(rule.lhs);
  }

  const terminalsSet = new Set<string>();
  for (const rule of MINIC_CFG_RULES) {
    for (const sym of rule.rhs) {
      if (sym !== EPSILON && !nonTerminalsSet.has(sym)) {
        terminalsSet.add(sym);
      }
    }
  }

  return {
    startSymbol: 'Program',
    nonTerminals: Array.from(nonTerminalsSet),
    terminals: Array.from(terminalsSet),
    productions: MINIC_CFG_RULES,
  };
}
