'use client';

import { useEffect, useRef, useState } from 'react';
import {
  handleYouTubePlayerStateChange,
  loadYouTubeIframeApi,
  registerYouTubePlayer,
  retainYouTubePlaybackGuards,
  type YouTubePlayer
} from '@/lib/ui/youtubePlaybackManager';

type YouTubeDemoProps = {
  videoId: string;
  title: string;
  className?: string;
};

export default function YouTubeDemo({ videoId, title, className = '' }: YouTubeDemoProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    return retainYouTubePlaybackGuards();
  }, []);

  useEffect(() => {
    if (!origin || !iframeRef.current) {
      return;
    }

    const iframeElement = iframeRef.current;
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    let playerReady = false;
    let unregisterPlayer: (() => void) | null = null;

    void loadYouTubeIframeApi()
      .then((youtubeApi) => {
        if (cancelled || !iframeElement.isConnected) {
          return;
        }

        player = new youtubeApi.Player(iframeElement, {
          events: {
            onReady: (event) => {
              if (cancelled) {
                event.target.destroy();
                return;
              }

              playerReady = true;
              unregisterPlayer = registerYouTubePlayer(event.target);
            },
            onStateChange: handleYouTubePlayerStateChange
          }
        });
      })
      .catch(() => {
        // The iframe remains usable; global pause commands still provide a fallback.
      });

    return () => {
      cancelled = true;
      unregisterPlayer?.();

      if (!player) {
        return;
      }

      try {
        if (playerReady && iframeElement.isConnected) {
          player.pauseVideo();
        }
        player.destroy();
      } catch {
        // The iframe may already have been removed during navigation.
      }
    };
  }, [origin, videoId]);

  const embedUrl = origin
    ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(origin)}`
    : null;

  return (
    <div className={`product-youtube-frame ${className}`.trim()}>
      {embedUrl ? (
        <iframe
          key={videoId}
          ref={iframeRef}
          src={embedUrl}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          data-farmverb-youtube
          allowFullScreen
        />
      ) : null}
    </div>
  );
}
