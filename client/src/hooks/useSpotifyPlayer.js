import { useEffect, useRef, useState, useCallback } from 'react';

export function useSpotifyPlayer() {
  const [isReady, setIsReady] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const playerRef = useRef(null);
  const tokenRef = useRef(localStorage.getItem('spotify_access_token'));

  useEffect(() => {
    const token = localStorage.getItem('spotify_access_token');
    if (token) tokenRef.current = token;
    if (!tokenRef.current) return;

    if (!window.Spotify) {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: 'Hitster Game',
        getOAuthToken: (cb) => cb(tokenRef.current),
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }) => {
        setDeviceId(device_id);
        setIsReady(true);
      });

      player.addListener('not_ready', () => setIsReady(false));
      player.addListener('initialization_error', ({ message }) => console.error('Spotify init error:', message));
      player.addListener('authentication_error', ({ message }) => {
        console.error('Spotify auth error:', message);
        localStorage.removeItem('spotify_access_token');
        setIsReady(false);
      });

      player.connect();
      playerRef.current = player;
    };

    if (window.Spotify) {
      window.onSpotifyWebPlaybackSDKReady();
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
      }
    };
  }, []);

  const play = useCallback((uri) => {
    if (!tokenRef.current || !deviceId) return;
    fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ uris: [uri] }),
    });
  }, [deviceId]);

  const pause = useCallback(() => {
    if (playerRef.current) playerRef.current.pause();
  }, []);

  return { play, pause, isReady, deviceId };
}
