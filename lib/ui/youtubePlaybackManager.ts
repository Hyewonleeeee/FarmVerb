export type YouTubePlayer = {
  pauseVideo: () => void;
  destroy: () => void;
};

type YouTubePlayerEvent = {
  data: number;
  target: YouTubePlayer;
};

type YouTubePlayerOptions = {
  events?: {
    onReady?: (event: { target: YouTubePlayer }) => void;
    onStateChange?: (event: YouTubePlayerEvent) => void;
  };
};

export type YouTubeIframeApi = {
  Player: new (element: HTMLIFrameElement, options?: YouTubePlayerOptions) => YouTubePlayer;
  PlayerState?: {
    PLAYING: number;
  };
};

declare global {
  interface Window {
    YT?: YouTubeIframeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YOUTUBE_API_SRC = 'https://www.youtube.com/iframe_api';
const YOUTUBE_ORIGIN = 'https://www.youtube.com';
const PLAYING_STATE = 1;

let iframeApiPromise: Promise<YouTubeIframeApi> | null = null;
let activePlayer: YouTubePlayer | null = null;
let playbackGuardOwners = 0;
let blurCheckTimer: number | null = null;
const players = new Set<YouTubePlayer>();

function sendPauseCommand(iframe: HTMLIFrameElement) {
  iframe.contentWindow?.postMessage(
    JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
    YOUTUBE_ORIGIN
  );
}

function pauseEmbeddedFrames() {
  document
    .querySelectorAll<HTMLIFrameElement>('iframe[data-farmverb-youtube]')
    .forEach(sendPauseCommand);
}

function safelyPause(player: YouTubePlayer) {
  try {
    player.pauseVideo();
  } catch {
    // The iframe may already have been replaced or removed.
  }
}

export function loadYouTubeIframeApi(): Promise<YouTubeIframeApi> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (iframeApiPromise) {
    return iframeApiPromise;
  }

  iframeApiPromise = new Promise<YouTubeIframeApi>((resolve, reject) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();

      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error('YouTube IFrame Player API did not initialize.'));
      }
    };

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${YOUTUBE_API_SRC}"]`);
    if (existingScript) {
      existingScript.addEventListener('error', () => reject(new Error('YouTube IFrame Player API failed to load.')), {
        once: true
      });
      return;
    }

    const script = document.createElement('script');
    script.src = YOUTUBE_API_SRC;
    script.async = true;
    script.addEventListener('error', () => reject(new Error('YouTube IFrame Player API failed to load.')), {
      once: true
    });
    document.head.appendChild(script);
  });

  return iframeApiPromise;
}

export function registerYouTubePlayer(player: YouTubePlayer) {
  players.add(player);

  return () => {
    players.delete(player);
    if (activePlayer === player) {
      activePlayer = null;
    }
  };
}

export function handleYouTubePlayerStateChange(event: YouTubePlayerEvent) {
  const playingState = window.YT?.PlayerState?.PLAYING ?? PLAYING_STATE;
  if (event.data !== playingState) {
    return;
  }

  players.forEach((player) => {
    if (player !== event.target) {
      safelyPause(player);
    }
  });
  activePlayer = event.target;
}

export function pauseAllYouTubePlayers() {
  players.forEach(safelyPause);
  pauseEmbeddedFrames();
  activePlayer = null;
}

export function retainYouTubePlaybackGuards() {
  playbackGuardOwners += 1;

  if (playbackGuardOwners === 1) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('freeze', pauseAllYouTubePlayers);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('pagehide', pauseAllYouTubePlayers);
    window.addEventListener('farmverb-routechange', pauseAllYouTubePlayers);
  }

  return () => {
    playbackGuardOwners = Math.max(0, playbackGuardOwners - 1);
    if (playbackGuardOwners !== 0) {
      return;
    }

    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener('freeze', pauseAllYouTubePlayers);
    window.removeEventListener('blur', handleWindowBlur);
    window.removeEventListener('pagehide', pauseAllYouTubePlayers);
    window.removeEventListener('farmverb-routechange', pauseAllYouTubePlayers);

    if (blurCheckTimer !== null) {
      window.clearTimeout(blurCheckTimer);
      blurCheckTimer = null;
    }
  };
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    pauseAllYouTubePlayers();
  }
}

function handleWindowBlur() {
  if (blurCheckTimer !== null) {
    window.clearTimeout(blurCheckTimer);
  }

  blurCheckTimer = window.setTimeout(() => {
    blurCheckTimer = null;

    // Focusing the YouTube iframe can blur the parent window in some browsers.
    // The document still has focus in that case, so playback should continue.
    if (!document.hasFocus()) {
      pauseAllYouTubePlayers();
    }
  }, 0);
}
