import { useCallback, useEffect, useState } from 'react';
import { createProject, deleteProject, listProjects, type Project, updateProject } from '../api';
import ProjectForm from '../components/ProjectForm';
import ProjectList from '../components/ProjectList';

const ProjectsPage = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listProjects();
      setProjects(data);
    } catch (err) {
      console.error(err);
      setError('Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (name: string) => {
    try {
      setCreating(true);
      setError(null);
      const project = await createProject(name);
      setProjects((prev) => [...prev, project].sort((a, b) => a.id - b.id));
    } catch (err) {
      console.error(err);
      setError('Unable to create project.');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (project: Project) => {
    const newName = window.prompt('Rename project', project.name);
    if (newName === null) {
      return;
    }
    const trimmed = newName.trim();
    if (!trimmed || trimmed === project.name) {
      return;
    }

    try {
      setPendingId(project.id);
      setError(null);
      const updated = await updateProject(project.id, { name: trimmed });
      setProjects((prev) => prev.map((item) => (item.id === project.id ? updated : item)));
    } catch (err) {
      console.error(err);
      setError('Unable to rename project.');
    } finally {
      setPendingId(null);
    }
  };

  const handleDelete = async (project: Project) => {
    const confirmed = window.confirm(`Delete project "${project.name}"?`);
    if (!confirmed) {
      return;
    }

    try {
      setPendingId(project.id);
      setError(null);
      await deleteProject(project.id);
      setProjects((prev) => prev.filter((item) => item.id !== project.id));
    } catch (err) {
      console.error(err);
      setError('Unable to delete project.');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section>
      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: '#fee2e2',
            color: '#b91c1c',
            padding: '0.75rem 1rem',
            borderRadius: '0.75rem',
            marginBottom: '1rem'
          }}
        >
          {error}
        </div>
      )}

      <ProjectForm onSubmit={handleCreate} submitting={creating} />

      {loading ? (
        <p>Loading projects...</p>
      ) : (
        <ProjectList
          projects={projects}
          onRename={handleRename}
          onDelete={handleDelete}
          pendingId={pendingId}
        />
      )}
    </section>
  );
};

export default ProjectsPage;
