import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readJsonFile } from '../data-store.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const evidenceRequestsPath = resolve(root, 'data/evidence-requests.json');

export function registerEvidenceRoutes(registerJsonRoute) {
  registerJsonRoute('GET', '/api/evidence-requests', listEvidenceRequests);
}

async function listEvidenceRequests() {
  return readJsonFile(evidenceRequestsPath, { updatedAt: '', summary: { open: 0, highPriority: 0 }, requests: [] });
}
