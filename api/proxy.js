export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {}
  }

  const apiKey = (body && body.apiKey) || req.headers['x-api-key'];
  
  if (!apiKey) {
    res.status(400).json({ error: { message: 'No API key provided' } });
    return;
  }

  const { apiKey: removed, ...cleanBody } = body || {};

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(cleanBody)
  });

  const data = await response.json();
  res.status(response.status).json(data);
}
