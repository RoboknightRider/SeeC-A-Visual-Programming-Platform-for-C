import React from 'react';
import { Node, Edge } from '@xyflow/react';
import { GenericNode, icons} from './NodeHelpers';

export type NodeType = string;

export interface NodeData {
  label: string;
  type: NodeType;
  value?: string;
  varName?: string;
  varType?: 'int' | 'float' | 'char' | 'double' | 'void' | 'long';
  operator?: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '>' | '<=' | '>=' | '&&' | '||';
  condition?: string;
  init?: string;
  increment?: string;
  size?: string; // For arrays
  params?: string; // For function definitions/calls
  inputs?: string[];
  outputs?: string[];
}

export interface NodeContext {
  node: Node;
  nodes: Node[];
  edges: Edge[];
  visited: Set<string>;
  indentLevel: number;
  traverse: (currentId: string, indentLevel: number) => string;
  getFieldValue: (fieldKey: string) => string;
}

const getIndent = (level: number) => '    '.repeat(level);

// Generates the code chained from one of a node's source handles ('' when nothing is connected).
const traverseHandle = ({ node, edges, traverse }: NodeContext, handle: 'body' | 'next', indentLevel: number) => {
  const edge = edges.find(e => e.source === node.id && e.sourceHandle === handle);
  return edge ? traverse(edge.target, indentLevel) : '';
};

// Builds a node's statement form from its expression form: `<indent><expression>;`.
const asStatement = (toExpression: (ctx: NodeContext) => string) =>
  (ctx: NodeContext) => `${getIndent(ctx.indentLevel)}${toExpression(ctx)};\n`;

const functionCallExpression = ({ node, getFieldValue }: NodeContext) =>
  `${(node.data as unknown as NodeData).varName || 'func'}(${getFieldValue('params') || ''})`;

const freeExpression = ({ node, getFieldValue }: NodeContext) =>
  `free(${getFieldValue('varName') || (node.data as unknown as NodeData).varName || 'items'})`;

const arithmeticExpression = ({ node, getFieldValue }: NodeContext) => {
  const data = node.data as unknown as NodeData;
  return `${data.varName || 'x'} ${data.operator || '+'}= ${getFieldValue('value') || '0'}`;
};

const literalExpression = ({ getFieldValue }: NodeContext) => getFieldValue('value');

// Emits a body block for if / else-if, keeping a following else on the same line as the closing brace.
const closeConditionalBlock = (ctx: NodeContext, header: string) => {
  const { node, nodes, edges, indentLevel } = ctx;
  const indent = getIndent(indentLevel);
  const code = `${header} {\n${traverseHandle(ctx, 'body', indentLevel + 1)}${indent}}`;
  const nextEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'next');
  const nextType = nextEdge ? nodes.find(n => n.id === nextEdge.target)?.data.type : undefined;
  return code + (nextType === 'else' || nextType === 'else-if' ? ' ' : '\n');
};

export interface NodeField {
  key: string;
  label?: string;
  type: 'text' | 'select' | 'type-selector';
  placeholder?: string;
  options?: string[];
  className?: string;
  connectable?: boolean;
}

export interface NodeRegistryItem {
  type: string;
  component?: React.ComponentType<any>;
  icon: any;
  color?: string;
  label: string;
  category: string;
  layout?: 'vertical' | 'horizontal';
  defaultData: Partial<NodeData>;
  fields?: NodeField[];
  body?: boolean;
  strictPrev?: string[];
  hidePrevHandle?: boolean;
  hideNextHandle?: boolean;
  syntax?: string | string[];
  tailSyntax?: string;
  parserBodyHandle?: 'body' | 'next';
  toCode: (ctx: NodeContext) => string;
  toExpression?: (ctx: NodeContext) => string;
}

// Fallback BaseNode for backward compatibility or generic use
export const BaseNode = React.memo((props: any) => {
  const registryItem = NODE_REGISTRY[props.data.type as keyof typeof NODE_REGISTRY];
  if (registryItem) {
    const Component = registryItem.component || GenericNode;
    return <Component {...props} registryItem={registryItem} />;
  }
  return <GenericNode {...props} />;
});

// --- Node Registry ---

export const NODE_CATEGORY_ORDER = ['Structure', 'Data', 'Control', 'I/O', 'Memory'] as const;

export const NODE_REGISTRY: Record<string, NodeRegistryItem> = {
  include: {
    type: 'include',
    icon: icons.include,
    color: 'blue',
    label: 'Include',
    category: 'Structure',
    hidePrevHandle: true,
    hideNextHandle: true,
    defaultData: { value: 'stdio.h' },
    fields: [
      { key: 'value', label: 'Library', type: 'text', placeholder: 'stdio.h' }
    ],
    syntax: '#include <{{value}}>',
    toCode: ({ node }) => {
      const data = node.data as unknown as NodeData;
      return `#include <${data.value || 'stdio.h'}>\n`;
    },
  },
  main: {
    type: 'main',
    icon: icons.main,
    color: 'emerald',
    label: 'Main',
    category: 'Structure',
    hidePrevHandle: true,
    defaultData: {},
    syntax: [
      'int main({{params}}) {',
      'void main({{params}}) {',
      'int main() {',
      'void main() {'
    ],
    parserBodyHandle: 'next',
    toCode: () => '',
  },
  if: {
    type: 'if',
    icon: icons.if,
    color: 'blue',
    label: 'If',
    category: 'Control',
    defaultData: { condition: 'x > 0' },
    fields: [
      { key: 'condition', label: 'Condition', type: 'text', placeholder: 'x > 0', connectable: true }
    ],
    syntax: 'if ({{condition}}) {',
    body: true,
    toCode: (ctx) =>
      closeConditionalBlock(ctx, `${getIndent(ctx.indentLevel)}if (${ctx.getFieldValue('condition') || '1'})`)
  },
  'else-if': {
    type: 'else-if',
    icon: icons['else-if'],
    color: 'blue',
    label: 'Else If',
    category: 'Control',
    defaultData: { condition: 'x < 0' },
    fields: [
      { key: 'condition', label: 'Condition', type: 'text', placeholder: 'x < 0', connectable: true }
    ],
    syntax: 'else if ({{condition}}) {',
    strictPrev: ['if', 'else-if'],
    body: true,
    toCode: (ctx) => closeConditionalBlock(ctx, `else if (${ctx.getFieldValue('condition') || '1'})`)
  },
  else: {
    type: 'else',
    icon: icons.else,
    color: 'blue',
    label: 'Else',
    category: 'Control',
    defaultData: {},
    syntax: 'else {',
    strictPrev: ['if', 'else-if'],
    body: true,
    toCode: (ctx) => `else {\n${traverseHandle(ctx, 'body', ctx.indentLevel + 1)}${getIndent(ctx.indentLevel)}}\n`
  },
  while: {
    type: 'while',
    icon: icons.while,
    color: 'amber',
    label: 'While',
    category: 'Control',
    defaultData: { condition: 'x < 10' },
    fields: [
      { key: 'condition', label: 'Condition', type: 'text', placeholder: 'x < 10', connectable: true }
    ],
    syntax: 'while ({{condition}}) {',
    body: true,
    toCode: (ctx) => {
      const indent = getIndent(ctx.indentLevel);
      const body = traverseHandle(ctx, 'body', ctx.indentLevel + 1);
      return `${indent}while (${ctx.getFieldValue('condition') || '1'}) {\n${body}${indent}}\n`;
    }
  },
  'do-while': {
    type: 'do-while',
    icon: icons['do-while'],
    color: 'amber',
    label: 'Do-While',
    category: 'Control',
    defaultData: { condition: 'x < 10' },
    fields: [
      { key: 'condition', label: 'Condition', type: 'text', placeholder: 'x < 10', connectable: true }
    ],
    syntax: 'do {',
    tailSyntax: 'while ({{condition}});',
    body: true,
    toCode: (ctx) => {
      const indent = getIndent(ctx.indentLevel);
      const body = traverseHandle(ctx, 'body', ctx.indentLevel + 1);
      return `${indent}do {\n${body}${indent}} while (${ctx.getFieldValue('condition') || '1'});\n`;
    }
  },
  for: {
    type: 'for',
    icon: icons.for,
    color: 'amber',
    label: 'For',
    category: 'Control',
    layout: 'horizontal',
    defaultData: { init: 'int i = 0', condition: 'i < 10', increment: 'i++' },
    fields: [
      { key: 'init', label: 'Init', type: 'text', placeholder: 'int i = 0' },
      { key: 'condition', label: 'Condition', type: 'text', placeholder: 'i < 10' },
      { key: 'increment', label: 'Increment', type: 'text', placeholder: 'i++' }
    ],
    syntax: 'for ({{init}}; {{condition}}; {{increment}}) {',
    body: true,
    toCode: (ctx) => {
      const data = ctx.node.data as unknown as NodeData;
      const indent = getIndent(ctx.indentLevel);
      const body = traverseHandle(ctx, 'body', ctx.indentLevel + 1);
      return `${indent}for (${data.init || ''}; ${data.condition || '1'}; ${data.increment || ''}) {\n${body}${indent}}\n`;
    }
  },
  switch: {
    type: 'switch',
    icon: icons.switch,
    color: 'purple',
    label: 'Switch',
    category: 'Control',
    defaultData: { condition: 'x' },
    fields: [
      { key: 'condition', label: 'Variable', type: 'text', placeholder: 'x' }
    ],
    syntax: 'switch ({{condition}}) {',
    body: true,
    toCode: (ctx) => {
      const data = ctx.node.data as unknown as NodeData;
      const indent = getIndent(ctx.indentLevel);
      // No indent increment here so cases align with switch
      const body = traverseHandle(ctx, 'body', ctx.indentLevel);
      return `${indent}switch (${data.condition || 'x'}) {\n${body}${indent}}\n`;
    }
  },
  case: {
    type: 'case',
    icon: icons.case,
    color: 'purple',
    label: 'Case',
    category: 'Control',
    defaultData: { condition: '' },
    fields: [
      { key: 'condition', label: 'Value', type: 'text', placeholder: '1' }
    ],
    syntax: [
      'case {{condition}}:',
      'default:'
    ],
    strictPrev: ['switch', 'case'],
    body: true,
    toCode: (ctx) => {
      const data = ctx.node.data as unknown as NodeData;
      const indent = getIndent(ctx.indentLevel);
      const caseCondition = (data.condition || '').trim();
      const label = caseCondition ? `${indent}case ${caseCondition}:\n` : `${indent}default:\n`;
      // Case body is indented; the next case continues at the same level
      return label + traverseHandle(ctx, 'body', ctx.indentLevel + 1) + traverseHandle(ctx, 'next', ctx.indentLevel);
    }
  },
  break: {
    type: 'break',
    icon: icons.break,
    color: 'rose',
    label: 'Break',
    category: 'Control',
    defaultData: {},
    syntax: 'break;',
    toCode: ({ indentLevel }) => `${getIndent(indentLevel)}break;\n`
  },
  continue: {
    type: 'continue',
    icon: icons.continue,
    color: 'amber',
    label: 'Continue',
    category: 'Control',
    defaultData: {},
    syntax: 'continue;',
    toCode: ({ indentLevel }) => `${getIndent(indentLevel)}continue;\n`
  },
  printf: {
    type: 'printf',
    icon: icons.printf,
    color: 'blue',
    label: 'Printf',
    category: 'I/O',
    layout: 'horizontal',
    defaultData: { value: '"Hello World\\n"', params: '' },
    fields: [
      { key: 'value', label: 'Format String', type: 'text', placeholder: '"%d"', connectable: true },
      { key: 'params', label: 'Arguments', type: 'text', placeholder: 'x, y', connectable: true }
    ],
    syntax: [
      'printf({{value}}, {{params}});',
      'printf({{value}});'
    ],
    toCode: ({ indentLevel, getFieldValue }) => {
      const indent = getIndent(indentLevel);
      const format = getFieldValue('value') || '"\\n"';
      const params = getFieldValue('params');
      if (params) {
        return `${indent}printf(${format}, ${params});\n`;
      }
      return `${indent}printf(${format});\n`;
    }
  },
  scanf: {
    type: 'scanf',
    icon: icons.scanf,
    color: 'blue',
    label: 'Scanf',
    category: 'I/O',
    layout: 'horizontal',
    defaultData: { value: '"%d"', params: '&x' },
    fields: [
      { key: 'value', label: 'Format String', type: 'text', placeholder: '"%d"', connectable: true },
      { key: 'params', label: 'Arguments', type: 'text', placeholder: '&x, &y', connectable: true }
    ],
    syntax: 'scanf({{value}}, {{params}});',
    toCode: ({ indentLevel, getFieldValue }) => {
      const indent = getIndent(indentLevel);
      const format = getFieldValue('value') || '"%d"';
      const params = getFieldValue('params');
      return `${indent}scanf(${format}, ${params});\n`;
    }
  },
  'function-def': {
    type: 'function-def',
    icon: icons['function-def'],
    color: 'purple',
    label: 'Define Func',
    category: 'Structure',
    layout: 'horizontal',
    hidePrevHandle: true,
    defaultData: { varName: 'myFunc', varType: 'void', params: 'int a' },
    fields: [
      { key: 'varType', label: 'Return Type', type: 'type-selector' },
      { key: 'varName', label: 'Name', type: 'text', placeholder: 'myFunc' },
      { key: 'params', label: 'Parameters', type: 'text', placeholder: 'int a, int b' }
    ],
    syntax: [
      '{{varType}} {{varName}}({{params}}) {',
      '{{varType}} {{varName}}() {'
    ],
    parserBodyHandle: 'next',
    toCode: ({ node, edges, traverse }) => {
      const data = node.data as unknown as NodeData;
      let code = `${data.varType || 'void'} ${data.varName || 'myFunc'}(${data.params || ''}) {\n`;
      const bodyEdge = edges.find(e => e.source === node.id && (e.sourceHandle === 'next' || !e.sourceHandle));
      if (bodyEdge) {
        code += traverse(bodyEdge.target, 1);
      }
      code += '}\n\n';
      return code;
    },
  },
  'function-call': {
    type: 'function-call',
    icon: icons['function-call'],
    color: 'purple',
    label: 'Call Func',
    category: 'I/O',
    layout: 'horizontal',
    defaultData: { varName: 'myFunc', params: '' },
    fields: [
      { key: 'varName', label: 'Name', type: 'text', placeholder: 'myFunc' },
      { key: 'params', label: 'Arguments', type: 'text', placeholder: '5, x', connectable: true }
    ],
    syntax: [
      '{{varName}}({{params}});',
      '{{varName}}();'
    ],
    toCode: asStatement(functionCallExpression),
    toExpression: functionCallExpression
  },
  malloc: {
    type: 'malloc',
    icon: icons.variable,
    color: 'emerald',
    label: 'Malloc',
    category: 'Memory',
    layout: 'horizontal',
    defaultData: { varName: 'items', varType: 'int', size: '10' },
    fields: [
      { key: 'varName', label: 'Pointer', type: 'text', placeholder: 'items' },
      { key: 'varType', label: 'Element Type', type: 'type-selector' },
      { key: 'size', label: 'Count', type: 'text', placeholder: '10', connectable: true }
    ],
    syntax: '{{varType}} *{{varName}} = malloc(({{size}}) * sizeof({{varType}}));',
    toCode: ({ node, indentLevel, getFieldValue }) => {
      const data = node.data as unknown as NodeData;
      const varName = data.varName || 'items';
      const varType = data.varType || 'int';
      const size = getFieldValue('size') || '10';
      return `${getIndent(indentLevel)}${varType} *${varName} = malloc((${size}) * sizeof(${varType}));\n`;
    },
    toExpression: ({ node, getFieldValue }) => {
      const data = node.data as unknown as NodeData;
      const varType = data.varType || 'int';
      const size = getFieldValue('size') || '10';
      return `malloc((${size}) * sizeof(${varType}))`;
    }
  },
  realloc: {
    type: 'realloc',
    icon: icons.array,
    color: 'emerald',
    label: 'Realloc',
    category: 'Memory',
    layout: 'horizontal',
    defaultData: { varName: 'items', varType: 'int', size: '20' },
    fields: [
      { key: 'varName', label: 'Pointer', type: 'text', placeholder: 'items' },
      { key: 'varType', label: 'Element Type', type: 'type-selector' },
      { key: 'size', label: 'New Count', type: 'text', placeholder: '20', connectable: true }
    ],
    syntax: '{{varName}} = realloc({{varName}}, ({{size}}) * sizeof({{varType}}));',
    toCode: ({ node, indentLevel, getFieldValue }) => {
      const data = node.data as unknown as NodeData;
      const varName = data.varName || 'items';
      const varType = data.varType || 'int';
      const size = getFieldValue('size') || '20';
      return `${getIndent(indentLevel)}${varName} = realloc(${varName}, (${size}) * sizeof(${varType}));\n`;
    },
    toExpression: ({ node, getFieldValue }) => {
      const data = node.data as unknown as NodeData;
      const varName = data.varName || 'items';
      const varType = data.varType || 'int';
      const size = getFieldValue('size') || '20';
      return `realloc(${varName}, (${size}) * sizeof(${varType}))`;
    }
  },
  free: {
    type: 'free',
    icon: icons.return,
    color: 'rose',
    label: 'Free',
    category: 'Memory',
    layout: 'horizontal',
    defaultData: { varName: 'items' },
    fields: [
      { key: 'varName', label: 'Pointer', type: 'text', placeholder: 'items', connectable: true }
    ],
    syntax: 'free({{varName}});',
    toCode: asStatement(freeExpression),
    toExpression: freeExpression
  },
  return: {
    type: 'return',
    icon: icons.return,
    color: 'rose',
    label: 'Return',
    category: 'I/O',
    layout: 'horizontal',
    defaultData: { value: '0' },
    fields: [
      { key: 'value', label: 'Value', type: 'text', placeholder: '0', connectable: true }
    ],
    syntax: 'return {{value}};',
    toCode: ({ indentLevel, getFieldValue }) => {
      const value = getFieldValue('value');
      return `${getIndent(indentLevel)}return ${value || '0'};\n`;
    }
  },
  variable: {
    type: 'variable',
    icon: icons.variable,
    color: 'emerald',
    label: 'Variable',
    category: 'Data',
    layout: 'horizontal',
    defaultData: { varName: 'x', varType: 'int', value: '' },
    fields: [
      { key: 'varType', label: 'Type', type: 'type-selector' },
      { key: 'varName', label: 'Name', type: 'text', placeholder: 'x' },
      { key: 'value', label: 'Value', type: 'text', placeholder: '', connectable: true }
    ],
    syntax: [
      '{{varType}} {{varName}} = {{value}};',
      '{{varType}} {{varName}};'
    ],
    toCode: ({ node, indentLevel, getFieldValue }) => {
      const data = node.data as unknown as NodeData;
      const value = getFieldValue('value');
      const indent = getIndent(indentLevel);
      const varType = data.varType || 'int';
      const varName = data.varName || 'x';

      // Check if value is defined and non-empty (ignoring whitespace)
      const hasValue = value !== undefined && value !== null && String(value).trim() !== '';

      if (hasValue) {
        return `${indent}${varType} ${varName} = ${value};\n`;
      } else {
        return `${indent}${varType} ${varName};\n`;
      }
    },
    toExpression: ({ node }) => {
      const data = node.data as unknown as NodeData;
      return data.varName || 'x';
    }
  },
  array: {
    type: 'array',
    icon: icons.array,
    color: 'emerald',
    label: 'Array',
    category: 'Data',
    layout: 'horizontal',
    defaultData: { varName: 'arr', varType: 'int', size: '10', value: '' },
    fields: [
      { key: 'varType', label: 'Type', type: 'type-selector' },
      { key: 'varName', label: 'Name', type: 'text', placeholder: 'arr' },
      { key: 'size', label: 'Size', type: 'text', placeholder: '10' },
      { key: 'value', label: 'Initial Values', type: 'text', placeholder: '' }
    ],
    syntax: [
      '{{varType}} {{varName}}[{{size}}] = { {{value}} };',
      '{{varType}} {{varName}}[{{size}}];'
    ],
    toCode: ({ node, indentLevel }) => {
      const data = node.data as unknown as NodeData;
      const indent = getIndent(indentLevel);
      const varType = data.varType || 'int';
      const varName = data.varName || 'arr';
      const size = data.size || '10';

      // Check if value exists and is not just whitespace
      const hasValue = data.value !== undefined && data.value !== null && String(data.value).trim() !== '';

      if (hasValue) {
        return `${indent}${varType} ${varName}[${size}] = {${data.value}};\n`;
      }

      return `${indent}${varType} ${varName}[${size}];\n`;
    }
  },
  assignment: {
    type: 'assignment',
    icon: icons.assignment,
    color: 'emerald',
    label: 'Assign',
    category: 'Data',
    layout: 'horizontal',
    defaultData: { varName: 'x', value: '10' },
    fields: [
      { key: 'varName', label: 'Variable', type: 'text', placeholder: 'x' },
      { key: 'value', label: 'Value', type: 'text', placeholder: '10', connectable: true }
    ],
    syntax: '{{varName}} = {{value}};',
    toCode: ({ node, indentLevel, getFieldValue }) => {
      const data = node.data as unknown as NodeData;
      const value = getFieldValue('value');
      return `${getIndent(indentLevel)}${data.varName || 'x'} = ${value || '0'};\n`;
    }
  },
  arithmetic: {
    type: 'arithmetic',
    icon: icons.arithmetic,
    color: 'emerald',
    label: 'Math',
    category: 'Data',
    layout: 'horizontal',
    defaultData: { varName: 'x', operator: '+', value: '1' },
    fields: [
      { key: 'varName', label: 'Variable', type: 'text', placeholder: 'x' },
      { key: 'operator', label: 'Op', type: 'select', options: ['+', '-', '*', '/', '%'] },
      { key: 'value', label: 'Value', type: 'text', placeholder: '1', connectable: true }
    ],
    syntax: [
      '{{varName}} {{operator}}= {{value}};',
      '{{varName}}{{operator}}={{value}};'
    ],
    toCode: asStatement(arithmeticExpression),
    toExpression: arithmeticExpression
  },
  comment: {
    type: 'comment',
    icon: icons.comment,
    color: 'zinc',
    label: 'Comment',
    category: 'Structure',
    defaultData: { value: 'This is a comment' },
    fields: [
      { key: 'value', label: 'Text', type: 'text', placeholder: 'Comment...' }
    ],
    toCode: ({ node, indentLevel }) => {
      const data = node.data as unknown as NodeData;
      return `${getIndent(indentLevel)}// ${data.value || ''}\n`;
    }
  },
  literal: {
    type: 'literal',
    icon: icons.variable,
    color: 'emerald',
    label: 'Literal',
    category: 'Data',
    defaultData: { value: '0' },
    fields: [
      { key: 'value', label: 'Value', type: 'text', placeholder: '0' }
    ],
    syntax: '{{value}};',
    toCode: asStatement(literalExpression),
    toExpression: literalExpression
  },
};
