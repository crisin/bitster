const SpotifyWebApi = require('spotify-web-api-node');

function createSpotifyClient() {
  return new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: `${process.env.BASE_URL}/auth/callback`,
  });
}

function createAuthURL(state) {
  const spotify = createSpotifyClient();
  const scopes = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-modify-playback-state',
    'user-read-playback-state',
  ];
  return spotify.createAuthorizeURL(scopes, state);
}

async function handleCallback(code) {
  const spotify = createSpotifyClient();
  const data = await spotify.authorizationCodeGrant(code);
  return {
    accessToken: data.body.access_token,
    refreshToken: data.body.refresh_token,
    expiresIn: data.body.expires_in,
  };
}

async function refreshToken(refreshTokenValue) {
  const spotify = createSpotifyClient();
  spotify.setRefreshToken(refreshTokenValue);
  const data = await spotify.refreshAccessToken();
  return {
    accessToken: data.body.access_token,
    expiresIn: data.body.expires_in,
  };
}

async function getPlaylistTracks(playlistId, accessToken) {
  const spotify = createSpotifyClient();
  spotify.setAccessToken(accessToken);

  const tracks = [];
  let offset = 0;
  const limit = 100;
  let total = Infinity;

  while (offset < total) {
    const data = await spotify.getPlaylistTracks(playlistId, {
      offset,
      limit,
      fields: 'total,items(track(name,uri,artists(name),album(release_date)))',
    });

    total = data.body.total;

    for (const item of data.body.items) {
      const track = item.track;
      if (!track || !track.album || !track.album.release_date) continue;

      const year = parseInt(track.album.release_date.substring(0, 4), 10);
      if (isNaN(year)) continue;

      tracks.push({
        name: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        year,
        uri: track.uri,
      });
    }

    offset += limit;
  }

  return tracks;
}

module.exports = {
  createSpotifyClient,
  createAuthURL,
  handleCallback,
  refreshToken,
  getPlaylistTracks,
};
