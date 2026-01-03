// Shared date formatting utilities for MSP 2.0

/**
 * Format a date to RFC-822 format (used in RSS feeds)
 */
export function formatRFC822Date(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toUTCString();
}

/**
 * Format a Unix timestamp to a human-readable date string for display
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format a date string to MM/DD/YYYY format for Nostr music events
 */
export function formatReleasedDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  } catch {
    return '';
  }
}

/**
 * Parse a released date string (format: "DD/MM/YYYY" or various formats) to UTC string
 */
export function parseReleasedDate(released: string): string {
  try {
    // Handle DD/MM/YYYY format
    const parts = released.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date.getTime())) {
        return date.toUTCString();
      }
    }
    // Fallback: try direct parse
    const parsed = new Date(released);
    if (!isNaN(parsed.getTime())) {
      return parsed.toUTCString();
    }
    return new Date().toUTCString();
  } catch {
    return new Date().toUTCString();
  }
}
