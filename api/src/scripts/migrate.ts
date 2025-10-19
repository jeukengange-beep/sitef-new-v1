import 'dotenv/config';
import { getDatabase } from '../db/connection';

const db = getDatabase();

console.log('Migrations executed successfully. Database located at', db.name);
