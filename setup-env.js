const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const root = __dirname;
const envPath = path.join(root, '.env');
const angularTemplatePath = path.join(root, 'angular.template.json');
const angularOutputPath = path.join(root, 'angular.json');
const proxyOutputPath = path.join(root, 'proxy.conf.json');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('[setup-env] .env loaded');
} else {
  console.warn('[setup-env] No .env file found, using defaults');
}

function parsePort(value, fallback = 3000) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function normalizeHost(value, fallback = '0.0.0.0') {
  const host = String(value ?? fallback).trim();
  return host || fallback;
}

function normalizeUrl(value, fallback) {
  const input = String(value ?? fallback).trim();
  const url = new URL(input);
  return url.toString().replace(/\/$/, '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

if (!fs.existsSync(angularTemplatePath)) {
  console.error('[setup-env] Missing angular.template.json');
  process.exit(1);
}

const port = parsePort(process.env.PORT, 3000);
const host = normalizeHost(process.env.HOST, '0.0.0.0');
const allowedHost = String(process.env.ALLOWED_HOST || '').trim();

let backendUrl;
try {
  backendUrl = normalizeUrl(process.env.BACKEND_URL, 'http://localhost:8080');
} catch (error) {
  console.error('[setup-env] Invalid BACKEND_URL in .env');
  process.exit(1);
}

const proxyConfig = {
  '/backend': {
    target: backendUrl,
    secure: false,
    changeOrigin: true
  },
  '/backend/**': {
    target: backendUrl,
    secure: false,
    changeOrigin: true
  },
  '/results': {
    target: backendUrl,
    secure: false,
    changeOrigin: true
  },
  '/results/**': {
    target: backendUrl,
    secure: false,
    changeOrigin: true
  }
};

fs.writeFileSync(
  proxyOutputPath,
  `${JSON.stringify(proxyConfig, null, 2)}\n`,
  'utf8'
);

const angularConfig = JSON.parse(fs.readFileSync(angularTemplatePath, 'utf8'));
const projectName = Object.keys(angularConfig.projects || {})[0];

if (!projectName) {
  console.error('[setup-env] No Angular project found in angular.template.json');
  process.exit(1);
}

const project = angularConfig.projects[projectName];
const serveOptions = project.architect?.serve?.options;
const buildOptions = project.architect?.build?.options;

if (!serveOptions || !buildOptions) {
  console.error('[setup-env] Missing build/serve options in angular.template.json');
  process.exit(1);
}

serveOptions.host = host;
serveOptions.port = port;
serveOptions.proxyConfig = 'proxy.conf.json';
serveOptions.allowedHosts = unique([
  'localhost',
  '127.0.0.1',
  allowedHost
]);

buildOptions.styles = ['src/styles.scss'];

fs.writeFileSync(
  angularOutputPath,
  `${JSON.stringify(angularConfig, null, 2)}\n`,
  'utf8'
);

console.log('[setup-env] Configuration generated:');
console.log(`  Port:         ${port}`);
console.log(`  Host:         ${host}`);
console.log(`  Allowed host: ${allowedHost || '(none)'}`);
console.log(`  Backend URL:  ${backendUrl}`);
console.log('  Angular file: angular.json');
console.log('  Proxy file:   proxy.conf.json');