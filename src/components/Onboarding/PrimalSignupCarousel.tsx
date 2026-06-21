// src/components/Onboarding/PrimalSignupCarousel.tsx
//
// Two-column Primal account-creation walkthrough: a large phone screenshot on the
// left, a numbered step checklist on the right. The user pages forward through the
// 5 steps (future steps stay locked until reached); once they reach the last step
// the connect UI (passed in as connectSlot) is revealed in the right column.
// Pure presentational component — no store coupling.

import { useState, useEffect, type ReactNode } from 'react';
import slide1 from '../../assets/onboarding/primal-1-create-account.webp';
import slide2 from '../../assets/onboarding/primal-2-follow-people.webp';
import slide3 from '../../assets/onboarding/primal-3-account-preview.webp';
import slide4 from '../../assets/onboarding/primal-4-account-created.webp';
import slide5 from '../../assets/onboarding/primal-5-profile.webp';

interface Slide {
  src: string;
  alt: string;
  title: string;
  caption: ReactNode;
}

const SLIDES: Slide[] = [
  { src: slide1, alt: 'Primal Create Account screen', title: 'Add a name & photo', caption: <>Add a display name and photo — Primal generates your Nostr keys for you.</> },
  { src: slide2, alt: 'Primal Follow People screen', title: 'Pick interests', caption: <>Pick a few topics to follow (optional).</> },
  { src: slide3, alt: 'Primal Account Preview screen', title: 'Review your profile', caption: <>Review your new profile, then tap Create Account.</> },
  { src: slide4, alt: 'Primal account-created success screen', title: 'Save to iCloud Keychain', caption: <>Keep <strong>Save to iCloud Keychain</strong> on so your key is backed up.</> },
  { src: slide5, alt: 'Primal profile screen', title: "You're on Nostr!", caption: <>🎉 You're on Nostr — now connect it to MSP.</> },
];

interface PrimalSignupCarouselProps {
  // Fires once the user reaches the final step.
  onReachedEnd?: () => void;
  // Shown in the right column once every step has been reached (the connect UI).
  connectSlot?: ReactNode;
  // Shown in the right column until then (a nudge to finish the walkthrough).
  pendingHint?: ReactNode;
}

export function PrimalSignupCarousel({ onReachedEnd, connectSlot, pendingHint }: PrimalSignupCarouselProps) {
  const [index, setIndex] = useState(0);
  // High-water mark — the furthest step reached. Steps beyond it stay locked so
  // the user pages through the setup in order; visited steps stay revisitable.
  const [maxSeen, setMaxSeen] = useState(0);
  const count = SLIDES.length;
  const slide = SLIDES[index];
  const atStart = index === 0;
  const atEnd = index === count - 1;
  const complete = maxSeen === count - 1;

  const advance = (next: number) => {
    const target = Math.max(0, Math.min(count - 1, next));
    setIndex(target);
    if (target > maxSeen) setMaxSeen(target);
  };

  useEffect(() => {
    if (complete) onReachedEnd?.();
  }, [complete, onReachedEnd]);

  return (
    <div className="primal-carousel">
      <div className="primal-carousel-stage">
        <img className="primal-carousel-img" src={slide.src} alt={slide.alt} />
        <p className="primal-carousel-caption">{slide.caption}</p>
        <div className="primal-carousel-nav">
          <button
            type="button"
            className="primal-carousel-arrow"
            onClick={() => advance(index - 1)}
            disabled={atStart}
            aria-label="Previous step"
          >
            ‹
          </button>
          <span className="primal-carousel-counter">{index + 1} / {count}</span>
          <button
            type="button"
            className="primal-carousel-arrow"
            onClick={() => advance(index + 1)}
            disabled={atEnd}
            aria-label="Next step"
          >
            ›
          </button>
        </div>
      </div>

      <div className="primal-carousel-side">
        <ol className="primal-carousel-steps">
          {SLIDES.map((s, i) => {
            const locked = i > maxSeen;
            const active = i === index;
            const done = !active && i <= maxSeen;
            return (
              <li key={s.src}>
                <button
                  type="button"
                  className={`primal-step-item${active ? ' is-active' : ''}${done ? ' is-done' : ''}`}
                  onClick={() => !locked && setIndex(i)}
                  disabled={locked}
                  aria-current={active}
                >
                  <span className="primal-step-badge">{done ? '✓' : i + 1}</span>
                  <span className="primal-step-label">{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {complete ? connectSlot : pendingHint}
      </div>
    </div>
  );
}
