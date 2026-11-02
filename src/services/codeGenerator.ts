import { Edge, Node } from '@xyflow/react';
import { NODE_REGISTRY } from '../components/Nodes';

// Field values are whatever the user typed into the node.
const readField = (node: Node, key: string): string => (node.data as any)[key] || '';

/**
 * Generates C source code from a set of React Flow nodes and edges.
 *
 * @param nodes Array of React Flow nodes
 * @param edges Array of React Flow edges
 * @returns Generated C code string
 */
export function generateCCode(nodes: Node[], edges: Edge[]): string {
  let code = '';

  // 1. Preprocessor: includes first, then macro definitions (each group in canvas order)
  const preprocessor = [
    ...nodes.filter(n => n.data.type === 'include'),
    ...nodes.filter(n => n.data.type === 'define'),
  ];

  preprocessor.forEach(n => {
    code += NODE_REGISTRY[n.data.type as string].toCode({
      node: n,
      nodes,
      edges,
      visited: new Set(),
      indentLevel: 0,
      traverse: () => '',
      getFieldValue: (key: string) => readField(n, key)
    });
  });

  if (preprocessor.length > 0) code += '\n';

  const functionDefs = nodes.filter(n => n.data.type === 'function-def');
  const visited = new Set<string>();
  const nodeById = new Map(nodes.map(n => [n.id, n] as const));

  /**
   * Recursively traverses the flow starting from a node.
   * 
   * @param currentId ID of the node to start from
   * @param indentLevel Current indentation level
   * @returns Generated code for the sub-flow
   */
  function traverse(currentId: string, indentLevel: number): string {
    if (visited.has(currentId)) return '';
    visited.add(currentId);

    const node = nodeById.get(currentId);
    if (!node) return '';

    const registryItem = NODE_REGISTRY[node.data.type as string];
    let blockCode = '';

    if (registryItem?.toCode) {
      blockCode += registryItem.toCode({
        node,
        nodes,
        edges,
        visited,
        indentLevel,
        traverse,
        getFieldValue: (key: string) => readField(node, key)
      });
    }

    // Find next node in the linear execution flow
    const nextEdge = edges.find(e => e.source === currentId && (e.sourceHandle === 'next' || !e.sourceHandle));
    if (nextEdge) {
      blockCode += traverse(nextEdge.target, indentLevel);
    }

    return blockCode;
  }

  // 2. Global declarations: everything chained from a Global Scope node is emitted at file
  // scope, before any function, so both functions and main can use it.
  let globalsCode = '';
  nodes.filter(n => n.data.type === 'globals').forEach(globalsNode => {
    const startEdge = edges.find(e => e.source === globalsNode.id && e.sourceHandle === 'next');
    if (startEdge) globalsCode += traverse(startEdge.target, 0);
  });
  if (globalsCode) code += globalsCode + '\n';

  // 3. Function definitions (excluding main)
  functionDefs.forEach(func => {
    const registryItem = NODE_REGISTRY['function-def'];
    if (registryItem) {
      code += registryItem.toCode({
        node: func,
        nodes,
        edges,
        visited,
        indentLevel: 0,
        traverse,
        getFieldValue: (key: string) => readField(func, key)
      });
    }
  });

  // 4. Main Function Generation
  const mainNode = nodes.find(n => n.data.type === 'main');
  if (!mainNode) return "// Add a 'Main' node to start generating code.\n" + code;

  code += 'int main() {\n';
  const startEdge = edges.find(e => e.source === mainNode.id);
  const mainBody = startEdge ? traverse(startEdge.target, 1) : '';
  code += mainBody;

  // Ensure main returns 0 if its own body has no return statement
  // (returns inside other function definitions must not suppress this).
  if (!/\breturn\b/.test(mainBody)) {
    code += '    return 0;\n';
  }
  code += '}\n';

  return code;
}
