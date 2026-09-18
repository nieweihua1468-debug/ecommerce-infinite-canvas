import test from 'node:test';
import assert from 'node:assert/strict';
import { mindMapLayout } from '../shared/workflow-layout.js';

test('mind map layout keeps dependency layers aligned from left to right', () => {
  const nodes = ['root', 'left', 'right', 'merge', 'output'].map((id, index) => ({ id, position: { x: 0, y: index * 100 }, data: {} }));
  const edges = [
    { source: 'root', target: 'left' },
    { source: 'root', target: 'right' },
    { source: 'left', target: 'merge' },
    { source: 'right', target: 'merge' },
    { source: 'merge', target: 'output' },
  ];
  const positions = mindMapLayout(nodes, edges);
  assert.ok(positions.get('root').x < positions.get('left').x);
  assert.equal(positions.get('left').x, positions.get('right').x);
  assert.ok(positions.get('right').x < positions.get('merge').x);
  assert.ok(positions.get('merge').x < positions.get('output').x);
  assert.notEqual(positions.get('left').y, positions.get('right').y);
});

test('mind map layout keeps a branch order stable across repeated runs', () => {
  const nodes = [
    { id: 'root', position: { x: 0, y: 0 }, data: {} },
    { id: 'top', position: { x: 100, y: 10 }, data: {} },
    { id: 'bottom', position: { x: 100, y: 500 }, data: {} },
  ];
  const edges = [{ source: 'root', target: 'top' }, { source: 'root', target: 'bottom' }];
  const first = mindMapLayout(nodes, edges);
  const second = mindMapLayout(nodes, edges);
  assert.deepEqual([...first], [...second]);
  assert.ok(first.get('top').y < first.get('bottom').y);
});

test('mind map layout reorders opposite branches to avoid an adjacent-layer crossing', () => {
  const nodes = [
    { id: 'a', position: { x: 0, y: 0 }, data: {} },
    { id: 'b', position: { x: 0, y: 300 }, data: {} },
    { id: 'x', position: { x: 300, y: 0 }, data: {} },
    { id: 'y', position: { x: 300, y: 300 }, data: {} },
  ];
  const positions = mindMapLayout(nodes, [{ source: 'a', target: 'y' }, { source: 'b', target: 'x' }]);
  const sourceOrder = Math.sign(positions.get('a').y - positions.get('b').y);
  const targetOrder = Math.sign(positions.get('y').y - positions.get('x').y);
  assert.equal(sourceOrder, targetOrder);
});

