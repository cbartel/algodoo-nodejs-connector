import { Badge, Button } from 'marblerace-ui-kit';
import React from 'react';

export default function AdminMusicSettings({ state, sendAdmin }: { state: any; sendAdmin: (a: string, d?: any) => void }) {
  const [text, setText] = React.useState<string>('');
  React.useEffect(() => {
    setText(String(state?.spotifyPlaylistId || ''));
  }, [state?.spotifyPlaylistId]);
  const id = String(state?.spotifyPlaylistId || '').trim();
  const embedUrl = id ? `https://open.spotify.com/playlist/${id}` : '';
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Badge>Spotify Playlist</Badge>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Playlist ID or URL"
          style={{ minWidth: 260, padding: 6, border: '3px solid #333', background: '#14161b', color: '#fff' }}
        />
        <Button onClick={() => sendAdmin('setSpotifyPlaylist', { id: text })}>Apply</Button>
        <Button onClick={() => { setText(''); sendAdmin('setSpotifyPlaylist', { id: '' }); }}>Clear</Button>
      </div>
      {id && (
        <div style={{ fontSize: 12, color: '#9df' }}>
          Current: <a href={embedUrl} target="_blank" rel="noreferrer">{id}</a>
        </div>
      )}
    </div>
  );
}
