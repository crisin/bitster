const { Router } = require('express');
const { createAuthURL, handleCallback } = require('../services/spotify');
const { v4: uuidv4 } = require('uuid');

const router = Router();

function getClientUrl() {
  return process.env.CLIENT_URL || process.env.BASE_URL || 'http://localhost:5173';
}

router.get('/spotify', (req, res) => {
  const state = uuidv4();
  const authorizeURL = createAuthURL(state);
  res.redirect(authorizeURL);
});

router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  const clientUrl = getClientUrl();

  if (error) {
    return res.redirect(`${clientUrl}/auth/success?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect(`${clientUrl}/auth/success?error=missing_code`);
  }

  try {
    const tokens = await handleCallback(code);
    const params = new URLSearchParams({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: String(tokens.expiresIn),
    });
    res.redirect(`${clientUrl}/auth/success?${params.toString()}`);
  } catch (err) {
    console.error('Spotify auth callback error:', err.message);
    res.redirect(`${clientUrl}/auth/success?error=${encodeURIComponent(err.message)}`);
  }
});

module.exports = router;
