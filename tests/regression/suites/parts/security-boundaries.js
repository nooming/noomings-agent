/**
 * Security boundaries that must stay closed:
 * - static asset roots never include the repository root / .env
 * - adapter ids are single path segments
 * - package ids are single path segments
 * - client-supplied trace sessionIds cannot escape traces/
 */
const { assert } = require('../../../lib/assert');
const {
  hasTraversalSegment,
  isPathAllowed,
  resolveAssetFile,
  decodeUrlPath,
} = require('../../../../apps/server/static');
const {
  isSafeAdapterId,
  loadAdapter,
} = require('../../../../packages/platform/adapters');
const {
  getPackageGamePath,
  isSafePackageId,
} = require('../../../../packages/shared/data-paths');
const {
  getTraceSession,
  ingestTrace,
  resolveSessionFile,
} = require('../../../../packages/platform/trace-store');

function run() {
  assert(hasTraversalSegment('/static/samples/../../../.env'), 'traversal segment detected');
  assert(
    hasTraversalSegment(decodeUrlPath('/static/samples/%2e%2e/%2e%2e/.env')),
    'encoded dots are decoded before the check',
  );
  assert(!hasTraversalSegment('/static/shared/data-paths.js'), 'normal asset path accepted');

  const envCandidate = resolveAssetFile('/static/samples/../../../.env');
  assert(envCandidate, 'resolver still identifies the target candidate');
  assert(!isPathAllowed(envCandidate), '.env must not be servable');

  assert(!isSafeAdapterId('../../platform/class-config'), 'adapter traversal id rejected');
  assert(loadAdapter('../../platform/class-config') === null, 'adapter traversal load blocked');
  assert(isSafeAdapterId('capacitor-era'), 'normal adapter id accepted');

  assert(!isSafePackageId('../../projectile-basic'), 'package traversal id rejected');
  assert(getPackageGamePath('../../projectile-basic').includes('__invalid_package_id__'), 'unsafe package path is neutralized');

  const badId = '../../catalog';
  assert(!resolveSessionFile(badId), 'session resolver rejects traversal ids');
  assert(getTraceSession(badId) === null, 'session reader rejects traversal ids');
  const rejected = ingestTrace({
    sessionId: badId,
    catalogId: 'demo-projectile-basic',
    studentId: 'security-test-001',
    events: [{ type: 'tuning', ts: 1, payload: { control: 'x' } }],
  });
  assert(rejected.ok === false, 'ingest rejects unsafe sessionId');
  assert(rejected.error === 'invalid_session_id', `expected invalid_session_id, got ${rejected.error}`);

  console.log('security-boundaries: OK');
}

module.exports = { run };
