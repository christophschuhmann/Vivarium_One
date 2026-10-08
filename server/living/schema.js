import {db} from '../db.js';
if(!db.prepare('PRAGMA table_info(worlds)').all().some(c=>c.name==='simulation_mode'))db.exec("ALTER TABLE worlds ADD COLUMN simulation_mode TEXT NOT NULL DEFAULT 'classic'");
db.exec(`
CREATE TABLE IF NOT EXISTS lw_worlds(world_id TEXT PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE,seed INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 0,seconds INTEGER NOT NULL DEFAULT 27000,rules TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lw_places(id TEXT PRIMARY KEY,world_id TEXT NOT NULL REFERENCES lw_worlds(world_id) ON DELETE CASCADE,parent_id TEXT,name TEXT NOT NULL,kind TEXT NOT NULL,purpose TEXT NOT NULL,asset_id TEXT,x REAL,y REAL,capacity INTEGER NOT NULL DEFAULT 20,anchored INTEGER NOT NULL DEFAULT 0,landmark INTEGER NOT NULL DEFAULT 0,affordances TEXT NOT NULL DEFAULT '[]');
CREATE INDEX IF NOT EXISTS lw_places_parent ON lw_places(world_id,parent_id);
CREATE TABLE IF NOT EXISTS lw_place_music(world_id TEXT NOT NULL REFERENCES lw_worlds(world_id) ON DELETE CASCADE,location_id TEXT PRIMARY KEY REFERENCES lw_places(id) ON DELETE CASCADE,music TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lw_edges(world_id TEXT NOT NULL REFERENCES lw_worlds(world_id) ON DELETE CASCADE,from_id TEXT,to_id TEXT,seconds INTEGER NOT NULL,PRIMARY KEY(world_id,from_id,to_id));
CREATE TABLE IF NOT EXISTS lw_sims(id TEXT PRIMARY KEY,world_id TEXT NOT NULL REFERENCES lw_worlds(world_id) ON DELETE CASCADE,household_id TEXT NOT NULL,name TEXT NOT NULL,age INTEGER NOT NULL,gender TEXT NOT NULL,asset_id TEXT,colour TEXT NOT NULL,anchored INTEGER NOT NULL DEFAULT 0,biography_mode TEXT NOT NULL DEFAULT 'procedural',biography TEXT NOT NULL,profile TEXT NOT NULL,state TEXT NOT NULL,location_id TEXT);
CREATE INDEX IF NOT EXISTS lw_sims_location ON lw_sims(world_id,location_id);
CREATE INDEX IF NOT EXISTS lw_sims_household ON lw_sims(world_id,household_id);
CREATE TABLE IF NOT EXISTS lw_relations(world_id TEXT NOT NULL REFERENCES lw_worlds(world_id) ON DELETE CASCADE,from_id TEXT,to_id TEXT,payload TEXT NOT NULL,PRIMARY KEY(world_id,from_id,to_id));
CREATE TABLE IF NOT EXISTS lw_beats(id TEXT PRIMARY KEY,world_id TEXT NOT NULL REFERENCES lw_worlds(world_id) ON DELETE CASCADE,version INTEGER NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,source TEXT NOT NULL,fields TEXT NOT NULL,story TEXT NOT NULL,changes TEXT NOT NULL,metrics TEXT NOT NULL,UNIQUE(world_id,version));
CREATE TABLE IF NOT EXISTS lw_events(id TEXT PRIMARY KEY,world_id TEXT NOT NULL REFERENCES lw_worlds(world_id) ON DELETE CASCADE,beat_id TEXT,start INTEGER NOT NULL,end INTEGER NOT NULL,location_id TEXT,type TEXT NOT NULL,participants TEXT NOT NULL,facts TEXT NOT NULL,description TEXT NOT NULL,source TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS lw_events_time ON lw_events(world_id,end,id);
CREATE TABLE IF NOT EXISTS lw_scene_lines(world_id TEXT NOT NULL REFERENCES lw_worlds(world_id) ON DELETE CASCADE,beat_id TEXT NOT NULL REFERENCES lw_beats(id) ON DELETE CASCADE,event_id TEXT NOT NULL REFERENCES lw_events(id) ON DELETE CASCADE,location_id TEXT NOT NULL,speaker TEXT NOT NULL,text TEXT NOT NULL,mode TEXT NOT NULL,emotion TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS lw_journal(sim_id TEXT NOT NULL REFERENCES lw_sims(id) ON DELETE CASCADE,event_id TEXT NOT NULL REFERENCES lw_events(id) ON DELETE CASCADE,observed_at INTEGER NOT NULL,channel TEXT NOT NULL,perception TEXT NOT NULL,interpretation TEXT NOT NULL,confidence REAL NOT NULL,PRIMARY KEY(sim_id,event_id));
CREATE INDEX IF NOT EXISTS lw_journal_holder ON lw_journal(sim_id,observed_at DESC,event_id);
CREATE INDEX IF NOT EXISTS lw_journal_cursor ON lw_journal(sim_id);
CREATE TABLE IF NOT EXISTS lw_anchor_audit(id INTEGER PRIMARY KEY,world_id TEXT NOT NULL REFERENCES lw_worlds(world_id) ON DELETE CASCADE,entity_id TEXT NOT NULL,kind TEXT NOT NULL,enabled INTEGER NOT NULL,version INTEGER NOT NULL);
`);
export {db};
// Durable personal memory index. It stores evidence references, never omniscient profiles.
db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS lw_memory USING fts5(sim_id UNINDEXED,event_id UNINDEXED,perception,interpretation,content='lw_journal',content_rowid='rowid',tokenize='unicode61');
CREATE TRIGGER IF NOT EXISTS lw_memory_insert AFTER INSERT ON lw_journal BEGIN INSERT INTO lw_memory(rowid,sim_id,event_id,perception,interpretation) VALUES(new.rowid,new.sim_id,new.event_id,new.perception,new.interpretation); END;
CREATE TRIGGER IF NOT EXISTS lw_memory_delete AFTER DELETE ON lw_journal BEGIN INSERT INTO lw_memory(lw_memory,rowid,sim_id,event_id,perception,interpretation) VALUES('delete',old.rowid,old.sim_id,old.event_id,old.perception,old.interpretation); END;
CREATE TRIGGER IF NOT EXISTS lw_memory_update AFTER UPDATE ON lw_journal BEGIN INSERT INTO lw_memory(lw_memory,rowid,sim_id,event_id,perception,interpretation) VALUES('delete',old.rowid,old.sim_id,old.event_id,old.perception,old.interpretation); INSERT INTO lw_memory(rowid,sim_id,event_id,perception,interpretation) VALUES(new.rowid,new.sim_id,new.event_id,new.perception,new.interpretation); END;`);
if(!db.prepare('SELECT 1 FROM lw_memory_docsize LIMIT 1').get()&&db.prepare('SELECT 1 FROM lw_journal LIMIT 1').get())db.exec("INSERT INTO lw_memory(lw_memory) VALUES ('rebuild')");
// Idempotent repair for existing residential facilities: residents must be able
// to wash at their actual home. No time, biography, journal or account is changed.
db.exec(`UPDATE lw_places SET affordances=json_insert(affordances,'$[#]','shower')
 WHERE (id GLOB '*_expanded_carehome_bath' OR id GLOB '*_expanded_shelter_bath')
 AND NOT EXISTS(SELECT 1 FROM json_each(lw_places.affordances) WHERE value='shower')`);
