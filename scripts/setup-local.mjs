import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const target = new URL('../.env.local', import.meta.url);
const example = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const content = example
  .replace(/^ADMIN_SESSION_SECRET=.*$/m, `ADMIN_SESSION_SECRET=${randomBytes(32).toString('hex')}`)
  .replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${randomBytes(24).toString('base64url')}`)
  .replace(/^VOLCENGINE_CALLBACK_SECRET=.*$/m, `VOLCENGINE_CALLBACK_SECRET=${randomBytes(32).toString('hex')}`);
try {
  await writeFile(target, content, { flag: 'wx', mode: 0o600 });
  console.log('已创建 .env.local，包含独立随机密码与会话密钥。管理员账号为 admin，密码请在该文件中查看。');
  console.log('运行 npm run dev 打开本地画布；按需在 .env.local 配置模型服务。');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env.local 已存在，保留原配置。');
}
