import type { Project } from '../api';

type ProjectListProps = {
  projects: Project[];
  onRename: (project: Project) => Promise<void> | void;
  onDelete: (project: Project) => Promise<void> | void;
  pendingId: number | null;
};

const ProjectList = ({ projects, onRename, onDelete, pendingId }: ProjectListProps) => {
  if (projects.length === 0) {
    return <p>No projects yet. Create your first project above.</p>;
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {projects.map((project) => {
        const busy = pendingId === project.id;
        return (
          <li
            key={project.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: '1px solid #e5e7eb',
              borderRadius: '0.75rem',
              padding: '0.75rem 1rem'
            }}
          >
            <div>
              <strong>{project.name}</strong>
              <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                Updated {new Date(project.updated_at).toLocaleString()}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => onRename(project)}
                disabled={busy}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #2563eb',
                  backgroundColor: busy ? '#bfdbfe' : 'white',
                  color: '#1d4ed8',
                  cursor: busy ? 'not-allowed' : 'pointer'
                }}
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => onDelete(project)}
                disabled={busy}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #dc2626',
                  backgroundColor: busy ? '#fecaca' : '#dc2626',
                  color: 'white',
                  cursor: busy ? 'not-allowed' : 'pointer'
                }}
              >
                Delete
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default ProjectList;
