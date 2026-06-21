// src/components/Onboarding/PrimalSignupCarousel.tsx
//
// Swipeable, captioned screenshot carousel of Primal's iOS account-creation flow.
// Used by NewToNostrPanel to *show* a first-timer how to make a Nostr identity before
// they connect it to MSP via the QR. Pure presentational component — no store coupling.

import { useState, useEffect, type ReactNode } from 'react';
import slide1 from '../../assets/onboarding/primal-1-create-account.webp';
import slide2 from '../../assets/onboarding/primal-2-follow-people.webp';
import slide3 from '../../assets/onboarding/primal-3-account-preview.webp';
import slide4 from '../../assets/onboarding/primal-4-account-created.webp';
import slide5 from '../../assets/onboarding/primal-5-profile.webp';

interface Slide {
  src: string;
  alt: string;
  caption: ReactNode;
}

const SLIDES: Slide[] = [
  { src: slide1, alt: 'Primal Create Account screen', caption: <>Add a display name and photo — Primal generates your Nostr keys for you.</> },
  { src: slide2, alt: 'Primal Follow People screen', caption: <>Pick a few topics to follow (optional).</> },
  { src: slide3, alt: 'Primal Account Preview screen', caption: <>Review your new profile.</> },
  { src: slide4, alt: 'Primal account-created success screen', caption: <>Keep <strong>Save to iCloud Keychain</strong> on so your key is backed up.</> },
  { src: slide5, alt: 'Primal profile screen', caption: <>🎉 You're on Nostr — now connect it to MSP.</> },
];

interface PrimalSignupCarouselProps {
  // Fires once the user reaches the final slide. The parent uses this to reveal
  // the connect step only after they've paged through the whole Primal setup.
  onReachedEnd?: () => void;
}

export function PrimalSignupCarousel({ onReachedEnd }: PrimalSignupCarouselProps) {
  const [index, setIndex] = useState(0);
  const count = SLIDES.length;
  const slide = SLIDES[index];
  const atStart = index === 0;
  const atEnd = index === count - 1;

  // Clamp at the ends so "Next" walks through the steps in order (no wrap-around
  // jump straight to the connect-revealing last slide).
  const go = (next: number) => setIndex(Math.max(0, Math.min(count - 1, next)));

  useEffect(() => {
    if (atEnd) onReachedEnd?.();
  }, [atEnd, onReachedEnd]);

  return (
    <div className="primal-carousel">
      <div className="primal-carousel-frame">
        <button
          type="button"
          className="primal-carousel-arrow primal-carousel-arrow-prev"
          onClick={() => go(index - 1)}
          disabled={atStart}
          aria-label="Previous"
        >
          ‹
        </button>
        <img className="primal-carousel-img" src={slide.src} alt={slide.alt} />
        <button
          type="button"
          className="primal-carousel-arrow primal-carousel-arrow-next"
          onClick={() => go(index + 1)}
          disabled={atEnd}
          aria-label="Next"
        >
          ›
        </button>
      </div>

      <p className="primal-carousel-caption">
        <span className="primal-carousel-counter">{index + 1}/{count}</span>
        {slide.caption}
      </p>

      <div className="primal-carousel-dots" role="tablist" aria-label="Signup steps">
        {SLIDES.map((s, i) => (
          <button
            key={s.src}
            type="button"
            className={`primal-carousel-dot${i === index ? ' is-active' : ''}`}
            onClick={() => setIndex(i)}
            aria-label={`Go to step ${i + 1}`}
            aria-current={i === index}
          />
        ))}
      </div>
    </div>
  );
}
