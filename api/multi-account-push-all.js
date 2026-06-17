// Vercel API route - push to all accounts
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Push handled client-side via GitHub API
  return res.status(200).json({ success: true });
}