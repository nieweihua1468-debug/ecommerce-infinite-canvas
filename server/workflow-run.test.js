import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKFLOW_STEP_KINDS, downstreamWorkflowNodeIds, normalizeVideoAspectRatio, orderedIncomingEdges, orderedWorkflowNodes, reachableWorkflowExecutionNodes, reachableWorkflowNodes, terminalWorkflowExecutionNodeIds, workflowEdgeMaterialMetadata } from './workflow-graph.js';

const nodes = [
  { id: 'input', position: { x: 0 } },
  { id: 'text', position: { x: 200 } },
  { id: 'preview', position: { x: 400 } },
  { id: 'image', position: { x: 600 } },
  { id: 'orphan', position: { x: 100 } },
];
const edges = [
  { source: 'input', target: 'text' },
  { source: 'text', target: 'preview' },
  { source: 'preview', target: 'image' },
];

test('orders workflow nodes by graph dependency', () => {
  const ordered = orderedWorkflowNodes(nodes, edges).map((node) => node.id);
  assert.ok(ordered.indexOf('input') < ordered.indexOf('text'));
  assert.ok(ordered.indexOf('text') < ordered.indexOf('preview'));
  assert.ok(ordered.indexOf('preview') < ordered.indexOf('image'));
});

test('treats audio generation as an executable workflow step', () => {
  assert.equal(WORKFLOW_STEP_KINDS.has('audio-generation'), true);
  const audioNodes = [
    { id: 'text', data: { kind: 'text' } },
    { id: 'speech', data: { kind: 'audio-generation' } },
    { id: 'video', data: { kind: 'video' } },
  ];
  const audioEdges = [
    { source: 'text', target: 'speech' },
    { source: 'speech', target: 'video' },
  ];
  assert.deepEqual(
    orderedWorkflowNodes(audioNodes, audioEdges).map((node) => node.id),
    ['text', 'speech', 'video'],
  );
});

test('executes only nodes reachable from the terminal output', () => {
  const reachable = reachableWorkflowNodes(nodes, edges, 'image');
  assert.deepEqual([...reachable].sort(), ['image', 'input', 'preview', 'text']);
  assert.equal(reachable.has('orphan'), false);
});

test('also executes a connected text-preview branch beside the generation path', () => {
  const branchedNodes = [
    { id: 'input', data: { kind: 'input' } },
    { id: 'text', data: { kind: 'text' } },
    { id: 'preview', data: { kind: 'text-preview' } },
    { id: 'video', data: { kind: 'video' } },
    { id: 'orphan', data: { kind: 'text' } },
  ];
  const branchedEdges = [
    { source: 'input', target: 'text' },
    { source: 'text', target: 'preview' },
    { source: 'input', target: 'video' },
  ];
  const reachable = reachableWorkflowExecutionNodes(
    branchedNodes,
    branchedEdges,
    'video',
  );
  assert.deepEqual([...reachable].sort(), ['input', 'preview', 'text', 'video']);
  assert.equal(reachable.has('orphan'), false);
});

test('keeps every parallel terminal image branch in one workflow run', () => {
  const nodes = [
    { id: 'input', data: { kind: 'input' } },
    { id: 'image-a', data: { kind: 'image' } },
    { id: 'image-b', data: { kind: 'image' } },
    { id: 'image-c', data: { kind: 'image' } },
  ];
  const edges = [
    { source: 'input', target: 'image-a' },
    { source: 'input', target: 'image-b' },
    { source: 'input', target: 'image-c' },
  ];
  const terminalIds = terminalWorkflowExecutionNodeIds(nodes, edges);
  assert.deepEqual(terminalIds, ['image-a', 'image-b', 'image-c']);
  const reachable = reachableWorkflowExecutionNodes(nodes, edges, terminalIds);
  assert.deepEqual([...reachable].sort(), ['image-a', 'image-b', 'image-c', 'input']);
});

test('runs a left-side text preview before a slower generation sibling', () => {
  const branchedNodes = [
    { id: 'text', position: { x: 200 } },
    { id: 'video', position: { x: 800 } },
    { id: 'preview', position: { x: 500 } },
  ];
  const branchedEdges = [
    { source: 'text', target: 'video' },
    { source: 'text', target: 'preview' },
  ];
  assert.deepEqual(
    orderedWorkflowNodes(branchedNodes, branchedEdges).map((node) => node.id),
    ['text', 'preview', 'video'],
  );
});

test('keeps image inputs in their explicit slot order', () => {
  const slottedNodes = [
    { id: 'subject' },
    { id: 'garment' },
    { id: 'replace', data: { inputs: [{ id: 'prompt' }, { id: 'image_1' }, { id: 'image_2' }] } },
  ];
  const slottedEdges = [
    { id: 'garment-edge', source: 'garment', target: 'replace', targetHandle: 'image_2' },
    { id: 'subject-edge', source: 'subject', target: 'replace', targetHandle: 'image_1' },
  ];
  assert.deepEqual(orderedIncomingEdges(slottedNodes, slottedEdges, 'replace').map((edge) => edge.targetHandle), ['image_1', 'image_2']);
});

test('orders hidden material edges by mention index without moving text inputs', () => {
  const mentionNodes = [
    { id: 'prompt' },
    { id: 'subject' },
    { id: 'garment' },
    {
      id: 'generate',
      data: {
        inputs: [
          { id: 'prompt', type: 'TEXT' },
          { id: 'image_1', type: 'IMAGE' },
          { id: 'image_2', type: 'IMAGE' },
        ],
      },
    },
  ];
  const mentionEdges = [
    { id: 'prompt-edge', source: 'prompt', target: 'generate', targetHandle: 'prompt' },
    {
      id: 'subject-edge',
      source: 'subject',
      target: 'generate',
      targetHandle: 'image_1',
      data: { mentionIndex: 2, materialId: 'subject', materialLabel: '人物主图' },
    },
    {
      id: 'garment-edge',
      source: 'garment',
      target: 'generate',
      targetHandle: 'image_2',
      data: { mentionIndex: 1, materialId: 'garment', materialLabel: '服装参考' },
    },
  ];
  const ordered = orderedIncomingEdges(mentionNodes, mentionEdges, 'generate');
  assert.deepEqual(ordered.map((edge) => edge.id), [
    'prompt-edge',
    'garment-edge',
    'subject-edge',
  ]);
  assert.deepEqual(workflowEdgeMaterialMetadata(ordered[1]), {
    materialId: 'garment',
    materialLabel: '服装参考',
    mentionIndex: 1,
  });
});

test('orders unified generation input edges entirely by @ mention order', () => {
  const unifiedNodes = [
    { id: 'subject' },
    { id: 'garment' },
    {
      id: 'generate',
      data: {
        inputs: [
          { id: 'generation_input', type: 'ANY', multiple: true },
        ],
      },
    },
  ];
  const unifiedEdges = [
    {
      id: 'subject-edge',
      source: 'subject',
      target: 'generate',
      targetHandle: 'generation_input',
      data: { mentionIndex: 2 },
    },
    {
      id: 'garment-edge',
      source: 'garment',
      target: 'generate',
      targetHandle: 'generation_input',
      data: { mentionIndex: 1 },
    },
  ];

  assert.deepEqual(
    orderedIncomingEdges(unifiedNodes, unifiedEdges, 'generate').map(
      (edge) => edge.id,
    ),
    ['garment-edge', 'subject-edge'],
  );
});

test('keeps dynamically expanded trusted-person assets in numeric slot order', () => {
  const assetNodes = [
    { id: 'person-1' },
    { id: 'person-2' },
    { id: 'person-10' },
    {
      id: 'video',
      data: {
        inputs: [
          { id: 'trusted_person_asset_1' },
          { id: 'trusted_person_asset_2' },
          { id: 'trusted_person_asset_10' },
        ],
      },
    },
  ];
  const assetEdges = [
    { id: 'asset-10', source: 'person-10', target: 'video', targetHandle: 'trusted_person_asset_10' },
    { id: 'asset-2', source: 'person-2', target: 'video', targetHandle: 'trusted_person_asset_2' },
    { id: 'asset-1', source: 'person-1', target: 'video', targetHandle: 'trusted_person_asset_1' },
  ];
  assert.deepEqual(
    orderedIncomingEdges(assetNodes, assetEdges, 'video').map((edge) => edge.targetHandle),
    ['trusted_person_asset_1', 'trusted_person_asset_2', 'trusted_person_asset_10'],
  );
});

test('normalizes common source-image ratios for video providers', () => {
  assert.equal(normalizeVideoAspectRatio('2:3'), '9:16');
  assert.equal(normalizeVideoAspectRatio('4:5'), '9:16');
  assert.equal(normalizeVideoAspectRatio('3:2'), '16:9');
  assert.equal(normalizeVideoAspectRatio('1:1'), '1:1');
});

test('continues a failed workflow from the selected node through every downstream branch', () => {
  const graphNodes = [
    { id: 'input' },
    { id: 'completed-image' },
    { id: 'failed-image' },
    { id: 'analysis' },
    { id: 'video' },
    { id: 'unrelated' },
  ];
  const graphEdges = [
    { source: 'input', target: 'completed-image' },
    { source: 'completed-image', target: 'failed-image' },
    { source: 'failed-image', target: 'analysis' },
    { source: 'analysis', target: 'video' },
  ];
  assert.deepEqual(
    [...downstreamWorkflowNodeIds(graphNodes, graphEdges, 'failed-image')].sort(),
    ['analysis', 'failed-image', 'video'],
  );
});

