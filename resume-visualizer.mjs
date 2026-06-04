#!/usr/bin/env node

import http from 'http';
import { existsSync, createReadStream } from 'fs';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { registerApplicationRoutes } from './visualizer/services/application-service.mjs';
import { registerAssetRoutes } from './visualizer/services/asset-service.mjs';
import { registerRecruitmentRoutes } from './visualizer/services/recruitment-service.mjs';
import { registerReplyRoutes } from './visualizer/services/reply-service.mjs';
import {
  registerEvidenceRoutes,
} from './visualizer/services/evidence-service.mjs';
import {
  registerExperienceMetadataRoutes,
} from './visualizer/services/experience-metadata-service.mjs';
import {
  registerWorkspaceRoutes,
} from './visualizer/services/workspace-service.mjs';
import { registerResumeRoutes } from './visualizer/services/resume-service.mjs';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const publicDir = join(root, 'visualizer');
const port = Number(process.env.PORT || 4173);

const ROUTES = {
  GET: new Map(),
  POST: new Map(),
};

function registerJsonRoute(method, path, handler) {
  ROUTES[method].set(path, { mode: 'json', handler });
}

function registerRawRoute(method, path, handler) {
  ROUTES[method].set(path, { mode: 'raw', handler });
}

registerResumeRoutes(registerJsonRoute, registerRawRoute, { port });
registerApplicationRoutes(registerJsonRoute);
registerAssetRoutes(registerJsonRoute);
registerReplyRoutes(registerJsonRoute);
registerRecruitmentRoutes(registerJsonRoute);
registerWorkspaceRoutes(registerJsonRoute);
registerExperienceMetadataRoutes(registerJsonRoute);
registerEvidenceRoutes(registerJsonRoute);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const route = ROUTES[req.method || 'GET']?.get(url.pathname);
    if (route) {
      if (route.mode === 'raw') {
        return route.handler(req, res, url);
      }
      const payload = await route.handler(req, url);
      return sendJson(res, payload);
    }
    if (url.pathname === '/') return streamFile(join(publicDir, 'index.html'), res);

    const requested = resolve(publicDir, `.${decodeURIComponent(url.pathname)}`);
    if (!requested.startsWith(publicDir) || !existsSync(requested)) return notFound(res);
    return streamFile(requested, res);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(String(err?.stack || err));
  }
});

server.listen(port, () => {
  console.log(`Resume visualizer: http://localhost:${port}`);
});

function sendJson(res, data) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function streamFile(path, res) {
  res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream' });
  createReadStream(path).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}
