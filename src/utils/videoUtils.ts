// Video utilities

/**
 * Get video duration from URL using Video API
 */
export function getVideoDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const video = document.createElement('video');
    video.preload = 'metadata';

    const done = (duration: number | null) => {
      if (resolved) return;
      resolved = true;
      video.src = '';
      resolve(duration);
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      done(isFinite(duration) && duration > 0 ? duration : null);
    };

    video.onerror = () => {
      done(null);
    };

    // Timeout after 10 seconds
    setTimeout(() => {
      done(null);
    }, 10000);

    video.src = url;
  });
}

/**
 * Check if URL is a video URL based on extension
 */
export function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
  const lowerUrl = url.toLowerCase();
  return videoExtensions.some(ext => lowerUrl.includes(ext));
}

/**
 * Get video MIME type from URL extension
 */
export function getVideoMimeType(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.webm')) return 'video/webm';
  if (lowerUrl.includes('.mov')) return 'video/quicktime';
  if (lowerUrl.includes('.avi')) return 'video/x-msvideo';
  if (lowerUrl.includes('.mkv')) return 'video/x-matroska';
  if (lowerUrl.includes('.m4v')) return 'video/x-m4v';
  return 'video/mp4'; // Default
}
