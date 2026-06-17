// Vercel API route for saving config
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Config is saved to GitHub via frontend
  return res.status(200).json({ success: true });
}