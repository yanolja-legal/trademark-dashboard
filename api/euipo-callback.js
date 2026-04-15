/**
 * /api/euipo-callback
 *
 * OAuth2 redirect URI handler for EUIPO.
 * EUIPO requires a registered redirect_uri in the OAuth2 app config.
 * This endpoint simply acknowledges the callback so the registration step
 * succeeds — all actual token exchange uses client_credentials (no redirect flow).
 */

export default function handler(req, res) {
  res.status(200).json({ ok: true, message: 'EUIPO OAuth2 callback received.' })
}
