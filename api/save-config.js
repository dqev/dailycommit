// Vercel API route for saving config
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // In Vercel serverless, we can just return success
  // The actual config is saved to GitHub via the frontend
  return res.status(200).json({ success: true });
}