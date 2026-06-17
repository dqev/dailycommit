// Vercel API route - add/update account
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Account stored in localStorage on client
  return res.status(200).json({ success: true, account: req.body });
}