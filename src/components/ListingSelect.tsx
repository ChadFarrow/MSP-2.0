import { LISTING_CHOICES, listingFlags, listingOf } from '../utils/listing';
import type { Listing } from '../utils/listing';

interface ListingSelectProps {
  value: { itunesBlock?: boolean; podcastBlock?: boolean };
  onChange: (flags: { itunesBlock: boolean; podcastBlock: boolean }) => void;
}

// One control for the two block tags (utils/listing.ts), shared by the album and
// publisher editors.
export function ListingSelect({ value, onChange }: ListingSelectProps) {
  const current = listingOf(value);
  return (
    <select
      className="form-select"
      value={current}
      onChange={e => onChange(listingFlags(e.target.value as Listing))}
    >
      {current === 'custom' && (
        <option value="custom" disabled>Custom (from the imported feed)</option>
      )}
      {LISTING_CHOICES.map(choice => (
        <option key={choice.value} value={choice.value}>{choice.label}</option>
      ))}
    </select>
  );
}
