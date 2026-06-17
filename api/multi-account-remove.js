// Vercel API route - remove account
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Account is stored in localStorage on the client side
  return res.status(200).json({ success: true });
}