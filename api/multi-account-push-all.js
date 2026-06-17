// Vercel API route - push to all accounts
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Push is handled client-side via GitHub API directly
  // This endpoint returns success to maintain API compatibility
  return res.status(200).json({ success: true });
}