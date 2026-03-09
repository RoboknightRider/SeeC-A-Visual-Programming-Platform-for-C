import React from 'react';
import { Position, Node, Edge } from '@xyflow/react';
import { GenericNode, icons, NodeWrapper, DataInput, TypeSelector } from './NodeHelpers';

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

export interface CNode {
  id: string;
  type: string;
  data: NodeData;
  position: { x: number; y: number };
}

export interface NodeContext {
  node: Node;
  nodes: Node[];
  edges: Edge[];
  visited: Set<string>;
  indentLevel: number;
  traverse: (currentId: string, indentLevel: number) => string;
}

export interface NodeField {
  key: string;
  label?: string;
  type: 'text' | 'select' | 'type-selector';
  placeholder?: string;
  options?: string[];
  className?: string;
}

export interface NodeHandle {
  id: string;
  type: 'source' | 'target';
  position: Position;
  label: string;
  color?: string;
  top?: string;
}

export interface NodeRegistryItem {
  type: string;
  component?: React.ComponentType<any>;
  icon: any;
  color?: string;
  label: string;
  category: 'Structure' | 'Data' | 'Control' | 'I/O';
  defaultData: Partial<NodeData>;
  fields?: NodeField[];
  handles?: NodeHandle[];
  strictPrev?: string[];
  toCode: (ctx: NodeContext) => string;
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

export const NODE_REGISTRY: Record<string, NodeRegistryItem> = {
  include: {
    type: 'include',
    icon: icons.include,
    color: 'blue',
    label: 'Include',
    category: 'Structure',
    defaultData: { value: 'stdio.h' },
    fields: [
      { key: 'value', label: 'Library', type: 'text', placeholder: 'stdio.h' }
    ],
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
    defaultData: {},
    toCode: () => '',
  },
  variable: {
    type: 'variable',
    icon: icons.variable,
    color: 'emerald',
    label: 'Variable',
    category: 'Data',
    defaultData: { varName: 'x', varType: 'int', value: '0' },
    fields: [
      { key: 'varType', label: 'Type', type: 'type-selector' },
      { key: 'varName', label: 'Name', type: 'text', placeholder: 'x' },
      { key: 'value', label: 'Value', type: 'text', placeholder: '0' }
    ],
    toCode: ({ node, indentLevel }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      return `${indent}${data.varType || 'int'} ${data.varName || 'x'} = ${data.value || '0'};\n`;
    }
  },
  array: {
    type: 'array',
    icon: icons.array,
    color: 'emerald',
    label: 'Array',
    category: 'Data',
    defaultData: { varName: 'arr', varType: 'int', size: '10', value: '1, 2, 3' },
    fields: [
      { key: 'varType', label: 'Type', type: 'type-selector' },
      { key: 'varName', label: 'Name', type: 'text', placeholder: 'arr' },
      { key: 'size', label: 'Size', type: 'text', placeholder: '10' },
      { key: 'value', label: 'Initial Values', type: 'text', placeholder: '1, 2, 3' }
    ],
    toCode: ({ node, indentLevel }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      return `${indent}${data.varType || 'int'} ${data.varName || 'arr'}[${data.size || '10'}] = {${data.value || ''}};\n`;
    }
  },
  assignment: {
    type: 'assignment',
    icon: icons.assignment,
    color: 'emerald',
    label: 'Assign',
    category: 'Data',
    defaultData: { varName: 'x', value: '10' },
    fields: [
      { key: 'varName', label: 'Variable', type: 'text', placeholder: 'x' },
      { key: 'value', label: 'Value', type: 'text', placeholder: '10' }
    ],
    toCode: ({ node, indentLevel }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      return `${indent}${data.varName || 'x'} = ${data.value || '0'};\n`;
    }
  },
  arithmetic: {
    type: 'arithmetic',
    icon: icons.arithmetic,
    color: 'emerald',
    label: 'Math',
    category: 'Data',
    defaultData: { varName: 'result', value: 'x + 1' },
    fields: [
      { key: 'varName', label: 'Result Variable', type: 'text', placeholder: 'result' },
      { key: 'value', label: 'Expression', type: 'text', placeholder: 'x + 1' }
    ],
    toCode: ({ node, indentLevel }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      return `${indent}${data.varName || 'result'} = ${data.value || '0'};\n`;
    }
  },
  if: {
    type: 'if',
    icon: icons.if,
    color: 'blue',
    label: 'If',
    category: 'Control',
    defaultData: { condition: 'x > 0' },
    fields: [
      { key: 'condition', label: 'Condition', type: 'text', placeholder: 'x > 0' }
    ],
    handles: [
      { id: 'body', type: 'source', position: Position.Right, label: 'Body', color: 'amber', top: '25%' }
    ],
    toCode: ({ node, nodes, edges, indentLevel, traverse }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      let code = `${indent}if (${data.condition || '1'}) {\n`;
      const bodyEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'body');
      if (bodyEdge) code += traverse(bodyEdge.target, indentLevel + 1);
      code += `${indent}}`;
      
      const nextEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'next');
      const nextNode = nextEdge ? nodes.find(n => n.id === nextEdge.target) : null;
      if (nextNode && (nextNode.data.type === 'else' || nextNode.data.type === 'else-if')) {
        return code + ' ';
      }
      return code + '\n';
    }
  },
  'else-if': {
    type: 'else-if',
    icon: icons['else-if'],
    color: 'blue',
    label: 'Else If',
    category: 'Control',
    defaultData: { condition: 'x < 0' },
    fields: [
      { key: 'condition', label: 'Condition', type: 'text', placeholder: 'x < 0' }
    ],
    strictPrev: ['if', 'else-if'],
    handles: [
      { id: 'body', type: 'source', position: Position.Right, label: 'Body', color: 'amber', top: '25%' }
    ],
    toCode: ({ node, nodes, edges, indentLevel, traverse }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      let code = `else if (${data.condition || '1'}) {\n`;
      const bodyEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'body');
      if (bodyEdge) code += traverse(bodyEdge.target, indentLevel + 1);
      code += `${indent}}`;

      const nextEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'next');
      const nextNode = nextEdge ? nodes.find(n => n.id === nextEdge.target) : null;
      if (nextNode && (nextNode.data.type === 'else' || nextNode.data.type === 'else-if')) {
        return code + ' ';
      }
      return code + '\n';
    }
  },
  else: {
    type: 'else',
    icon: icons.else,
    color: 'blue',
    label: 'Else',
    category: 'Control',
    defaultData: {},
    strictPrev: ['if', 'else-if'],
    handles: [
      { id: 'body', type: 'source', position: Position.Right, label: 'Body', color: 'amber', top: '25%' }
    ],
    toCode: ({ node, edges, indentLevel, traverse }) => {
      const indent = '    '.repeat(indentLevel);
      let code = `else {\n`;
      const bodyEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'body');
      if (bodyEdge) code += traverse(bodyEdge.target, indentLevel + 1);
      code += `${indent}}\n`;
      return code;
    }
  },
  while: {
    type: 'while',
    icon: icons.while,
    color: 'amber',
    label: 'While',
    category: 'Control',
    defaultData: { condition: 'x < 10' },
    fields: [
      { key: 'condition', label: 'Condition', type: 'text', placeholder: 'x < 10' }
    ],
    handles: [
      { id: 'body', type: 'source', position: Position.Right, label: 'Body', color: 'amber', top: '25%' }
    ],
    toCode: ({ node, edges, indentLevel, traverse }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      let code = `${indent}while (${data.condition || '1'}) {\n`;
      const bodyEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'body');
      if (bodyEdge) code += traverse(bodyEdge.target, indentLevel + 1);
      code += `${indent}}\n`;
      return code;
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
      { key: 'condition', label: 'Condition', type: 'text', placeholder: 'x < 10' }
    ],
    handles: [
      { id: 'body', type: 'source', position: Position.Right, label: 'Body', color: 'amber', top: '25%' }
    ],
    toCode: ({ node, edges, indentLevel, traverse }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      let code = `${indent}do {\n`;
      const bodyEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'body');
      if (bodyEdge) code += traverse(bodyEdge.target, indentLevel + 1);
      code += `${indent}} while (${data.condition || '1'});\n`;
      return code;
    }
  },
  for: {
    type: 'for',
    icon: icons.for,
    color: 'amber',
    label: 'For',
    category: 'Control',
    defaultData: { init: 'int i = 0', condition: 'i < 10', increment: 'i++' },
    fields: [
      { key: 'init', label: 'Init', type: 'text', placeholder: 'int i = 0' },
      { key: 'condition', label: 'Condition', type: 'text', placeholder: 'i < 10' },
      { key: 'increment', label: 'Increment', type: 'text', placeholder: 'i++' }
    ],
    handles: [
      { id: 'body', type: 'source', position: Position.Right, label: 'Body', color: 'amber', top: '25%' }
    ],
    toCode: ({ node, edges, indentLevel, traverse }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      let code = `${indent}for (${data.init || ''}; ${data.condition || '1'}; ${data.increment || ''}) {\n`;
      const bodyEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'body');
      if (bodyEdge) code += traverse(bodyEdge.target, indentLevel + 1);
      code += `${indent}}\n`;
      return code;
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
    handles: [
      { id: 'body', type: 'source', position: Position.Right, label: 'Body', color: 'amber', top: '25%' }
    ],
    toCode: ({ node, edges, indentLevel, traverse }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      let code = `${indent}switch (${data.condition || 'x'}) {\n`;
      const bodyEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'body');
      if (bodyEdge) code += traverse(bodyEdge.target, indentLevel + 1);
      code += `${indent}}\n`;
      return code;
    }
  },
  case: {
    type: 'case',
    icon: icons.case,
    color: 'purple',
    label: 'Case',
    category: 'Control',
    defaultData: { condition: '1' },
    fields: [
      { key: 'condition', label: 'Value', type: 'text', placeholder: '1' }
    ],
    strictPrev: ['switch', 'case'],
    handles: [
      { id: 'body', type: 'source', position: Position.Right, label: 'Body', color: 'amber', top: '25%' }
    ],
    toCode: ({ node, edges, indentLevel, traverse }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      let code = `${indent}case ${data.condition || '1'}:\n`;
      const bodyEdge = edges.find(e => e.source === node.id && e.sourceHandle === 'body');
      if (bodyEdge) code += traverse(bodyEdge.target, indentLevel + 1);
      return code;
    }
  },
  break: {
    type: 'break',
    icon: icons.break,
    color: 'rose',
    label: 'Break',
    category: 'Control',
    defaultData: {},
    toCode: ({ indentLevel }) => `${'    '.repeat(indentLevel)}break;\n`
  },
  continue: {
    type: 'continue',
    icon: icons.continue,
    color: 'amber',
    label: 'Continue',
    category: 'Control',
    defaultData: {},
    toCode: ({ indentLevel }) => `${'    '.repeat(indentLevel)}continue;\n`
  },
  printf: {
    type: 'printf',
    icon: icons.printf,
    color: 'blue',
    label: 'Printf',
    category: 'I/O',
    defaultData: { value: '"Hello World\\n"' },
    fields: [
      { key: 'value', label: 'Arguments', type: 'text', placeholder: '"%d", x' }
    ],
    toCode: ({ node, indentLevel }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      return `${indent}printf(${data.value || '"Hello World\\n"'});\n`;
    }
  },
  scanf: {
    type: 'scanf',
    icon: icons.scanf,
    color: 'blue',
    label: 'Scanf',
    category: 'I/O',
    defaultData: { value: '"%d", &x' },
    fields: [
      { key: 'value', label: 'Arguments', type: 'text', placeholder: '"%d", &x' }
    ],
    toCode: ({ node, indentLevel }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      return `${indent}scanf(${data.value || '"%d", &x'});\n`;
    }
  },
  'function-def': {
    type: 'function-def',
    icon: icons['function-def'],
    color: 'purple',
    label: 'Define Func',
    category: 'Structure',
    defaultData: { varName: 'myFunc', varType: 'void', params: 'int a' },
    fields: [
      { key: 'varType', label: 'Return Type', type: 'type-selector' },
      { key: 'varName', label: 'Name', type: 'text', placeholder: 'myFunc' },
      { key: 'params', label: 'Parameters', type: 'text', placeholder: 'int a, int b' }
    ],
    handles: [
      { id: 'body', type: 'source', position: Position.Right, label: 'Body', color: 'amber', top: '25%' }
    ],
    toCode: () => '',
  },
  'function-call': {
    type: 'function-call',
    icon: icons['function-call'],
    color: 'purple',
    label: 'Call Func',
    category: 'I/O',
    defaultData: { varName: 'myFunc', params: '5' },
    fields: [
      { key: 'varName', label: 'Name', type: 'text', placeholder: 'myFunc' },
      { key: 'params', label: 'Arguments', type: 'text', placeholder: '5, x' }
    ],
    toCode: ({ node, indentLevel }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      return `${indent}${data.varName || 'func'}(${data.params || ''});\n`;
    }
  },
  return: {
    type: 'return',
    icon: icons.return,
    color: 'rose',
    label: 'Return',
    category: 'I/O',
    defaultData: { value: '0' },
    fields: [
      { key: 'value', label: 'Value', type: 'text', placeholder: '0' }
    ],
    toCode: ({ node, indentLevel }) => {
      const data = node.data as unknown as NodeData;
      const indent = '    '.repeat(indentLevel);
      return `${indent}return ${data.value || '0'};\n`;
    }
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
      const indent = '    '.repeat(indentLevel);
      return `${indent}// ${data.value || ''}\n`;
    }
  },
};
