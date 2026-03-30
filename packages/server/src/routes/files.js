const { Router } = require('express');
const path = require('path');
const { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, existsSync, renameSync } = require('fs');
const multer = require('multer');
const os = require('os');

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 5 * 1024 * 1024 } });
const VALID_FILENAME = /^[a-zA-Z0-9_.-]+$/;

const VALID_AGENT_NAME = /^[a-zA-Z0-9_-]+$/;
const router = Router();

function validateFilename(name) {
  if (!name || !VALID_FILENAME.test(name)) return false;
  if (name.startsWith('.')) return false;
  if (name.includes('/') || name.includes('..')) return false;
  return true;
}

function resolveAgentDir(req) {
  const { agent } = req.params;
  if (!agent || !VALID_AGENT_NAME.test(agent)) return null;
  const agentDir = path.join(req.agentsDir, agent);
  if (!existsSync(agentDir)) return null;
  return agentDir;
}

function isBinary(buffer) {
  for (let i = 0; i < Math.min(buffer.length, 8000); i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

router.get('/agents/:agent/files', (req, res) => {
  const agentDir = resolveAgentDir(req);
  if (!agentDir) return res.status(404).json({ error: 'Agent not found' });

  const entries = readdirSync(agentDir);
  const files = entries
    .filter(name => {
      const fullPath = path.join(agentDir, name);
      return statSync(fullPath).isFile();
    })
    .map(name => {
      const fullPath = path.join(agentDir, name);
      const stat = statSync(fullPath);
      return { name, size: stat.size };
    });

  res.json({ files });
});

router.get('/agents/:agent/files/:filename', (req, res) => {
  const agentDir = resolveAgentDir(req);
  if (!agentDir) return res.status(404).json({ error: 'Agent not found' });

  const { filename } = req.params;
  if (!validateFilename(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const filePath = path.join(agentDir, filename);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'File not found' });
  }

  const buffer = readFileSync(filePath);
  if (isBinary(buffer)) {
    return res.json({ name: filename, binary: true, size: buffer.length });
  }

  res.json({ name: filename, content: buffer.toString('utf8'), size: buffer.length });
});

router.post('/agents/:agent/files', (req, res) => {
  const agentDir = resolveAgentDir(req);
  if (!agentDir) return res.status(404).json({ error: 'Agent not found' });

  const { name, content } = req.body;
  if (!validateFilename(name)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const filePath = path.join(agentDir, name);
  if (existsSync(filePath)) {
    return res.status(409).json({ error: 'File already exists' });
  }

  writeFileSync(filePath, content || '', 'utf8');
  res.status(201).json({ name, size: Buffer.byteLength(content || '', 'utf8') });
});

router.put('/agents/:agent/files/:filename', (req, res) => {
  const agentDir = resolveAgentDir(req);
  if (!agentDir) return res.status(404).json({ error: 'Agent not found' });

  const { filename } = req.params;
  if (!validateFilename(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const filePath = path.join(agentDir, filename);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'File not found' });
  }

  const { content } = req.body;
  writeFileSync(filePath, content || '', 'utf8');
  res.json({ name: filename, size: Buffer.byteLength(content || '', 'utf8') });
});

router.delete('/agents/:agent/files/:filename', (req, res) => {
  const agentDir = resolveAgentDir(req);
  if (!agentDir) return res.status(404).json({ error: 'Agent not found' });

  const { filename } = req.params;
  if (!validateFilename(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  if (filename === 'agent.md') {
    return res.status(400).json({ error: 'Cannot delete agent.md' });
  }

  const filePath = path.join(agentDir, filename);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'File not found' });
  }

  unlinkSync(filePath);
  res.status(204).end();
});

router.post('/agents/:agent/files/upload', upload.single('file'), (req, res) => {
  const agentDir = resolveAgentDir(req);
  if (!agentDir) {
    if (req.file) try { unlinkSync(req.file.path); } catch {}
    return res.status(404).json({ error: 'Agent not found' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filename = req.file.originalname;
  if (!validateFilename(filename)) {
    try { unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const destPath = path.join(agentDir, filename);
  renameSync(req.file.path, destPath);
  const stat = statSync(destPath);

  res.status(201).json({ name: filename, size: stat.size });
});

module.exports = router;
