// Vercel API route - list accounts
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Accounts stored in localStorage on client
  return res.status(200).json({ accounts: [] });
}