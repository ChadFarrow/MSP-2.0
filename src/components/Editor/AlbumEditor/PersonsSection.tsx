import { useState } from 'react';
import type { Person, PersonRole, PersonGroup } from '../../../types/feed';
import { PERSON_GROUPS, PERSON_ROLES } from '../../../types/feed';
import { FIELD_INFO } from '../../../data/fieldInfo';
import { InfoIcon } from '../../InfoIcon';
import { BlossomFileUpload } from '../../BlossomFileUpload';

// Roles Reference Modal — full Podcasting 2.0 taxonomy
function RolesModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '900px',
        maxHeight: '80vh',
        overflow: 'auto',
        width: '90%'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>Podcasting 2.0 Roles Reference</h2>
          <button onClick={onClose} className="btn btn-icon" style={{ fontSize: '20px' }}>&times;</button>
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Full list of groups and roles from the Podcasting 2.0 taxonomy, plus custom music roles.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
          {PERSON_GROUPS.map(group => (
            <div key={group.value} style={{
              background: 'var(--bg-tertiary)',
              borderRadius: '8px',
              padding: '16px'
            }}>
              <h4 style={{ margin: '0 0 12px 0', color: 'var(--accent-primary)', fontSize: '14px', textTransform: 'uppercase' }}>
                {group.label}
              </h4>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {PERSON_ROLES[group.value].map(role => (
                  <li key={role.value} style={{ color: 'var(--text-primary)', padding: '4px 0', fontSize: '13px' }}>
                    {role.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface PersonsSectionProps {
  persons: Person[];
  onUpdatePerson: (index: number, person: Person) => void;
  onAddPerson: () => void;
  onRemovePerson: (index: number) => void;
  onUpdateRole: (personIndex: number, roleIndex: number, role: PersonRole) => void;
  onAddRole: (personIndex: number) => void;
  onRemoveRole: (personIndex: number, roleIndex: number) => void;
  /** Album-level shows the thumbnail preview column; track-level doesn't. */
  showThumbnailPreview?: boolean;
  /** Album-level shows the "View All Roles" button + modal; track-level doesn't. */
  showRolesModalButton?: boolean;
}

export function PersonsSection({
  persons,
  onUpdatePerson,
  onAddPerson,
  onRemovePerson,
  onUpdateRole,
  onAddRole,
  onRemoveRole,
  showThumbnailPreview = false,
  showRolesModalButton = false,
}: PersonsSectionProps) {
  const [showRolesModal, setShowRolesModal] = useState(false);

  return (
    <div className="repeatable-list">
      {persons.map((person, personIndex) => (
        <div key={personIndex} className="repeatable-item">
          <div className="repeatable-item-content">
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Name<InfoIcon text={FIELD_INFO.personName} /></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Person name"
                  value={person.name || ''}
                  onChange={e => onUpdatePerson(personIndex, { ...person, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Website<InfoIcon text={FIELD_INFO.personHref} /></label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://..."
                  value={person.href || ''}
                  onChange={e => onUpdatePerson(personIndex, { ...person, href: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Photo URL<InfoIcon text={FIELD_INFO.personImg} /></label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://..."
                  value={person.img || ''}
                  onChange={e => onUpdatePerson(personIndex, { ...person, img: e.target.value })}
                />
                <BlossomFileUpload accept="image/*" onUploaded={({ url }) => onUpdatePerson(personIndex, { ...person, img: url })} />
              </div>
              <div className="form-group">
                <label className="form-label">Nostr npub<InfoIcon text={FIELD_INFO.personNpub} /></label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="npub1..."
                  value={person.npub || ''}
                  onChange={e => onUpdatePerson(personIndex, { ...person, npub: e.target.value })}
                />
              </div>
            </div>

            {/* Two-column layout: Roles (left) + optional Thumbnail Preview (right) */}
            <div className="person-preview-container" style={{ marginTop: '16px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              {/* Left column: Roles section */}
              <div className="person-roles-section" style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Roles<InfoIcon text={FIELD_INFO.personRole} /></label>
                  {showRolesModalButton && (
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '14px', padding: '8px 16px' }}
                      onClick={() => setShowRolesModal(true)}
                    >
                      View All Roles
                    </button>
                  )}
                </div>
                <div className="person-roles-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                  {person.roles.map((role, roleIndex) => (
                    <div key={roleIndex} className="person-role-item" style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'var(--bg-tertiary)',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}>
                      <select
                        className="form-select"
                        style={{ minWidth: '180px', padding: '8px 12px', fontSize: '14px' }}
                        value={role.group}
                        onChange={e => {
                          const newGroup = e.target.value as PersonGroup;
                          const newRole = PERSON_ROLES[newGroup]?.[0]?.value || 'band';
                          onUpdateRole(personIndex, roleIndex, { group: newGroup, role: newRole });
                        }}
                      >
                        {PERSON_GROUPS.map(g => (
                          <option key={g.value} value={g.value}>{g.label}</option>
                        ))}
                      </select>
                      <select
                        className="form-select"
                        style={{ minWidth: '200px', padding: '8px 12px', fontSize: '14px' }}
                        value={role.role}
                        onChange={e => onUpdateRole(personIndex, roleIndex, { ...role, role: e.target.value })}
                      >
                        {(PERSON_ROLES[role.group] || PERSON_ROLES.music).map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      {person.roles.length > 1 && (
                        <button
                          className="btn btn-icon btn-danger"
                          style={{ padding: '6px 10px', fontSize: '14px', minWidth: 'auto' }}
                          onClick={() => onRemoveRole(personIndex, roleIndex)}
                          title="Remove role"
                        >
                          &#10005;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '4px 12px' }}
                  onClick={() => onAddRole(personIndex)}
                >
                  + Add Role
                </button>
              </div>
              {/* Right column: Thumbnail preview */}
              {showThumbnailPreview && (
                <div className="person-thumbnail-preview" style={{
                  width: '140px',
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <div style={{
                    width: '100%',
                    ...(!person.img && { aspectRatio: '1' }),
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {person.img ? (
                      <img
                        src={person.img}
                        alt={person.name || 'Person thumbnail'}
                        style={{ width: '100%', display: 'block' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        onLoad={(e) => { (e.target as HTMLImageElement).style.display = 'block'; }}
                      />
                    ) : (
                      <span style={{ fontSize: '48px', color: 'var(--text-muted)' }}>&#128100;</span>
                    )}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', width: '100%' }}>
                    {person.img ? 'Photo' : 'No photo'}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="repeatable-item-actions">
            <button
              className="btn btn-icon btn-danger"
              onClick={() => onRemovePerson(personIndex)}
            >
              &#10005;
            </button>
          </div>
        </div>
      ))}
      <button className="add-item-btn" onClick={onAddPerson}>
        + Add Person
      </button>
      {showRolesModalButton && <RolesModal isOpen={showRolesModal} onClose={() => setShowRolesModal(false)} />}
    </div>
  );
}
