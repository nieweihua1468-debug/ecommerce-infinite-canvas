import test from 'node:test';
import assert from 'node:assert/strict';
import { DEV_SERVER_PROXY } from '../vite.config.js';

test('本地开发站点代理带鉴权的模版封面资源', () => {
  assert.equal(
    DEV_SERVER_PROXY['/inspiration-assets'],
    'http://127.0.0.1:8791',
  );
});

test('本地开发站点代理 Streamable HTTP MCP 端点', () => {
  assert.equal(DEV_SERVER_PROXY['/mcp'], 'http://127.0.0.1:8791');
});

