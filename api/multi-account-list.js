// Vercel API route - list accounts (from localStorage on client)
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Accounts are stored in localStorage on the client side
  // This endpoint exists for API compatibility
  return res.status(200).json({ accounts: [] });
}