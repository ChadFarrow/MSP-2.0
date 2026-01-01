import { useState } from 'react';

export function InfoIcon({ text }: { text: string }) {
  const [show, setShow] = useState(false);

  return (
    <span className="info-icon-wrapper">
      <span
        className="info-icon"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
      >
        i
      </span>
      {show && <div className="info-tooltip">{text}</div>}
    </span>
  );
}
