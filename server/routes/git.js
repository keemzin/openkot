import { spawn } from 'child_process';
import express from 'express';
import { WORKING_DIR } from '../lib/env.js';

export default function registerGitRoutes(app) {
  const jsonBody = express.json();

  const runGit = (args, cwd) => new Promise((resolve, reject) => {
    const proc = spawn('git', args, { cwd });
    let out = '', err = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('close', code => code === 0 ? resolve(out) : reject(new Error(err || out || 'git command failed')));
    proc.on('error', reject);
  });

  app.get('/api/git/status', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    try {
      const out = await runGit(['status', '--porcelain', '-u'], dir);
      const files = {};
      for (const line of out.trim().split('\n')) {
        if (!line.trim()) continue;
        const xy = line.slice(0, 2);
        let file = line.slice(2).trim().replace(/^"(.*)"$/, '$1');
        const normFile = file.replace(/\\/g, '/');
        files[normFile] = { index: xy[0].trim() || ' ', workdir: xy[1].trim() || ' ' };
      }
      res.json({ isRepo: true, files });
    } catch { res.json({ isRepo: false, files: {} }); }
  });

  app.post('/api/git/init', jsonBody, async (req, res) => {
    const { dir } = req.body;
    try { await runGit(['init'], dir || WORKING_DIR); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/git/branch', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    try {
      const branch = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], dir)).trim();
      res.json({ branch });
    } catch { res.json({ branch: null }); }
  });

  app.get('/api/git/log', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    const n = parseInt(req.query.n) || 10;
    try {
      const out = await runGit(['log', `--max-count=${n}`, '--pretty=format:%H|%s|%an|%ar'], dir);
      const commits = out.trim().split('\n').filter(Boolean).map(line => {
        const [hash, subject, author, date] = line.split('|');
        return { hash, subject, author, date };
      });
      res.json(commits);
    } catch { res.json([]); }
  });

  app.post('/api/git/stage', jsonBody, async (req, res) => {
    const { dir, file } = req.body;
    try { await runGit(['add', file], dir || WORKING_DIR); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/git/unstage', jsonBody, async (req, res) => {
    const { dir, file } = req.body;
    try { await runGit(['restore', '--staged', file], dir || WORKING_DIR); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/git/revert', jsonBody, async (req, res) => {
    const { dir, file } = req.body;
    try { await runGit(['restore', file], dir || WORKING_DIR); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/git/config', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    const getVal = (key) => runGit(['config', key], dir).then(o => o.trim() || null).catch(() => null);
    const [name, email] = await Promise.all([getVal('user.name'), getVal('user.email')]);
    res.json({ name, email });
  });

  app.post('/api/git/config', jsonBody, async (req, res) => {
    const { dir, name, email, global: isGlobal } = req.body;
    const targetDir = dir || WORKING_DIR;
    const scope = isGlobal ? ['--global'] : [];
    try {
      if (name) await runGit([...scope, 'config', 'user.name', name], targetDir);
      if (email) await runGit([...scope, 'config', 'user.email', email], targetDir);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/git/commit', jsonBody, async (req, res) => {
    const { dir, message, authorName, authorEmail } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const targetDir = dir || WORKING_DIR;
    try {
      const env = { ...process.env };
      if (authorName) env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = authorName;
      if (authorEmail) env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = authorEmail;
      const output = await runGitWithEnv(['commit', '-m', message], targetDir, env);
      res.json({ success: true, output });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/git/push', jsonBody, async (req, res) => {
    const { dir } = req.body;
    try { const output = await runGit(['push'], dir || WORKING_DIR); res.json({ success: true, output }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/git/pull', jsonBody, async (req, res) => {
    const { dir } = req.body;
    try { const output = await runGit(['pull'], dir || WORKING_DIR); res.json({ success: true, output }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/git/diffstat', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    const file = typeof req.query.file === 'string' ? req.query.file : '';
    if (!file) return res.status(400).json({ error: 'file required' });
    try {
      const out = await runGit(['diff', '--numstat', 'HEAD', '--', file], dir);
      const match = out.trim().match(/^(\d+|-)\s+(\d+|-)\s+/);
      if (match) {
        const additions = match[1] === '-' ? 0 : parseInt(match[1], 10);
        const deletions = match[2] === '-' ? 0 : parseInt(match[2], 10);
        res.json({ additions, deletions });
      } else { res.json({ additions: 0, deletions: 0 }); }
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/git/diff', async (req, res) => {
    const dir = typeof req.query.dir === 'string' ? req.query.dir : WORKING_DIR;
    const file = typeof req.query.file === 'string' ? req.query.file : '';
    if (!file) return res.status(400).json({ error: 'file required' });
    try {
      const out = await runGit(['diff', 'HEAD', '--', file], dir);
      res.type('text/plain').send(out);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}

function runGitWithEnv(args, cwd, env) {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { cwd, env });
    let out = '', err = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('close', code => code === 0 ? resolve(out) : reject(new Error(err || out || 'git command failed')));
    proc.on('error', reject);
  });
}
