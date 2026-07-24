#!/usr/bin/env node
import { loadConfig } from '../packages/core/src/index.js';
import { startLocalEdgeServer } from '../packages/edge/local-server.js';

const config = loadConfig();
const { url } = await startLocalEdgeServer({
  port: config.edgeLocalPort || 30001,
  siteSeed: 'ghost-continuum-local',
});
console.log(`Ghost Continuum local edge → ${url}`);