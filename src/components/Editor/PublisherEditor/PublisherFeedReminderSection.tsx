import { Section } from '../../Section';

export function PublisherFeedReminderSection() {
  return (
    <Section title="Before Adding Catalog Feeds" icon="&#9888;">
      <div style={{
        backgroundColor: 'rgba(255, 153, 0, 0.1)',
        border: '1px solid rgba(255, 153, 0, 0.3)',
        borderRadius: '8px',
        padding: '16px'
      }}>
        <p style={{ margin: 0, marginBottom: '12px', fontWeight: 500 }}>
          Your publisher feed must be hosted and submitted to the Podcast Index before continuing.
        </p>
        <ol style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-secondary)' }}>
          <li style={{ marginBottom: '8px' }}>
            Use the <strong>Download Catalog XML</strong> section above to save your publisher feed
          </li>
          <li style={{ marginBottom: '8px' }}>
            Host the XML file on MSP or your own server (you'll need a stable URL)
          </li>
          <li>
            Submit the feed URL to{' '}
            <a
              href="https://podcastindex.org/add"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#ff9900' }}
            >
              podcastindex.org/add
            </a>
          </li>
        </ol>
      </div>
    </Section>
  );
}
