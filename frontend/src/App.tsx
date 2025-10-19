import ProjectsPage from './pages/Projects';

const App = () => {
  return (
    <main style={{ margin: '0 auto', maxWidth: '720px', padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Projects</h1>
        <p style={{ color: '#555' }}>Manage your SiteFactory projects via the API.</p>
      </header>
      <ProjectsPage />
    </main>
  );
};

export default App;
