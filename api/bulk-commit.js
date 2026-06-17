// Vercel API route - bulk commit
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Bulk commit is handled client-side via GitHub API directly
  // This endpoint returns success to maintain API compatibility
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.write(JSON.stringify({ status: 'done' }) + '\n');
  res.end();
}