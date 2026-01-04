interface DeleteConfirmModalProps {
  feedId: string;
  title?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({ feedId, title, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Delete Feed</h2>
          <button className="modal-close" onClick={onCancel}>&times;</button>
        </div>
        <div className="modal-content">
          <p>Are you sure you want to delete this feed?</p>
          <p><strong>{title || 'Untitled Feed'}</strong></p>
          <p className="text-muted" style={{ fontSize: '0.9em', wordBreak: 'break-all' }}>
            ID: {feedId}
          </p>
          <p style={{ color: '#dc3545', marginTop: '1rem' }}>
            This action cannot be undone.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            style={{ backgroundColor: '#dc3545', borderColor: '#dc3545' }}
          >
            Delete Feed
          </button>
        </div>
      </div>
    </div>
  );
}
