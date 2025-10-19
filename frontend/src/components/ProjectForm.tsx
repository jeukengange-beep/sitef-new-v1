import { FormEvent, useState } from 'react';

type ProjectFormProps = {
  onSubmit: (name: string) => Promise<void> | void;
  submitting: boolean;
};

const ProjectForm = ({ onSubmit, submitting }: ProjectFormProps) => {
  const [name, setName] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    await onSubmit(trimmed);
    setName('');
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
      <input
        aria-label="Project name"
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="New project name"
        disabled={submitting}
        style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #ccc' }}
      />
      <button
        type="submit"
        disabled={submitting || name.trim().length === 0}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: '0.5rem',
          border: 'none',
          backgroundColor: '#2563eb',
          color: 'white',
          cursor: submitting ? 'not-allowed' : 'pointer'
        }}
      >
        {submitting ? 'Adding...' : 'Add'}
      </button>
    </form>
  );
};

export default ProjectForm;
