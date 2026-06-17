// Vercel API route - bulk commit
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Bulk commit handled client-side via GitHub API
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.write(JSON.stringify({ status: 'done' }) + '\n');
  res.end();
}