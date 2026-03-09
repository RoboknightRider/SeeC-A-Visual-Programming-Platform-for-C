import { Edge, Node } from '@xyflow/react';
import { NodeData, NODE_REGISTRY } from './components/Nodes';

export function generateCCode(nodes: Node[], edges: Edge[]): string {
  let code = '';
  
  // 1. Find Includes
  const includes = nodes.filter(n => n.data.type === 'include');
  includes.forEach(n => {
    const registryItem = NODE_REGISTRY['include'];
    if (registryItem) {
      code += registryItem.toCode({ 
        node: n, 
        nodes, 
        edges, 
        visited: new Set(), 
        indentLevel: 0, 
        traverse: () => '' 
      });
    }
  });
  
  if (includes.length > 0) code += '\n';

  // 2. Global Function Definitions (excluding main)
  const functionDefs = nodes.filter(n => n.data.type === 'function-def');
  const visited = new Set<string>();

  function traverse(currentId: string, indentLevel: number): string {
    if (visited.has(currentId)) return '';
    visited.add(currentId);

    const node = nodes.find(n => n.id === currentId);
    if (!node) return '';

    const data = node.data as unknown as NodeData;
    const registryItem = NODE_REGISTRY[data.type];
    let blockCode = '';

    if (registryItem && registryItem.toCode) {
      blockCode += registryItem.toCode({
        node,
        nodes,
        edges,
        visited,
        indentLevel,
        traverse
      });
    }

    // Find next node (linear flow)
    const nextEdge = edges.find(e => e.source === currentId && (e.sourceHandle === 'next' || !e.sourceHandle));
    if (nextEdge) {
      blockCode += traverse(nextEdge.target, indentLevel);
    }

    return blockCode;
  }

  // Generate Functions
  functionDefs.forEach(func => {
    const data = func.data as unknown as NodeData;
    code += `${data.varType || 'void'} ${data.varName || 'myFunc'}(${data.params || ''}) {\n`;
    const bodyEdge = edges.find(e => e.source === func.id && e.sourceHandle === 'body');
    if (bodyEdge) {
      code += traverse(bodyEdge.target, 1);
    }
    code += '}\n\n';
  });

  // 3. Main Function
  const mainNode = nodes.find(n => n.data.type === 'main');
  if (!mainNode) return "// Add a 'Main' node to start generating code.\n" + code;

  code += 'int main() {\n';
  const startEdge = edges.find(e => e.source === mainNode.id);
  if (startEdge) {
    code += traverse(startEdge.target, 1);
  }

  // Close main if not returned
  if (!code.includes('return')) {
    code += '    return 0;\n';
  }
  code += '}\n';

  return code;
}
