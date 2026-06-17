// Vercel API route - add/update account
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Account is stored in localStorage on the client side
  // This endpoint exists for API compatibility
  return res.status(200).json({ success: true, account: req.body });
}