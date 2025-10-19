import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

let instance: Database.Database | null = null;

const resolveDatabasePath = () => {
  const configured = process.env.DATABASE_PATH;
  if (configured && configured.trim().length > 0) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), 'sitefactory.dev.db');
};

const ensureDirectory = (filePath: string) => {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
};

const applyMigrations = (database: Database.Database) => {
  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS __migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = new Set<string>(
    database
      .prepare('SELECT name FROM __migrations ORDER BY name ASC')
      .all()
      .map((row) => row.name as string)
  );

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    if (applied.has(file)) {
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    const runMigration = database.transaction(() => {
      database.exec(sql);
      database.prepare('INSERT INTO __migrations (name) VALUES (?)').run(file);
    });

    runMigration();
    console.info(`[migrations] applied ${file}`);
  }
};

export const getDatabase = (): Database.Database => {
  if (instance) {
    return instance;
  }

  const databasePath = resolveDatabasePath();
  ensureDirectory(databasePath);
  instance = new Database(databasePath);
  instance.pragma('journal_mode = WAL');
  applyMigrations(instance);

  return instance;
};
