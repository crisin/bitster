import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (accessToken) {
      localStorage.setItem('spotify_access_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('spotify_refresh_token', refreshToken);
    }

    const lastRoom = localStorage.getItem('lastRoom');
    navigate(lastRoom ? `/game/${lastRoom}` : '/', { replace: true });
  }, [navigate]);

  return (
    <div className="callback">
      <p>Connecting to Spotify...</p>
    </div>
  );
}

export default Callback;
