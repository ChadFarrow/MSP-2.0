import type { CSSProperties } from 'react';
import { Editor } from './Editor';
import { PublisherEditor } from './PublisherEditor';
import { ArtistPublishSection } from './ArtistPublishSection';

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 16px',
  margin: '24px 0 12px 0',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
};

const albumHeaderStyle: CSSProperties = {
  ...sectionHeaderStyle,
  marginTop: 0,
  backgroundColor: 'rgba(99, 102, 241, 0.1)',
  border: '1px solid rgba(99, 102, 241, 0.3)',
  color: 'var(--text-primary)',
};

const publisherHeaderStyle: CSSProperties = {
  ...sectionHeaderStyle,
  backgroundColor: 'rgba(139, 92, 246, 0.1)',
  border: '1px solid rgba(139, 92, 246, 0.3)',
  color: 'var(--text-primary)',
};

const subtitleStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 400,
  textTransform: 'none',
  letterSpacing: 'normal',
  color: 'var(--text-secondary)',
  marginLeft: '4px',
};

export function ArtistEditor() {
  return (
    <div className="main-content">
      <div className="editor-panel">
        <div style={albumHeaderStyle}>
          <span>🎵 Album</span>
          <span style={subtitleStyle}>— fields below go into your album RSS feed</span>
        </div>
        <Editor chromeless />

        <div style={publisherHeaderStyle}>
          <span>🏢 Publisher</span>
          <span style={subtitleStyle}>— fields below go into your publisher (label) RSS feed</span>
        </div>
        <PublisherEditor chromeless />

        <ArtistPublishSection />
      </div>
    </div>
  );
}
