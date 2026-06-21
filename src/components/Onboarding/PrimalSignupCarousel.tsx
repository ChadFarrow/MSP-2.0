// src/components/Onboarding/PrimalSignupCarousel.tsx
//
// Two-column Primal onboarding walkthrough: a large phone screenshot on the left,
// a numbered step checklist on the right. The first five steps are the Primal
// account-creation screens; the sixth step, "Connect to MSP", is a navigation
// trigger (locked until the Primal steps are reached) that fires onConnect() so
// the parent can show the dedicated connect page. Pure presentational component.

import { useState, type ReactNode } from 'react';
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
  { src: slide2, alt: 'Primal Follow People screen', title: 'Pick a follow pack', caption: <>Choose at least one follow pack to get started — you can change this later.</> },
  { src: slide3, alt: 'Primal Account Preview screen', title: 'Review your profile', caption: <>Review your new profile, then tap Create Account.</> },
  { src: slide4, alt: 'Primal account-created success screen', title: 'Save to iCloud Keychain (optional)', caption: <>Optional — on iOS, keep <strong>Save to iCloud Keychain</strong> on to back up your key.</> },
  { src: slide5, alt: 'Primal profile screen', title: "You're on Nostr!", caption: <>🎉 Your Primal account is ready — now connect it to MSP.</> },
];

const CONNECT_TITLE = 'Connect to MSP';

interface PrimalSignupCarouselProps {
  // Fired when the user activates the "Connect to MSP" step (clicking it once
  // unlocked, or paging forward past the last Primal screen).
  onConnect: () => void;
}

export function PrimalSignupCarousel({ onConnect }: PrimalSignupCarouselProps) {
  const primalCount = SLIDES.length; // 5 Primal screens
  const [index, setIndex] = useState(0);
  // High-water mark — the furthest screen reached.
  const [maxSeen, setMaxSeen] = useState(0);

  // The Connect step unlocks once the user has reached the last Primal screen.
  const primalDone = maxSeen >= primalCount - 1;
  const slide = SLIDES[index];
  const atStart = index === 0;

  const advance = (next: number) => {
    if (next >= primalCount) {
      onConnect();
      return;
    }
    const target = Math.max(0, next);
    setIndex(target);
    if (target > maxSeen) setMaxSeen(target);
  };

  const stepTitles = [...SLIDES.map((s) => s.title), CONNECT_TITLE];

  return (
    <div className="primal-carousel">
      <div className="primal-carousel-stage">
        <button
          type="button"
          className="primal-carousel-photo"
          onClick={() => advance(index + 1)}
          aria-label="Next step"
        >
          <img className="primal-carousel-img" src={slide.src} alt={slide.alt} />
        </button>
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
          <span className="primal-carousel-counter">{index + 1} / {primalCount}</span>
          <button
            type="button"
            className="primal-carousel-arrow"
            onClick={() => advance(index + 1)}
            aria-label="Next step"
          >
            ›
          </button>
        </div>
      </div>

      <div className="primal-carousel-side">
        <ol className="primal-carousel-steps">
          {stepTitles.map((title, i) => {
            const isConnect = i === primalCount;
            const locked = isConnect && !primalDone;
            const active = !isConnect && i === index;
            const done = !active && !isConnect && i <= maxSeen;
            return (
              <li key={title}>
                <button
                  type="button"
                  className={`primal-step-item${active ? ' is-active' : ''}${done ? ' is-done' : ''}${isConnect ? ' is-connect' : ''}`}
                  onClick={() => (isConnect ? onConnect() : setIndex(i))}
                  disabled={locked}
                  aria-current={active}
                >
                  <span className="primal-step-badge">{done ? '✓' : i + 1}</span>
                  <span className="primal-step-label">{title}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <p className="primal-carousel-desc">{slide.caption}</p>
      </div>
    </div>
  );
}
